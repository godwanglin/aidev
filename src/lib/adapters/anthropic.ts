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
        resultContent = texts.length > 0 ? texts.join("\n") : JSON.stringify(block.content);
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

  return messages;
}

/**
 * Complete conversion of an Anthropic Messages request into an OpenAI Chat Completions payload.
 */
export function convertAnthropicToOpenAiPayload(
  parsedBody: any,
  targetModel: string,
  clientWantsStream: boolean
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
    let promptTokens = 20;
    let completionTokens = 0;

    const emitEvent = (controller: TransformStreamDefaultController, eventType: string, data: any) => {
      const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(payload));
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
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          if (trimmed === "data: [DONE]") {
            continue;
          }

          try {
            const data = JSON.parse(trimmed.slice(6));
            const choice = data.choices?.[0];
            const delta = choice?.delta;

            if (data.id && actualMessageId === messageId) {
              const cleanId = String(data.id).replace(/^chatcmpl-/, "msg_");
              actualMessageId = cleanId.startsWith("msg_") ? cleanId : `msg_${cleanId}`;
            }

            if (data.usage) {
              promptTokens = data.usage.prompt_tokens || promptTokens;
              completionTokens = data.usage.completion_tokens || completionTokens;
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

            // 5. Handle Finish Reason
            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
              stopThinkingBlock(controller);
              stopTextBlock(controller);
              stopAllToolBlocks(controller);

              if (!messageDeltaSent) {
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
                    output_tokens: Math.max(1, completionTokens),
                  },
                });
                emitEvent(controller, "message_stop", { type: "message_stop" });
              }
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
              output_tokens: Math.max(1, completionTokens),
            },
          });
          emitEvent(controller, "message_stop", { type: "message_stop" });
        }
      },
    });

    return new Response(chatResponse.body.pipeThrough(transformStream), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Case 2: Non-streaming JSON response
  const rawText = await chatResponse.text();
  const contentList: any[] = [];
  let promptTokens = 20;
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
