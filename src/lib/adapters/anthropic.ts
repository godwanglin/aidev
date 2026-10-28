import crypto from "crypto";

export interface AnthropicDispatchParams {
  rawBody: string;
  parsedBody: any;
  targetBase: string;
  targetKey: string;
  activeProvider: string;
  activeConnectionId?: string | null;
  clientApiKeyId?: string | null;
  clientUserId?: string | null;
  clientUserEmail?: string | null;
  reasoningEffort?: string | null;
  rawHeaders?: Record<string, string> | null;
  reqPath: string;
  clientWantsStream: boolean;
}

/**
 * Extracts plain text from Anthropic content structure (string or array of text blocks).
 */
export function extractAnthropicText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (part?.type === "text") return part.text || "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * Fix missing tool responses in OpenAI messages list.
 * OpenAI requires that every assistant message with tool_calls must be immediately
 * followed by tool response messages for each tool_call id.
 */
export function fixMissingToolResponsesOpenAI(messages: any[]): void {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const toolCallIds = msg.tool_calls.map((tc: any) => tc.id).filter(Boolean);

      const respondedIds = new Set<string>();
      let insertPosition = i + 1;
      for (let j = i + 1; j < messages.length; j++) {
        const nextMsg = messages[j];
        if (nextMsg.role === "tool" && nextMsg.tool_call_id) {
          respondedIds.add(nextMsg.tool_call_id);
          insertPosition = j + 1;
        } else {
          break;
        }
      }

      const missingIds = toolCallIds.filter((id: string) => !respondedIds.has(id));
      if (missingIds.length > 0) {
        const missingResponses = missingIds.map((id: string) => ({
          role: "tool",
          tool_call_id: id,
          content: "[No response received]",
        }));
        messages.splice(insertPosition, 0, ...missingResponses);
        i = insertPosition + missingResponses.length - 1;
      }
    }
  }
}

/**
 * Ensures that any 'tool' message has a preceding assistant turn with matching tool_calls.
 * If orphaned tool messages exist (due to context truncation, timeout, or interrupted session),
 * they are safely downgraded to 'user' turns to prevent OpenAI / Codex HTTP 400 errors:
 * "No tool call found for function call output with call_id..."
 */
export function fixOrphanedToolResponsesOpenAI(messages: any[]): void {
  const validCallIds = new Set<string>();
  for (const m of messages) {
    if (m && m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc && tc.id) validCallIds.add(tc.id);
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m && m.role === "tool") {
      const id = m.tool_call_id;
      if (!id || !validCallIds.has(id)) {
        messages[i] = {
          role: "user",
          content: `[Tool Output${id ? ` (${id})` : ""}]:\n${typeof m.content === "string" ? m.content : JSON.stringify(m.content || "")}`,
        };
      }
    }
  }
}

/**
 * Converts Anthropic tools schema into standard OpenAI function tools format.
 */
export function convertAnthropicToolsToOpenAi(tools?: any[]): any[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool: any) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema || { type: "object", properties: {} },
    },
  }));
}

/**
 * Converts Anthropic tool_choice into OpenAI tool_choice format.
 */
export function convertAnthropicToolChoiceToOpenAi(choice?: any): any {
  if (!choice) return undefined;
  if (typeof choice === "string") return choice;
  if (choice.type === "auto") return "auto";
  if (choice.type === "any") return "required";
  if (choice.type === "tool" && choice.name) {
    return { type: "function", function: { name: choice.name } };
  }
  return undefined;
}

/**
 * Converts single Anthropic message into one or more OpenAI messages.
 */
export function convertClaudeMessage(msg: any): any[] {
  if (!msg) return [];
  const role = msg.role === "assistant" ? "assistant" : "user";

  if (typeof msg.content === "string") {
    return [{ role, content: msg.content }];
  }

  const rawBlocks = Array.isArray(msg.content)
    ? msg.content
    : msg.content && typeof msg.content === "object"
    ? [msg.content]
    : [];

  if (rawBlocks.length === 0) {
    return [{ role, content: "" }];
  }

  const textParts: string[] = [];
  const toolCalls: any[] = [];
  const toolResults: any[] = [];
  const images: any[] = [];

  for (const block of rawBlocks) {
    if (!block || typeof block !== "object") continue;

    if (block.type === "text") {
      if (block.text) textParts.push(block.text);
    } else if (block.type === "image") {
      if (block.source?.type === "base64" && block.source.data) {
        images.push({
          type: "image_url",
          image_url: {
            url: `data:${block.source.media_type || "image/png"};base64,${block.source.data}`,
          },
        });
      }
    } else if (block.type === "tool_use") {
      const toolId = block.id || `call_${Date.now()}`;
      const name = block.name || "";
      let args = "{}";
      if (typeof block.input === "string") {
        args = block.input;
      } else if (block.input && typeof block.input === "object") {
        try {
          args = JSON.stringify(block.input);
        } catch {
          args = "{}";
        }
      }
      toolCalls.push({
        id: toolId,
        type: "function",
        function: {
          name,
          arguments: args,
        },
      });
    } else if (block.type === "tool_result") {
      let resultContent = "";
      if (typeof block.content === "string") {
        resultContent = block.content;
      } else if (Array.isArray(block.content)) {
        const texts = block.content
          .filter((c: any) => c?.type === "text" && c.text)
          .map((c: any) => c.text);
        if (texts.length > 0) {
          resultContent = texts.join("\n");
        } else {
          const hasImage = block.content.some((c: any) => c?.type === "image");
          resultContent = hasImage ? "[Tool Image Result]" : JSON.stringify(block.content);
        }
      } else if (block.content !== undefined) {
        try {
          resultContent = JSON.stringify(block.content);
        } catch {
          resultContent = String(block.content);
        }
      }
      toolResults.push({
        role: "tool",
        tool_call_id: block.tool_use_id || block.id,
        content: resultContent,
      });
    }
  }

  // If message contains tool_result blocks (tool outputs returned by user turn):
  if (toolResults.length > 0) {
    const res: any[] = [...toolResults];
    if (textParts.length > 0 || images.length > 0) {
      if (images.length > 0) {
        res.push({
          role: "user",
          content: [
            ...textParts.map((t) => ({ type: "text", text: t })),
            ...images,
          ],
        });
      } else {
        res.push({
          role: "user",
          content: textParts.join("\n"),
        });
      }
    }
    return res;
  }

  // If assistant message contains tool_use:
  if (toolCalls.length > 0) {
    return [
      {
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("\n") : null,
        tool_calls: toolCalls,
      },
    ];
  }

  // Regular user / assistant message:
  if (images.length > 0) {
    return [
      {
        role,
        content: [
          ...textParts.map((t) => ({ type: "text", text: t })),
          ...images,
        ],
      },
    ];
  }

  return [
    {
      role,
      content: textParts.join("\n"),
    },
  ];
}

/**
 * Converts Anthropic messages & system parameter into standard OpenAI messages array.
 */
export function convertAnthropicToOpenAiMessages(parsedBody: any): any[] {
  const messages: any[] = [];

  // Handle system prompt
  if (parsedBody.system) {
    const systemText = extractAnthropicText(parsedBody.system);
    if (systemText.trim()) {
      messages.push({ role: "system", content: systemText.trim() });
    }
  }

  // Handle conversation messages
  if (Array.isArray(parsedBody.messages)) {
    for (const m of parsedBody.messages) {
      const converted = convertClaudeMessage(m);
      if (converted.length > 0) {
        messages.push(...converted);
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hello" });
  }

  // Ensure every tool_call in an assistant message has a matching tool response
  fixMissingToolResponsesOpenAI(messages);
  // Ensure every tool response has a valid preceding tool_call
  fixOrphanedToolResponsesOpenAI(messages);

  // If the conversation ends with an assistant message (e.g. assistant prefill in Anthropic),
  // OpenAI APIs require a user prompt to respond to, otherwise they return empty content or fail.
  if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
    messages.push({ role: "user", content: "Continue." });
  }

  return messages;
}

/**
 * Complete conversion of an Anthropic Messages request into an OpenAI Chat Completions payload.
 */
export function convertAnthropicToOpenAiPayload(
  parsedBody: any,
  targetModel: string,
  clientWantsStream: boolean,
  forcedReasoningEffort?: string
): any {
  const openAiMessages = convertAnthropicToOpenAiMessages(parsedBody);
  const openAiTools = convertAnthropicToolsToOpenAi(parsedBody.tools);
  const openAiToolChoice = convertAnthropicToolChoiceToOpenAi(parsedBody.tool_choice);

  const payload: any = {
    ...parsedBody,
    model: targetModel,
    messages: openAiMessages,
    stream: clientWantsStream,
  };

  delete payload.system;

  // Extract reasoning / thinking from Anthropic format into OpenAI format
  let detectedEffort: string | undefined = forcedReasoningEffort;
  if (forcedReasoningEffort === "none" || forcedReasoningEffort === "off") {
    detectedEffort = "none";
  } else if (!detectedEffort) {
    if (typeof parsedBody.output_config?.effort === "string") {
      detectedEffort = parsedBody.output_config.effort.toLowerCase();
    } else if (typeof parsedBody.effort === "string") {
      detectedEffort = parsedBody.effort.toLowerCase();
    } else if (typeof parsedBody.thinking?.effort === "string") {
      detectedEffort = parsedBody.thinking.effort.toLowerCase();
    } else if (typeof parsedBody.reasoning_effort === "string") {
      detectedEffort = parsedBody.reasoning_effort.toLowerCase();
    } else if (parsedBody.reasoning?.effort) {
      detectedEffort = String(parsedBody.reasoning.effort).toLowerCase();
    } else if (typeof parsedBody.thinking?.budget_tokens === "number") {
      const budget = parsedBody.thinking.budget_tokens;
      if (budget >= 16000) detectedEffort = "high";
      else if (budget >= 4000) detectedEffort = "medium";
      else if (budget > 0) detectedEffort = "low";
    } else if (parsedBody.thinking && (parsedBody.thinking.type === "enabled" || parsedBody.thinking.type === "adaptive")) {
      const tmLower = (targetModel || "").toLowerCase();
      if (tmLower.includes("-ultra") || tmLower.includes("-xhigh") || tmLower.includes("-max")) detectedEffort = "high";
      else if (tmLower.includes("-high") || tmLower.includes("-thinking")) detectedEffort = "high";
      else if (tmLower.includes("-medium")) detectedEffort = "medium";
      else if (tmLower.includes("-low") || tmLower.includes("-minimal") || tmLower.includes("-extra-low")) detectedEffort = "low";
      else detectedEffort = "medium";
    }

    // Model name fallback
    if (!detectedEffort && targetModel) {
      const tmLower = targetModel.toLowerCase();
      if (tmLower.includes("-high") || tmLower.includes("-ultra") || tmLower.includes("-thinking")) {
        detectedEffort = "high";
      } else if (tmLower.includes("-medium")) {
        detectedEffort = "medium";
      } else if (tmLower.includes("-low")) {
        detectedEffort = "low";
      }
    }
  }

  if (detectedEffort && detectedEffort !== "none" && detectedEffort !== "off") {
    payload.reasoning_effort = detectedEffort;
    payload.reasoning = { effort: detectedEffort };
  } else {
    delete payload.reasoning_effort;
    delete payload.reasoning;
  }

  // Strip Anthropic-specific fields from OpenAI payload
  delete payload.thinking;
  delete payload.output_config;
  delete payload.effort;

  if (openAiTools && openAiTools.length > 0) {
    payload.tools = openAiTools;
    if (openAiToolChoice) {
      payload.tool_choice = openAiToolChoice;
    }
  } else {
    delete payload.tools;
    delete payload.tool_choice;
  }

  // Ensure token headroom for reasoning
  const MIN_REASONING_HEADROOM = 16384;
  if (!payload.max_tokens || payload.max_tokens < MIN_REASONING_HEADROOM) {
    payload.max_tokens = MIN_REASONING_HEADROOM;
  }

  return payload;
}

/**
 * Dispatches an Anthropic Messages request (/v1/messages).
 * Retained for backward compatibility.
 */
export async function dispatchAnthropicMessages(params: AnthropicDispatchParams): Promise<Response> {
  const startTime = Date.now();
  const messageId = `msg_${Date.now()}`;
  const modelName = params.parsedBody.model || "claude-3-7-sonnet";
  const isNativeAnthropic = params.activeProvider === "ANTHROPIC" || params.activeProvider === "CLAUDE_CODE";

  // Native Anthropic API Key
  if (isNativeAnthropic && params.targetKey && !params.targetKey.startsWith("eyJ")) {
    const forwardHeaders = new Headers();
    forwardHeaders.set("x-api-key", params.targetKey);
    forwardHeaders.set("anthropic-version", "2023-06-01");
    forwardHeaders.set("Content-Type", "application/json");

    const targetUrl = `${params.targetBase.replace(/\/$/, "")}/messages`;
    return await fetch(targetUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: params.rawBody,
    });
  }

  // Cross-Protocol Translation to Gateway /v1/chat/completions
  const openAiPayload = convertAnthropicToOpenAiPayload(params.parsedBody, modelName, params.clientWantsStream);

  const internalChatUrl = "http://localhost:3000/v1/chat/completions";
  const chatHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.clientApiKeyId) {
    chatHeaders["Authorization"] = `Bearer ${params.targetKey}`;
  }

  const upstreamRes = await fetch(internalChatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer sk-int-testbench999900001111222233334444`,
    },
    body: JSON.stringify(openAiPayload),
  });

  return transformChatResponseToAnthropic(upstreamRes, {
    model: modelName,
    clientWantsStream: params.clientWantsStream,
  });
}

/**
 * Transforms an OpenAI chat completion Response (stream or JSON) into Anthropic Messages format Response.
 * Fully supports text deltas, reasoning/thinking blocks, streaming tool_calls, and usage metadata.
 */
export async function transformChatResponseToAnthropic(
  chatResponse: Response,
  params: {
    model: string;
    clientWantsStream: boolean;
    estimatedPromptTokens?: number;
  }
): Promise<Response> {
  const messageId = `msg_${Date.now()}`;
  const modelName = params.model;

  // Handle non-200 responses by converting error body to Anthropic error envelope
  if (!chatResponse.ok) {
    const errText = await chatResponse.text().catch(() => "");
    let errMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errJson.detail || errJson.message || errText;
    } catch {}

    const errorType =
      chatResponse.status === 401
        ? "authentication_error"
        : chatResponse.status === 429
        ? "rate_limit_error"
        : chatResponse.status === 400
        ? "invalid_request_error"
        : "api_error";

    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: errorType,
          message: errMsg || `Upstream returned HTTP ${chatResponse.status}`,
        },
      }),
      {
        status: chatResponse.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Case 1: Client wants Streaming (Anthropic SSE format)
  if (params.clientWantsStream && chatResponse.body) {
    let buffer = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let sentMessageStart = false;
    let actualMessageId = messageId;
    let nextBlockIndex = 0;

    let textBlockStarted = false;
    let textBlockIndex = -1;

    let thinkingBlockStarted = false;
    let thinkingBlockIndex = -1;

    // Track active tool calls: Map<toolIndex, { id, name, blockIndex, started, stopped } >
    const activeToolCalls = new Map<
      number,
      {
        id: string;
        name: string;
        blockIndex: number;
        started: boolean;
        stopped: boolean;
      }
    >();

    let messageDeltaSent = false;
    let finishReason: string | null = null;
    let promptTokens = params.estimatedPromptTokens || 20;
    let completionTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;
    let pingInterval: NodeJS.Timeout | null = null;
    let lastEventTime = Date.now();

    const emitEvent = (controller: TransformStreamDefaultController, eventType: string, data: any) => {
      lastEventTime = Date.now();
      const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(payload));
    };

    const emitPing = (controller: TransformStreamDefaultController) => {
      try {
        lastEventTime = Date.now();
        controller.enqueue(encoder.encode(`event: ping\ndata: {"type": "ping"}\n\n`));
      } catch {}
    };

    const stopThinkingBlock = (controller: TransformStreamDefaultController) => {
      if (thinkingBlockStarted) {
        emitEvent(controller, "content_block_stop", {
          type: "content_block_stop",
          index: thinkingBlockIndex,
        });
        thinkingBlockStarted = false;
      }
    };

    const stopTextBlock = (controller: TransformStreamDefaultController) => {
      if (textBlockStarted) {
        emitEvent(controller, "content_block_stop", {
          type: "content_block_stop",
          index: textBlockIndex,
        });
        textBlockStarted = false;
      }
    };

    const stopAllToolBlocks = (controller: TransformStreamDefaultController) => {
      for (const tool of activeToolCalls.values()) {
        if (tool.started && !tool.stopped) {
          emitEvent(controller, "content_block_stop", {
            type: "content_block_stop",
            index: tool.blockIndex,
          });
          tool.stopped = true;
        }
      }
    };

    const transformStream = new TransformStream({
      start(controller) {
        // Send periodic Anthropic ping events to prevent client timeout during model reasoning
        pingInterval = setInterval(() => {
          if (Date.now() - lastEventTime >= 7000) {
            emitPing(controller);
          }
        }, 5000);
      },
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith(":")) {
            // Forward keep-alive comments from upstream proxy as Anthropic ping
            if (Date.now() - lastEventTime >= 4000) {
              emitPing(controller);
            }
            continue;
          }
          if (!trimmed.startsWith("data: ")) continue;
          if (trimmed === "data: [DONE]") {
            stopThinkingBlock(controller);
            stopTextBlock(controller);
            stopAllToolBlocks(controller);

            if (sentMessageStart && !messageDeltaSent) {
              messageDeltaSent = true;
              let stopReason = "end_turn";
              if (
                finishReason === "tool_calls" ||
                finishReason === "function_call" ||
                activeToolCalls.size > 0
              ) {
                stopReason = "tool_use";
              } else if (finishReason === "length") {
                stopReason = "max_tokens";
              }

              emitEvent(controller, "message_delta", {
                type: "message_delta",
                delta: {
                  stop_reason: stopReason,
                  stop_sequence: null,
                },
                usage: {
                  input_tokens: promptTokens,
                  output_tokens: Math.max(1, completionTokens),
                  ...(cacheReadTokens > 0 ? { cache_read_input_tokens: cacheReadTokens } : {}),
                  ...(cacheCreationTokens > 0 ? { cache_creation_input_tokens: cacheCreationTokens } : {}),
                },
              });
              emitEvent(controller, "message_stop", { type: "message_stop" });
            }
            continue;
          }

          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.error) {
              const errMsg = data.error.message || "Upstream returned error";
              emitEvent(controller, "error", {
                type: "error",
                error: {
                  type: "api_error",
                  message: errMsg,
                },
              });
              return;
            }
            const choice = data.choices?.[0];
            const delta = choice?.delta;

            if (data.id && actualMessageId === messageId) {
              const cleanId = String(data.id).replace(/^chatcmpl-/, "msg_");
              actualMessageId = cleanId.startsWith("msg_") ? cleanId : `msg_${cleanId}`;
            }

            if (data.usage) {
              promptTokens = data.usage.prompt_tokens || data.usage.input_tokens || promptTokens;
              completionTokens = data.usage.completion_tokens || data.usage.output_tokens || completionTokens;
              cacheReadTokens =
                data.usage.cache_read_input_tokens ||
                data.usage.prompt_cache_hit_tokens ||
                data.usage.prompt_tokens_details?.cached_tokens ||
                cacheReadTokens;
              cacheCreationTokens =
                data.usage.cache_creation_input_tokens ||
                data.usage.prompt_cache_write_tokens ||
                cacheCreationTokens;
            }

            // 1. First chunk - ALWAYS send message_start first
            if (!sentMessageStart) {
              sentMessageStart = true;
              emitEvent(controller, "message_start", {
                type: "message_start",
                message: {
                  id: actualMessageId,
                  type: "message",
                  role: "assistant",
                  content: [],
                  model: modelName,
                  stop_reason: null,
                  stop_sequence: null,
                  usage: {
                    input_tokens: promptTokens,
                    output_tokens: 1,
                  },
                },
              });
            }

            if (!delta && !choice?.finish_reason) continue;

            // 2. Handle Reasoning / Thinking delta
            const reasoningText = delta?.reasoning_content || delta?.reasoning;
            if (typeof reasoningText === "string" && reasoningText.length > 0) {
              stopTextBlock(controller);
              if (!thinkingBlockStarted) {
                thinkingBlockStarted = true;
                thinkingBlockIndex = nextBlockIndex++;
                emitEvent(controller, "content_block_start", {
                  type: "content_block_start",
                  index: thinkingBlockIndex,
                  content_block: { type: "thinking", thinking: "" },
                });
              }
              emitEvent(controller, "content_block_delta", {
                type: "content_block_delta",
                index: thinkingBlockIndex,
                delta: { type: "thinking_delta", thinking: reasoningText },
              });
              completionTokens += Math.ceil(reasoningText.length / 3.5);
            }

            // 3. Handle Regular Text delta
            if (typeof delta?.content === "string" && delta.content.length > 0) {
              stopThinkingBlock(controller);
              if (!textBlockStarted) {
                textBlockStarted = true;
                textBlockIndex = nextBlockIndex++;
                emitEvent(controller, "content_block_start", {
                  type: "content_block_start",
                  index: textBlockIndex,
                  content_block: { type: "text", text: "" },
                });
              }
              emitEvent(controller, "content_block_delta", {
                type: "content_block_delta",
                index: textBlockIndex,
                delta: { type: "text_delta", text: delta.content },
              });
              completionTokens += Math.ceil(delta.content.length / 3.5);
            }

            // 4. Handle Tool Calls
            if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) {
              stopThinkingBlock(controller);
              stopTextBlock(controller);

              for (const tc of delta.tool_calls) {
                const idx = typeof tc.index === "number" ? tc.index : 0;
                let tool = activeToolCalls.get(idx);

                if (!tool) {
                  const toolBlockIndex = nextBlockIndex++;
                  const toolId = tc.id || `call_${Date.now()}_${idx}`;
                  const toolName = tc.function?.name || tc.name || "";
                  tool = {
                    id: toolId,
                    name: toolName,
                    blockIndex: toolBlockIndex,
                    started: false,
                    stopped: false,
                  };
                  activeToolCalls.set(idx, tool);
                }

                if (tc.id && !tool.id) tool.id = tc.id;
                if (tc.function?.name && !tool.name) tool.name = tc.function.name;

                if (!tool.started) {
                  tool.started = true;
                  emitEvent(controller, "content_block_start", {
                    type: "content_block_start",
                    index: tool.blockIndex,
                    content_block: {
                      type: "tool_use",
                      id: tool.id,
                      name: tool.name,
                      input: {},
                    },
                  });
                }

                const argChunk = tc.function?.arguments;
                if (typeof argChunk === "string" && argChunk.length > 0) {
                  completionTokens += Math.ceil(argChunk.length / 3.5);
                  emitEvent(controller, "content_block_delta", {
                    type: "content_block_delta",
                    index: tool.blockIndex,
                    delta: {
                      type: "input_json_delta",
                      partial_json: argChunk,
                    },
                  });
                }
              }
            }

            // 5. Handle Finish Reason (defer message_delta until [DONE] or flush so trailing usage chunk is captured)
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
              stopThinkingBlock(controller);
              stopTextBlock(controller);
              stopAllToolBlocks(controller);
            }
          } catch {}
        }
      },
      flush(controller) {
        if (!sentMessageStart) {
          sentMessageStart = true;
          emitEvent(controller, "message_start", {
            type: "message_start",
            message: {
              id: actualMessageId,
              type: "message",
              role: "assistant",
              content: [],
              model: modelName,
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: promptTokens, output_tokens: 1 },
            },
          });
          emitEvent(controller, "content_block_start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          });
          emitEvent(controller, "content_block_stop", {
            type: "content_block_stop",
            index: 0,
          });
        }

        stopThinkingBlock(controller);
        stopTextBlock(controller);
        stopAllToolBlocks(controller);

        if (!messageDeltaSent) {
          messageDeltaSent = true;
          let stopReason = "end_turn";
          if (activeToolCalls.size > 0 || finishReason === "tool_calls") {
            stopReason = "tool_use";
          } else if (finishReason === "length") {
            stopReason = "max_tokens";
          }

          emitEvent(controller, "message_delta", {
            type: "message_delta",
            delta: {
              stop_reason: stopReason,
              stop_sequence: null,
            },
            usage: {
              input_tokens: promptTokens,
              output_tokens: Math.max(1, completionTokens),
              ...(cacheReadTokens > 0 ? { cache_read_input_tokens: cacheReadTokens } : {}),
              ...(cacheCreationTokens > 0 ? { cache_creation_input_tokens: cacheCreationTokens } : {}),
            },
          });
          emitEvent(controller, "message_stop", { type: "message_stop" });
        }

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
      },
    });

    return new Response(chatResponse.body.pipeThrough(transformStream), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Case 2: Non-streaming JSON response
  const rawText = await chatResponse.text();
  const contentList: any[] = [];
  let promptTokens = params.estimatedPromptTokens || 20;
  let completionTokens = 25;
  let stopReason = "end_turn";
  let actualMessageId = messageId;

  try {
    const chatJson = JSON.parse(rawText);
    if (chatJson.id) {
      const cleanId = String(chatJson.id).replace(/^chatcmpl-/, "msg_");
      actualMessageId = cleanId.startsWith("msg_") ? cleanId : `msg_${cleanId}`;
    }

    if (chatJson.usage) {
      promptTokens = chatJson.usage.prompt_tokens || promptTokens;
      completionTokens = chatJson.usage.completion_tokens || completionTokens;
    }

    const choice = chatJson.choices?.[0];
    const msg = choice?.message || {};

    if (msg.reasoning_content || msg.reasoning) {
      contentList.push({
        type: "thinking",
        thinking: msg.reasoning_content || msg.reasoning,
      });
    }

    if (typeof msg.content === "string" && msg.content) {
      contentList.push({
        type: "text",
        text: msg.content,
      });
    }

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        let inputObj = {};
        if (typeof tc.function?.arguments === "string") {
          try {
            inputObj = JSON.parse(tc.function.arguments);
          } catch {
            inputObj = {};
          }
        } else if (tc.function?.arguments && typeof tc.function.arguments === "object") {
          inputObj = tc.function.arguments;
        }
        contentList.push({
          type: "tool_use",
          id: tc.id || `call_${Date.now()}`,
          name: tc.function?.name || tc.name || "",
          input: inputObj,
        });
      }
    }

    if (
      choice?.finish_reason === "tool_calls" ||
      choice?.finish_reason === "function_call" ||
      (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0)
    ) {
      stopReason = "tool_use";
    } else if (choice?.finish_reason === "length") {
      stopReason = "max_tokens";
    }
  } catch {
    contentList.push({
      type: "text",
      text: rawText,
    });
  }

  if (contentList.length === 0) {
    contentList.push({ type: "text", text: "" });
  }

  return new Response(
    JSON.stringify({
      id: actualMessageId,
      type: "message",
      role: "assistant",
      content: contentList,
      model: modelName,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }
  );
}

/**
 * === CLAUDE CODE OAUTH CLOAKING ===
 * Spoofs official Claude Code client fingerprint so Anthropic allows access to
 * high-tier models (Opus 5.5, Sonnet 5.5, etc.) via Claude Code OAuth tokens.
 */
export function deriveClaudeUuid(seed: string): string {
  const h = crypto.createHash("sha256").update(seed).digest("hex");
  return (
    h.slice(0, 8) + "-" +
    h.slice(8, 12) + "-4" +
    h.slice(13, 16) + "-" +
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) +
    h.slice(17, 20) + "-" +
    h.slice(20, 32)
  );
}

export function generateFakeClaudeUserId(sessionId: string, apiKey: string): string {
  const deviceId = crypto.createHash("sha256").update(`device:${apiKey}`).digest("hex");
  const accountUuid = deriveClaudeUuid(`account:${apiKey}`);
  return JSON.stringify({ device_id: deviceId, account_uuid: accountUuid, session_id: sessionId });
}

export function generateClaudeBillingHeader(payload: any, version = "2.1.280"): string {
  const content = JSON.stringify(payload);
  const cch = crypto.createHash("sha256").update(content).digest("hex").slice(0, 5);
  const buildHash = crypto.randomBytes(2).toString("hex").slice(0, 3);
  return `x-anthropic-billing-header: cc_version=${version}.${buildHash}; cc_entrypoint=sdk-cli; cch=${cch};`;
}

export function applyClaudeCodeCloaking(body: any, apiKey: string, sessionId: string): any {
  if (!apiKey || !apiKey.includes("sk-ant-oat")) return body;

  const result = { ...body };

  // Inject billing header as system[0]
  const billingText = generateClaudeBillingHeader(body, "2.1.280");
  const billingBlock = { type: "text", text: billingText };

  if (Array.isArray(result.system)) {
    if (!result.system[0]?.text?.startsWith("x-anthropic-billing-header:")) {
      result.system = [billingBlock, ...result.system];
    }
  } else if (typeof result.system === "string") {
    result.system = [billingBlock, { type: "text", text: result.system }];
  } else {
    result.system = [billingBlock];
  }

  // Inject fake user ID into metadata
  if (!result.metadata?.user_id) {
    result.metadata = { ...result.metadata, user_id: generateFakeClaudeUserId(sessionId, apiKey) };
  }

  // Sanitize any tool schemas against top-level combinators
  if (Array.isArray(result.tools)) {
    result.tools = result.tools.map((t: any) => {
      if (!t || typeof t !== "object") return t;
      if (t.type && t.type !== "function" && t.type !== "custom") return t;
      return {
        ...t,
        input_schema: sanitizeAnthropicInputSchema(t.input_schema || t.parameters),
      };
    });
  }

  // Strip non-standard Anthropic fields
  delete result.effort;
  delete result.reasoning_effort;
  delete result.reasoning;
  delete result.output_config;

  return result;
}

/**
 * Recursively extracts properties and required fields from combinator branches (allOf, anyOf, oneOf).
 */
function extractPropertiesAndRequired(branch: any): { properties: Record<string, any>; required: string[] } {
  const props: Record<string, any> = {};
  const req: string[] = [];

  if (!branch || typeof branch !== "object" || Array.isArray(branch)) {
    return { properties: props, required: req };
  }

  if (branch.properties && typeof branch.properties === "object" && !Array.isArray(branch.properties)) {
    Object.assign(props, branch.properties);
  }

  if (Array.isArray(branch.required)) {
    for (const r of branch.required) {
      if (typeof r === "string" && !req.includes(r)) req.push(r);
    }
  }

  if (Array.isArray(branch.allOf)) {
    for (const sub of branch.allOf) {
      const res = extractPropertiesAndRequired(sub);
      Object.assign(props, res.properties);
      for (const r of res.required) {
        if (!req.includes(r)) req.push(r);
      }
    }
  }

  const subComb = branch.anyOf || branch.oneOf;
  if (Array.isArray(subComb)) {
    for (const sub of subComb) {
      if (sub && sub.type !== "null") {
        const res = extractPropertiesAndRequired(sub);
        Object.assign(props, res.properties);
      }
    }
  }

  return { properties: props, required: req };
}

/**
 * Sanitizes and normalizes tool input schemas for Anthropic Messages API.
 * Anthropic strictly rejects top-level combinators: "input_schema does not support oneOf, allOf, or anyOf at the top level".
 * It also requires top-level type: "object", valid properties dict, and valid required list.
 */
export function sanitizeAnthropicInputSchema(rawSchema: any): Record<string, any> {
  if (!rawSchema || typeof rawSchema !== "object" || Array.isArray(rawSchema)) {
    return { type: "object", properties: {} };
  }

  let schema: Record<string, any>;
  try {
    schema = JSON.parse(JSON.stringify(rawSchema));
  } catch {
    schema = { ...rawSchema };
  }

  // 1. Process top-level allOf: merge properties and required from all parts
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const mergedProps: Record<string, any> = {};
    const mergedReq: string[] = [];

    for (const item of schema.allOf) {
      const res = extractPropertiesAndRequired(item);
      Object.assign(mergedProps, res.properties);
      for (const r of res.required) {
        if (!mergedReq.includes(r)) mergedReq.push(r);
      }
    }

    schema.properties = { ...mergedProps, ...(schema.properties || {}) };
    if (mergedReq.length > 0 || Array.isArray(schema.required)) {
      schema.required = Array.from(new Set([...(schema.required || []), ...mergedReq]));
    }
    delete schema.allOf;
  }

  // 2. Process top-level anyOf / oneOf
  const combinator = schema.anyOf || schema.oneOf;
  if (Array.isArray(combinator) && combinator.length > 0) {
    const nonNullVariants = combinator.filter(
      (v: any) => v && typeof v === "object" && v.type !== "null"
    );

    if (nonNullVariants.length > 0) {
      const mergedProps: Record<string, any> = {};
      const variantReqLists: string[][] = [];

      for (const variant of nonNullVariants) {
        const res = extractPropertiesAndRequired(variant);
        Object.assign(mergedProps, res.properties);
        if (res.required.length > 0) {
          variantReqLists.push(res.required);
        }
      }

      schema.properties = { ...mergedProps, ...(schema.properties || {}) };

      // For required: if all variants define required fields, take intersection
      if (variantReqLists.length === nonNullVariants.length && variantReqLists.length > 0) {
        const commonReq = variantReqLists[0].filter((k) =>
          variantReqLists.every((list) => list.includes(k))
        );
        if (commonReq.length > 0 || Array.isArray(schema.required)) {
          schema.required = Array.from(new Set([...(schema.required || []), ...commonReq]));
        }
      }

      if (!schema.description && nonNullVariants[0]?.description) {
        schema.description = nonNullVariants[0].description;
      }
    }

    delete schema.anyOf;
    delete schema.oneOf;
  }

  // 3. Ensure top-level type is strictly "object"
  schema.type = "object";

  // 4. Ensure properties is a plain object
  if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    schema.properties = {};
  }

  // 5. Clean up required array (must only contain keys present in properties)
  if (Array.isArray(schema.required)) {
    const validRequired = schema.required.filter(
      (k: any) => typeof k === "string" && Object.prototype.hasOwnProperty.call(schema.properties, k)
    );
    if (validRequired.length > 0) {
      schema.required = validRequired;
    } else {
      delete schema.required;
    }
  } else {
    delete schema.required;
  }

  // 6. Delete forbidden root-level keywords
  delete schema.anyOf;
  delete schema.oneOf;
  delete schema.allOf;
  delete schema["$schema"];
  delete schema["$id"];

  return schema;
}

/**
 * Normalizes tool_choice for Anthropic Messages API.
 * Models with thinking or without forcedToolChoice support (e.g. claude-opus-5-5, claude-sonnet-5-5, or when thinking is active)
 * strictly reject type: "tool" and "any" with HTTP 400.
 * In those cases, tool_choice is safely converted to { type: "auto" } and a system instruction is injected.
 */
export function normalizeAnthropicToolChoice(
  toolChoice: any,
  targetModel: string,
  hasThinking = false
): { normalizedChoice: any; systemGuidance?: string } {
  if (!toolChoice) return { normalizedChoice: undefined };

  let choice = toolChoice;
  if (typeof choice === "string") {
    if (choice === "auto") choice = { type: "auto" };
    else if (choice === "required") choice = { type: "any" };
    else if (choice === "none") return { normalizedChoice: undefined };
    else choice = { type: "auto" };
  } else if (typeof choice === "object" && choice.type === "function" && choice.function?.name) {
    choice = { type: "tool", name: choice.function.name };
  }

  const modelLower = (targetModel || "").toLowerCase();
  const forbidsForced =
    hasThinking ||
    modelLower.includes("5-5") ||
    modelLower.includes("5.5") ||
    modelLower.includes("opus-5") ||
    modelLower.includes("sonnet-5") ||
    modelLower.includes("thinking");

  if (forbidsForced && (choice.type === "any" || choice.type === "tool")) {
    const forcedToolName = choice.type === "tool" ? choice.name : null;
    const guidance = forcedToolName
      ? `You must call the tool '${forcedToolName}' to complete this user request.`
      : `You must call an appropriate tool from the provided tools to complete this user request.`;

    const normalized: Record<string, any> = { type: "auto" };
    if (choice.disable_parallel_tool_use !== undefined) {
      normalized.disable_parallel_tool_use = choice.disable_parallel_tool_use;
    }

    return {
      normalizedChoice: normalized,
      systemGuidance: guidance,
    };
  }

  return { normalizedChoice: choice };
}

/**
 * Converts standard OpenAI Chat Completion request payload into Anthropic Messages format.
 */
export function convertOpenAiToAnthropicPayload(
  openAiBody: any,
  targetModel: string,
  stream = false
): any {
  const cleanModel = (targetModel || "").replace(/^(cc\/|claude\/|anthropic\/)/i, "").trim() || "claude-3-7-sonnet-20250219";
  const maxTokens = openAiBody.max_tokens || openAiBody.max_completion_tokens || 4096;

  const result: any = {
    model: cleanModel,
    max_tokens: maxTokens,
    stream: Boolean(stream || openAiBody.stream),
  };

  if (typeof openAiBody.temperature === "number") {
    result.temperature = openAiBody.temperature;
  }

  const systemParts: string[] = [];
  const messages: any[] = [];

  if (Array.isArray(openAiBody.messages)) {
    // 1. Extract system / developer messages
    for (const msg of openAiBody.messages) {
      if (msg.role === "system" || msg.role === "developer") {
        if (typeof msg.content === "string") {
          systemParts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          const text = msg.content
            .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
            .filter(Boolean)
            .join("\n");
          if (text) systemParts.push(text);
        }
      }
    }

    if (systemParts.length > 0) {
      result.system = [{ type: "text", text: systemParts.join("\n\n") }];
    }

    // 2. Process non-system messages
    const nonSystem = openAiBody.messages.filter(
      (m: any) => m.role !== "system" && m.role !== "developer"
    );

    let currentRole: string | null = null;
    let currentBlocks: any[] = [];

    const flush = () => {
      if (currentRole && currentBlocks.length > 0) {
        messages.push({ role: currentRole, content: currentBlocks });
        currentBlocks = [];
      }
    };

    for (const msg of nonSystem) {
      if (msg.role === "tool") {
        flush();
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id,
              content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || ""),
            },
          ],
        });
        currentRole = null;
        continue;
      }

      const role = msg.role === "assistant" ? "assistant" : "user";
      const blocks: any[] = [];

      // Text / multimodal content
      if (typeof msg.content === "string") {
        if (msg.content) blocks.push({ type: "text", text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text" && part.text) {
            blocks.push({ type: "text", text: part.text });
          } else if (part.type === "image_url" && part.image_url?.url) {
            const url: string = part.image_url.url;
            if (url.startsWith("data:")) {
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                blocks.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: match[1],
                    data: match[2],
                  },
                });
              }
            }
          }
        }
      }

      // Assistant tool calls
      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          let inputObj = {};
          if (typeof tc.function?.arguments === "string") {
            try {
              inputObj = JSON.parse(tc.function.arguments);
            } catch {
              inputObj = {};
            }
          } else if (tc.function?.arguments && typeof tc.function.arguments === "object") {
            inputObj = tc.function.arguments;
          }
          blocks.push({
            type: "tool_use",
            id: tc.id || `call_${Date.now()}`,
            name: tc.function?.name || tc.name || "",
            input: inputObj,
          });
        }
      }

      if (blocks.length === 0) continue;

      if (currentRole !== role) {
        flush();
        currentRole = role;
      }
      currentBlocks.push(...blocks);
    }

    flush();
  }

  // Ensure conversation has at least one message
  if (messages.length === 0) {
    messages.push({ role: "user", content: [{ type: "text", text: "Hello" }] });
  }

  result.messages = messages;

  // 3. Convert tools
  if (Array.isArray(openAiBody.tools) && openAiBody.tools.length > 0) {
    result.tools = [];
    for (const t of openAiBody.tools) {
      if (!t || typeof t !== "object") continue;
      // Pass-through built-in server tools
      if (t.type && t.type !== "function") {
        result.tools.push(t);
        continue;
      }
      const toolData = t.function ?? t;
      if (!toolData.name) continue;
      result.tools.push({
        name: toolData.name,
        description: toolData.description || "",
        input_schema: sanitizeAnthropicInputSchema(toolData.parameters || toolData.input_schema),
      });
    }
  }

  // 4. Convert tool_choice
  if (openAiBody.tool_choice) {
    if (openAiBody.tool_choice === "none" || openAiBody.tool_choice?.type === "none") {
      delete result.tools;
      delete result.tool_choice;
    } else {
      const { normalizedChoice, systemGuidance } = normalizeAnthropicToolChoice(
        openAiBody.tool_choice,
        cleanModel,
        Boolean(result.thinking)
      );
      if (normalizedChoice) {
        result.tool_choice = normalizedChoice;
      } else {
        delete result.tool_choice;
      }
      if (systemGuidance) {
        if (!result.system) result.system = [];
        result.system.push({ type: "text", text: systemGuidance });
      }
    }
  }

  // Ensure tool_choice is removed if no tools exist
  if (!result.tools || result.tools.length === 0) {
    delete result.tools;
    delete result.tool_choice;
  }

  // 5. Convert reasoning_effort to Anthropic thinking
  const reasoningEffort = openAiBody.reasoning_effort || openAiBody.reasoning?.effort;
  if (reasoningEffort && reasoningEffort !== "none") {
    let budget = 8192;
    if (reasoningEffort === "high" || reasoningEffort === "xhigh" || reasoningEffort === "ultra" || reasoningEffort === "max") {
      budget = 16384;
    } else if (reasoningEffort === "low" || reasoningEffort === "minimal") {
      budget = 2048;
    }
    result.thinking = {
      type: "enabled",
      budget_tokens: budget,
    };
    if (result.max_tokens < budget + 4096) {
      result.max_tokens = budget + 4096;
    }
  } else if (cleanModel.includes("-high") || cleanModel.includes("-thinking")) {
    result.thinking = {
      type: "enabled",
      budget_tokens: 8192,
    };
    if (result.max_tokens < 12288) {
      result.max_tokens = 12288;
    }
  }

  return result;
}

/**
 * Transforms an Anthropic Messages Response (stream or JSON) into OpenAI Chat Completion Response.
 */
export async function transformAnthropicResponseToOpenAi(
  anthropicResponse: Response,
  options: {
    model: string;
    clientWantsStream: boolean;
  }
): Promise<Response> {
  const modelName = options.model;
  const created = Math.floor(Date.now() / 1000);

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text().catch(() => "");
    let errMsg = errText;
    let errType = "api_error";
    let errCode: any = anthropicResponse.status;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error) {
        errMsg = errJson.error.message || errMsg;
        errType = errJson.error.type || errType;
      }
    } catch {}

    return new Response(
      JSON.stringify({
        error: {
          message: errMsg || `Anthropic returned HTTP ${anthropicResponse.status}`,
          type: errType,
          code: errCode,
        },
      }),
      {
        status: anthropicResponse.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Case 1: Streaming SSE
  if (options.clientWantsStream && anthropicResponse.body) {
    let buffer = "";
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let messageId = `chatcmpl-${Date.now()}`;
    let roleSent = false;
    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason: string | null = null;
    let finishSent = false;

    // Track active tool call by block index
    const toolCallsMap = new Map<number, { index: number; id: string; name: string }>();
    let nextToolIndex = 0;

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith("data:")) {
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr || dataStr === "[DONE]") continue;

            try {
              const data = JSON.parse(dataStr);
              const eventType = data.type || currentEvent;

              if (eventType === "message_start") {
                if (data.message?.id) {
                  messageId = `chatcmpl-${data.message.id}`;
                }
                if (data.message?.usage) {
                  promptTokens =
                    (data.message.usage.input_tokens || 0) +
                    (data.message.usage.cache_read_input_tokens || 0) +
                    (data.message.usage.cache_creation_input_tokens || 0);
                }
                if (!roleSent) {
                  roleSent = true;
                  const firstChunk = {
                    id: messageId,
                    object: "chat.completion.chunk",
                    created,
                    model: modelName,
                    choices: [
                      {
                        index: 0,
                        delta: { role: "assistant", content: "" },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(firstChunk)}\n\n`));
                }
              } else if (eventType === "content_block_start") {
                const block = data.content_block;
                if (block?.type === "tool_use") {
                  const idx = nextToolIndex++;
                  toolCallsMap.set(data.index, { index: idx, id: block.id, name: block.name });
                  const toolStartChunk = {
                    id: messageId,
                    object: "chat.completion.chunk",
                    created,
                    model: modelName,
                    choices: [
                      {
                        index: 0,
                        delta: {
                          tool_calls: [
                            {
                              index: idx,
                              id: block.id,
                              type: "function",
                              function: { name: block.name, arguments: "" },
                            },
                          ],
                        },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolStartChunk)}\n\n`));
                }
              } else if (eventType === "content_block_delta") {
                const delta = data.delta;
                if (delta?.type === "text_delta" && delta.text) {
                  const textChunk = {
                    id: messageId,
                    object: "chat.completion.chunk",
                    created,
                    model: modelName,
                    choices: [
                      {
                        index: 0,
                        delta: { content: delta.text },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(textChunk)}\n\n`));
                } else if (delta?.type === "thinking_delta" && delta.thinking) {
                  const thinkingChunk = {
                    id: messageId,
                    object: "chat.completion.chunk",
                    created,
                    model: modelName,
                    choices: [
                      {
                        index: 0,
                        delta: { reasoning_content: delta.thinking },
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
                } else if (delta?.type === "input_json_delta" && delta.partial_json) {
                  const activeTool = toolCallsMap.get(data.index);
                  if (activeTool) {
                    const argChunk = {
                      id: messageId,
                      object: "chat.completion.chunk",
                      created,
                      model: modelName,
                      choices: [
                        {
                          index: 0,
                          delta: {
                            tool_calls: [
                              {
                                index: activeTool.index,
                                function: { arguments: delta.partial_json },
                              },
                            ],
                          },
                          finish_reason: null,
                        },
                      ],
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(argChunk)}\n\n`));
                  }
                }
              } else if (eventType === "message_delta") {
                if (data.usage?.output_tokens) {
                  completionTokens = data.usage.output_tokens;
                }
                if (data.delta?.stop_reason) {
                  finishReason =
                    data.delta.stop_reason === "tool_use"
                      ? "tool_calls"
                      : data.delta.stop_reason === "max_tokens"
                      ? "length"
                      : "stop";
                }
              } else if (eventType === "message_stop") {
                if (!finishSent) {
                  finishSent = true;
                  const finalChunk = {
                    id: messageId,
                    object: "chat.completion.chunk",
                    created,
                    model: modelName,
                    choices: [
                      {
                        index: 0,
                        delta: {},
                        finish_reason: finishReason || (toolCallsMap.size > 0 ? "tool_calls" : "stop"),
                      },
                    ],
                    usage: {
                      prompt_tokens: promptTokens,
                      completion_tokens: completionTokens,
                      total_tokens: promptTokens + completionTokens,
                    },
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                }
              }
            } catch {}
          }
        }
      },
      flush(controller) {
        if (!finishSent) {
          finishSent = true;
          const finalChunk = {
            id: messageId,
            object: "chat.completion.chunk",
            created,
            model: modelName,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: finishReason || "stop",
              },
            ],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        }
      },
    });

    const stream = anthropicResponse.body.pipeThrough(transformStream);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Case 2: Non-Streaming JSON
  const rawText = await anthropicResponse.text();
  try {
    const data = JSON.parse(rawText);
    let textContent = "";
    let reasoningContent = "";
    const toolCalls: any[] = [];

    if (Array.isArray(data.content)) {
      for (const part of data.content) {
        if (part.type === "text") {
          textContent += part.text || "";
        } else if (part.type === "thinking") {
          reasoningContent += part.thinking || "";
        } else if (part.type === "tool_use") {
          toolCalls.push({
            id: part.id,
            type: "function",
            function: {
              name: part.name,
              arguments: JSON.stringify(part.input || {}),
            },
          });
        }
      }
    }

    const stopReason =
      data.stop_reason === "tool_use"
        ? "tool_calls"
        : data.stop_reason === "max_tokens"
        ? "length"
        : "stop";

    const promptTokens =
      (data.usage?.input_tokens || 0) +
      (data.usage?.cache_read_input_tokens || 0) +
      (data.usage?.cache_creation_input_tokens || 0);
    const completionTokens = data.usage?.output_tokens || 0;

    const message: any = {
      role: "assistant",
      content: textContent || (toolCalls.length > 0 ? null : ""),
    };
    if (reasoningContent) {
      message.reasoning_content = reasoningContent;
    }
    if (toolCalls.length > 0) {
      message.tool_calls = toolCalls;
    }

    return new Response(
      JSON.stringify({
        id: `chatcmpl-${data.id || Date.now()}`,
        object: "chat.completion",
        created,
        model: modelName,
        choices: [
          {
            index: 0,
            message,
            finish_reason: stopReason,
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch {
    return new Response(rawText, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
