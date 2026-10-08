import crypto from "crypto";
import { logUpstreamRequest, refreshConnectionOn401, markConnectionCooldown } from "@/lib/router";
import { logRequest } from "@/lib/logger";
import { adminLogger } from "@/lib/admin-logger";

export const CODEX_RESPONSES_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
export const CODEX_CLIENT_VERSION = "0.200.0";
export const CODEX_USER_AGENT = `codex_cli_rs/${CODEX_CLIENT_VERSION}`;
export const CODEX_ORIGINATOR = "codex_cli_rs";

export function isCodexProvider(provider?: string, authType?: string): boolean {
  if (!provider) return false;
  const p = provider.toUpperCase().trim();
  const isCodex = p === "OPENAI_CODEX" || p === "CODEX";
  return isCodex && (authType === "OAUTH" || !authType);
}

export interface CodexDispatchParams {
  rawBody: string;
  parsedBody: any;
  accessToken: string;
  connectionId: string;
  model: string;
  clientRequestedModel?: string;
  upstreamLogModel?: string;
  clientApiKeyId?: string | null;
  clientUserId?: string | null;
  clientUserEmail?: string | null;
  reasoningEffort?: string | null;
  rawHeaders?: any;
  reqPath: string;
  clientWantsStream: boolean;
}

/**
 * Extracts chatgpt_account_id from OAuth JWT payload if present.
 */
function extractAccountId(token: string): string | null {
  if (!token || !token.includes(".")) return null;
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      return payload["https://api.openai.com/auth"]?.chatgpt_account_id || null;
    }
  } catch {}
  return null;
}

/**
 * Normalizes OpenAI model name and infers reasoning effort for Codex backend.
 * Strips provider prefixes and suffixes like 'Ultra', 'High', 'Medium', 'Low'
 * Codex backend supports gpt-6.1-sol, gpt-5.5, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-6-astra, etc.
 */
export function resolveCodexModelAndEffort(rawModel: string): { model: string; inferredEffort?: string } {
  let clean = rawModel
    .replace(/^cx\//i, "")
    .replace(/^codex\//i, "")
    .replace(/^openai-codex\//i, "")
    .replace(/^openai\//i, "")
    .replace(/^stdprm\/cx\//i, "")
    .replace(/^stdprm\//i, "")
    .trim();
  const lower = clean.toLowerCase();

  let inferredEffort: string | undefined = undefined;
  if (
    lower.includes("extra high") ||
    lower.includes("extra-high") ||
    lower.includes("extra_high") ||
    lower.includes("xhigh") ||
    lower.includes("max")
  ) {
    inferredEffort = "xhigh";
  } else if (lower.includes("ultra")) {
    inferredEffort = "ultra";
  } else if (lower.includes("high")) {
    inferredEffort = "high";
  } else if (lower.includes("medium") || lower.includes("med")) {
    inferredEffort = "medium";
  } else if (lower.includes("low")) {
    inferredEffort = "low";
  }

  // Strip reasoning / size suffixes (e.g. "6.1 Sol Extra High" -> "6.1 sol")
  const baseModel = lower
    .replace(/[-_\s]+(extra[-_\s]high|extra[-_\s]low|ultra|xhigh|max|high|medium|med|low|none|thinking)$/i, "")
    .replace(/\[.*\]$/, "")
    .trim();

  if (baseModel === "default" || baseModel === "default-model" || !baseModel) {
    return { model: "gpt-5.5", inferredEffort };
  }
  if (
    baseModel === "gpt-6.1" ||
    baseModel === "gpt-6.1-sol" ||
    baseModel === "codex-6.1" ||
    baseModel === "codex-6.1-sol" ||
    baseModel === "codex 6.1 sol" ||
    baseModel === "codex 6.1" ||
    baseModel === "6.1-sol" ||
    baseModel === "6.1 sol" ||
    baseModel === "6.1"
  ) {
    return { model: "gpt-6.1-sol", inferredEffort };
  }
  if (baseModel === "gpt-6-astra" || baseModel === "6-astra" || baseModel === "astra") {
    return { model: "gpt-6-astra", inferredEffort };
  }
  if (baseModel === "gpt-6-sol" || baseModel === "6-sol") {
    return { model: "gpt-6-sol", inferredEffort };
  }
  if (baseModel === "gpt-6-luna" || baseModel === "6-luna") {
    return { model: "gpt-6-luna", inferredEffort };
  }
  if (baseModel === "gpt-5.6-sol" || baseModel === "5.6-sol") {
    return { model: "gpt-5.6-sol", inferredEffort };
  }
  if (baseModel === "gpt-5.6-terra" || baseModel === "5.6-terra") {
    return { model: "gpt-5.6-terra", inferredEffort };
  }
  if (baseModel === "gpt-5.6-luna" || baseModel === "5.6-luna") {
    return { model: "gpt-5.6-luna", inferredEffort };
  }
  if (baseModel === "gpt-5.5" || baseModel === "5.5") {
    return { model: "gpt-5.5", inferredEffort };
  }

  return { model: baseModel || clean, inferredEffort };
}

function resolveCodexModel(rawModel: string): string {
  return resolveCodexModelAndEffort(rawModel).model;
}

/**
 * Normalizes OpenAI Chat Completions tools into Codex Responses API tools format.
 */
function formatCodexTools(tools: any[]): any[] {
  if (!Array.isArray(tools)) return [];
  const result: any[] = [];
  for (const t of tools) {
    if (!t) continue;
    if (t.type === "function" || !t.type) {
      const fn = t.function || t;
      const name = fn.name || t.name;
      if (!name) continue;
      result.push({
        type: "function",
        name,
        description: fn.description || t.description || "",
        ...(fn.parameters || t.parameters ? { parameters: fn.parameters || t.parameters } : {}),
      });
    } else if (t.type === "custom") {
      result.push(t);
    }
  }
  return result;
}

/**
 * Converts OpenAI Chat messages into instructions and input array for Codex Responses API.
 */
function formatCodexPayload(parsedBody: any, targetModel: string) {
  const messages: any[] = Array.isArray(parsedBody.messages) ? parsedBody.messages : [];
  
  let instructions: string | undefined = undefined;
  const instructionParts: string[] = [];
  const input: Array<any> = [];

  for (const m of messages) {
    let content = "";
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .map((c: any) => (typeof c === "string" ? c : c.text || JSON.stringify(c)))
        .join("\n");
    }

    if (m.role === "system" || m.role === "developer") {
      if (content.trim()) {
        instructionParts.push(content.trim());
      }
    } else if (m.role === "tool") {
      const callId = m.tool_call_id || m.id || `call_${Date.now()}`;
      input.push({
        type: "function_call_output",
        call_id: callId,
        output: content || "",
      });
    } else if (m.role === "assistant") {
      if (content.trim()) {
        input.push({
          role: "assistant",
          content,
        });
      }
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        for (const tc of m.tool_calls) {
          const callId = tc.id || `call_${Date.now()}`;
          const fnName = tc.function?.name || tc.name || "";
          let args = tc.function?.arguments || tc.arguments || "{}";
          if (typeof args !== "string") {
            try { args = JSON.stringify(args); } catch { args = "{}"; }
          }
          input.push({
            type: "function_call",
            call_id: callId,
            name: fnName,
            arguments: args,
          });
        }
      } else if (!content.trim()) {
        input.push({
          role: "assistant",
          content: "",
        });
      }
    } else {
      input.push({
        role: "user",
        content: content || "",
      });
    }
  }

  if (instructionParts.length > 0) {
    instructions = instructionParts.join("\n\n");
  }

  // Ensure at least one input message exists
  if (input.length === 0) {
    input.push({ role: "user", content: "Hello" });
  }

  const codexTools = formatCodexTools(parsedBody.tools);

  let toolChoice = parsedBody.tool_choice;
  if (toolChoice && typeof toolChoice === "object") {
    if (toolChoice.type === "function" && toolChoice.function?.name) {
      toolChoice = {
        type: "function",
        name: toolChoice.function.name,
      };
    }
  }

  return {
    model: targetModel,
    stream: true,
    store: false,
    ...(instructions ? { instructions } : {}),
    input,
    ...(codexTools.length > 0 ? { tools: codexTools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };
}

// SSE error patterns inside 200-OK bodies
const CODEX_SSE_RETRY_PATTERNS = ["server_is_overloaded", "service_unavailable_error"];
const CODEX_SSE_ACCOUNT_FALLBACK_PATTERNS = ["selected model is at capacity", "model_at_capacity"];
const CODEX_SSE_USER_OUTPUT_PATTERNS = [
  "event: response.output_text.delta",
  "event: response.function_call_arguments.delta",
  '"type":"response.output_text.delta"',
  '"type":"response.function_call_arguments.delta"',
];
const CODEX_SSE_PEEK_BYTES = 256 * 1024; // 256 KB peek buffer to catch capacity errors even after large headers/tools

// Peek first 256KB for transient SSE errors (e.g. 200 OK with "model at capacity" or "server_is_overloaded")
async function peekSseTransientError(response: Response): Promise<{
  matched: string | null;
  message: string | null;
  accountFallback: boolean;
  replacementBody: ReadableStream<Uint8Array> | null;
}> {
  if (!response || !response.ok || !response.body) {
    return { matched: null, message: null, accountFallback: false, replacementBody: null };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let text = "";
  let matched: string | null = null;
  let accountFallback = false;

  try {
    while (text.length < CODEX_SSE_PEEK_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      text += decoder.decode(value, { stream: true });
      const lowerText = text.toLowerCase();

      const accountHit = CODEX_SSE_ACCOUNT_FALLBACK_PATTERNS.find((p) => lowerText.includes(p));
      if (accountHit) {
        matched = accountHit;
        accountFallback = true;
        break;
      }
      const retryHit = CODEX_SSE_RETRY_PATTERNS.find((p) => lowerText.includes(p));
      if (retryHit) {
        matched = retryHit;
        break;
      }
      if (CODEX_SSE_USER_OUTPUT_PATTERNS.some((p) => lowerText.includes(p))) {
        break;
      }
    }
  } catch {}

  if (matched) {
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
    return {
      matched,
      message: accountFallback
        ? "Selected model is at capacity. Please try a different model."
        : "Our servers are currently overloaded. Please try again later.",
      accountFallback,
      replacementBody: null,
    };
  }

  reader.releaseLock();

  const upstream = response.body;
  let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const replacementBody = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      upstreamReader = upstream.getReader();
    },
    async pull(controller) {
      try {
        const { done, value } = await upstreamReader!.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    cancel(reason) {
      try { upstreamReader?.cancel(reason); } catch {}
    },
  });

  return { matched: null, message: null, accountFallback: false, replacementBody };
}

/**
 * Dispatches a chat completion request to the OpenAI Codex backend (chatgpt.com/backend-api/codex/responses)
 * mimicking the official Codex CLI / 9Router mechanism.
 */
export async function dispatchCodexChat(params: CodexDispatchParams): Promise<Response> {
  const startTime = Date.now();
  const completionId = `chatcmpl-cx-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const targetModel = resolveCodexModel(params.model);
  const logModel = params.upstreamLogModel || params.model;

  const accountId = extractAccountId(params.accessToken);
  const codexBody = formatCodexPayload(params.parsedBody, targetModel);

  const getHeaders = (token: string): Record<string, string> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      originator: CODEX_ORIGINATOR,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": CODEX_USER_AGENT,
      version: CODEX_CLIENT_VERSION,
    };
    if (accountId) {
      headers["ChatGPT-Account-ID"] = accountId;
      headers["ChatGPT-Account-Id"] = accountId;
    }
    return headers;
  };

  let activeToken = params.accessToken;
  let response = await fetch(CODEX_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: getHeaders(activeToken),
    body: JSON.stringify(codexBody),
    signal: AbortSignal.timeout(300000),
  });

  // Handle 401 by refreshing token once
  if (response.status === 401 && params.connectionId) {
    try {
      activeToken = await refreshConnectionOn401(params.connectionId);
      response = await fetch(CODEX_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: getHeaders(activeToken),
        body: JSON.stringify(codexBody),
        signal: AbortSignal.timeout(300000),
      });
    } catch {}
  }

  if (!response.ok) {
    if (params.connectionId && (response.status === 401 || response.status === 429 || response.status >= 500)) {
      markConnectionCooldown(params.connectionId, response.status === 401 ? 3600 : 60);
    }

    const errText = await response.text();
    let errMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.detail || errJson.error?.message || errText;
    } catch {}

    logUpstreamRequest({
      connectionId: params.connectionId,
      provider: "OPENAI_CODEX",
      model: logModel,
      clientApiKeyId: params.clientApiKeyId,
      clientUserId: params.clientUserId,
      promptTokens: 15,
      completionTokens: 0,
      totalTokens: 15,
      latencyMs: Date.now() - startTime,
      statusCode: response.status,
      isFailover: false,
      failoverReason: `Codex upstream HTTP ${response.status}: ${errMsg.slice(0, 100)}`,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: {
          message: `[OpenAI Codex] ${errMsg}`,
          type: "upstream_error",
          code: response.status,
        },
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...(response.status === 401
            ? { "X-Aidev-Account-Fallback": "true", "X-Aidev-Transient-Error": "invalidated_token" }
            : {}),
        },
      }
    );
  }

  // Peek SSE stream for capacity / transient errors inside 200 OK
  const peek = await peekSseTransientError(response);
  if (peek.matched) {
    if (params.connectionId) {
      markConnectionCooldown(params.connectionId, 60);
    }

    logUpstreamRequest({
      connectionId: params.connectionId,
      provider: "OPENAI_CODEX",
      model: logModel,
      clientApiKeyId: params.clientApiKeyId,
      clientUserId: params.clientUserId,
      promptTokens: 15,
      completionTokens: 0,
      totalTokens: 15,
      latencyMs: Date.now() - startTime,
      statusCode: 503,
      isFailover: true,
      failoverReason: `Codex SSE transient error: ${peek.matched}`,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: {
          message: peek.message || "Selected model is at capacity. Please try a different model.",
          type: "server_error",
          code: "service_unavailable",
          account_fallback: peek.accountFallback,
        },
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "X-Aidev-Account-Fallback": peek.accountFallback ? "true" : "false",
          "X-Aidev-Transient-Error": peek.matched || "capacity",
        },
      }
    );
  }

  const effectiveBody = peek.replacementBody || response.body;

  // Case 1: Client wants Streaming (OpenAI SSE format)
  if (params.clientWantsStream && effectiveBody) {
    const upstreamBody = effectiveBody;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let accumulatedText = "";
    const activeToolCalls = new Map<string, { index: number; id: string; name: string; arguments: string }>();
    let nextToolIndex = 0;

    let buffer = "";

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));

            // 1. Text delta
            if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
              accumulatedText += data.delta;
              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: params.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: data.delta },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }

            // 2. Tool call added (start of function call)
            if (data.type === "response.output_item.added" && data.item?.type === "function_call") {
              const itemId = data.item.id;
              const callId = data.item.call_id || itemId;
              const name = data.item.name || "";
              const tIndex = nextToolIndex++;
              activeToolCalls.set(itemId, { index: tIndex, id: callId, name, arguments: "" });

              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: params.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: tIndex,
                          id: callId,
                          type: "function",
                          function: {
                            name,
                            arguments: "",
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }

            // 3. Function call argument delta
            if (data.type === "response.function_call_arguments.delta" && typeof data.delta === "string") {
              const itemId = data.item_id;
              let toolEntry = activeToolCalls.get(itemId);
              if (!toolEntry) {
                const tIndex = nextToolIndex++;
                toolEntry = { index: tIndex, id: itemId || `call_${Date.now()}`, name: "", arguments: "" };
                activeToolCalls.set(itemId, toolEntry);
              }
              toolEntry.arguments += data.delta;

              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: params.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: toolEntry.index,
                          function: {
                            arguments: data.delta,
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }

            // 4. Function call completed
            if (data.type === "response.output_item.done" && data.item?.type === "function_call") {
              const itemId = data.item.id;
              let toolEntry = activeToolCalls.get(itemId);
              if (!toolEntry) {
                const tIndex = nextToolIndex++;
                const callId = data.item.call_id || itemId;
                const name = data.item.name || "";
                const args = data.item.arguments || "";
                toolEntry = { index: tIndex, id: callId, name, arguments: args };
                activeToolCalls.set(itemId, toolEntry);

                const chunkPayload = {
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: params.model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: tIndex,
                            id: callId,
                            type: "function",
                            function: {
                              name,
                              arguments: args,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
              }
            }

            if (data.type === "response.completed" && data.response?.usage) {
              promptTokens = data.response.usage.input_tokens || promptTokens;
              completionTokens = data.response.usage.output_tokens || completionTokens;
              totalTokens = data.response.usage.total_tokens || (promptTokens + completionTokens);
            }
          } catch {}
        }
      },
      flush(controller) {
        const hasToolCalls = activeToolCalls.size > 0;
        const finalChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: params.model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: hasToolCalls ? "tool_calls" : "stop",
            },
          ],
        };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));

        const durationMs = Date.now() - startTime;
        logUpstreamRequest({
          connectionId: params.connectionId,
          provider: "OPENAI_CODEX",
          model: logModel,
          clientApiKeyId: params.clientApiKeyId,
          clientUserId: params.clientUserId,
          promptTokens: promptTokens || 15,
          completionTokens: completionTokens || 20,
          totalTokens: totalTokens || (promptTokens + completionTokens) || 35,
          latencyMs: durationMs,
          statusCode: 200,
          isFailover: false,
        }).catch(() => {});
      },
    });

    return new Response(upstreamBody.pipeThrough(transformStream), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Case 2: Client wants Non-Streaming (Standard OpenAI JSON)
  const rawText = await response.text();
  const durationMs = Date.now() - startTime;

  let accumulatedContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  const toolCallsMap = new Map<string, { id: string; name: string; arguments: string }>();

  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;

    try {
      const data = JSON.parse(trimmed.slice(6));

      if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
        accumulatedContent += data.delta;
      } else if (data.type === "response.output_text.done" && typeof data.text === "string") {
        if (!accumulatedContent) accumulatedContent = data.text;
      }

      if (data.type === "response.output_item.added" && data.item?.type === "function_call") {
        const id = data.item.id;
        toolCallsMap.set(id, {
          id: data.item.call_id || id,
          name: data.item.name || "",
          arguments: "",
        });
      }

      if (data.type === "response.function_call_arguments.delta" && typeof data.delta === "string") {
        const id = data.item_id;
        const entry = toolCallsMap.get(id);
        if (entry) {
          entry.arguments += data.delta;
        } else {
          toolCallsMap.set(id, {
            id,
            name: "",
            arguments: data.delta,
          });
        }
      }

      if (data.type === "response.output_item.done" && data.item?.type === "function_call") {
        const id = data.item.id;
        const entry = toolCallsMap.get(id);
        if (entry) {
          if (data.item.name) entry.name = data.item.name;
          if (data.item.arguments) entry.arguments = data.item.arguments;
        } else {
          toolCallsMap.set(id, {
            id: data.item.call_id || id,
            name: data.item.name || "",
            arguments: data.item.arguments || "",
          });
        }
      }

      if (data.type === "response.completed" && data.response?.usage) {
        promptTokens = data.response.usage.input_tokens || promptTokens;
        completionTokens = data.response.usage.output_tokens || completionTokens;
        totalTokens = data.response.usage.total_tokens || (promptTokens + completionTokens);
      }
    } catch {}
  }

  const finalToolCalls = Array.from(toolCallsMap.values()).map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: {
      name: tc.name,
      arguments: tc.arguments,
    },
  }));

  logUpstreamRequest({
    connectionId: params.connectionId,
    provider: "OPENAI_CODEX",
    model: logModel,
    clientApiKeyId: params.clientApiKeyId,
    clientUserId: params.clientUserId,
    promptTokens: promptTokens || 15,
    completionTokens: completionTokens || 20,
    totalTokens: totalTokens || (promptTokens + completionTokens) || 35,
    latencyMs: durationMs,
    statusCode: 200,
    isFailover: false,
  }).catch(() => {});

  return new Response(
    JSON.stringify({
      id: completionId,
      object: "chat.completion",
      created,
      model: params.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: accumulatedContent || (finalToolCalls.length > 0 ? null : ""),
            ...(finalToolCalls.length > 0 ? { tool_calls: finalToolCalls } : {}),
          },
          finish_reason: finalToolCalls.length > 0 ? "tool_calls" : "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens || 15,
        completion_tokens: completionTokens || 20,
        total_tokens: totalTokens || (promptTokens + completionTokens) || 35,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Direct native handler for POST /v1/responses targeting OpenAI Codex.
 * Passes through Responses API request directly to ChatGPT backend.
 */

// Server-generated item id prefixes that Codex /responses cannot resolve when store=false
const SERVER_ID_PATTERN = /^(rs|fc|resp|msg)_/;

// Allowlist of fields accepted by Codex Responses API - anything else is stripped
const RESPONSES_API_ALLOWLIST = new Set([
  "model", "input", "instructions", "tools", "tool_choice", "stream", "store",
  "reasoning", "service_tier", "include", "prompt_cache_key", "client_metadata",
  "text"
]);

// Convert role=system -> role=developer in body.input (keeps content in cacheable prefix)
function convertSystemToDeveloperRole(body: any) {
  if (!Array.isArray(body.input)) return;
  for (const item of body.input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const isSystemMsg = item.role === "system" && (!item.type || item.type === "message");
    if (isSystemMsg) item.role = "developer";
  }
}

// Strip server-generated item IDs (rs_/fc_/resp_/msg_) from input - avoids 404 with store=false
function stripStoredItemReferences(body: any) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item: any) => {
    if (typeof item === "string" && SERVER_ID_PATTERN.test(item)) return false;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      if (item.type === "item_reference") return false;
      if (typeof item.id === "string" && SERVER_ID_PATTERN.test(item.id)) delete item.id;
    }
    return true;
  });
}



export async function dispatchCodexResponsesDirect(params: CodexDispatchParams): Promise<Response> {
  const startTime = Date.now();
  const created = Math.floor(Date.now() / 1000);
  const resolved = resolveCodexModelAndEffort(params.model);
  const targetModel = resolved.model;
  const logModel = params.upstreamLogModel || params.model;
  const accountId = extractAccountId(params.accessToken);

  // Normalize input
  let formattedInput: any[] = [];
  if (typeof params.parsedBody.input === "string") {
    formattedInput = [{ role: "user", content: params.parsedBody.input }];
  } else if (Array.isArray(params.parsedBody.input)) {
    formattedInput = params.parsedBody.input.map((item: any) => {
      if (typeof item === "string") return { role: "user", content: item };
      return item;
    });
  } else {
    formattedInput = [{ role: "user", content: "Hello" }];
  }

  const codexBody: any = {
    ...params.parsedBody,
    model: targetModel,
    stream: true,
    store: false,
    input: formattedInput,
  };
  convertSystemToDeveloperRole(codexBody);
  stripStoredItemReferences(codexBody);

  // Auto-normalize custom tool formats for OpenAI Codex backend (only accepts { type: "text" })
  if (Array.isArray(codexBody.input)) {
    for (const item of codexBody.input) {
      if (item && item.type === "additional_tools" && Array.isArray(item.tools)) {
        for (const t of item.tools) {
          if (t && t.type === "custom") {
            if (t.format && typeof t.format === "object") {
              t.format = { type: "text" };
            }
          }
        }
      }
    }
  }
  // Auto-inject standard Codex tools if missing on follow-up turn (turn 2+)
  const hasToolsInInput = Array.isArray(codexBody.input) && codexBody.input.some((i: any) => i && i.type === "additional_tools" && Array.isArray(i.tools) && i.tools.length > 0);
  const hasTopTools = Array.isArray(codexBody.tools) && codexBody.tools.length > 0;
  if (!hasToolsInInput && !hasTopTools) {
    codexBody.tools = [
      {
        type: "custom",
        name: "apply_patch",
        description: "Apply changes to files or create files. Format: unified patch starting with '*** Begin Patch' and ending with '*** End Patch'.",
        format: { type: "text" },
      },
      {
        type: "custom",
        name: "exec",
        description: "Execute a shell command in the workspace environment.",
        format: { type: "text" },
      },
    ];
  }

  // Map fast service tier to priority as expected by OpenAI Codex backend
  if (codexBody.service_tier === "fast") {
    codexBody.service_tier = "priority";
  }

  // Apply reasoning effort if explicitly given or inferred from model name (e.g. 6.1 Sol Extra High)
  let effectiveEffort = params.reasoningEffort || codexBody.reasoning?.effort || resolved.inferredEffort;
  if (effectiveEffort === "max") {
    effectiveEffort = "xhigh";
  }
  if (effectiveEffort && effectiveEffort !== "none") {
    if (!codexBody.reasoning) codexBody.reasoning = {};
    codexBody.reasoning.effort = effectiveEffort;
    codexBody.include = ["reasoning.encrypted_content"];
  }

  // Remove unsupported parameters
  delete codexBody.temperature;
  delete codexBody.top_p;
  delete codexBody.frequency_penalty;
  delete codexBody.presence_penalty;
  delete codexBody.logprobs;
  delete codexBody.top_logprobs;
  delete codexBody.n;
  delete codexBody.seed;
  delete codexBody.max_tokens;
  delete codexBody.max_completion_tokens;
  delete codexBody.max_output_tokens;
  delete codexBody.user;
  delete codexBody.metadata;
  delete codexBody.stream_options;
  delete codexBody.previous_response_id;

  for (const k of Object.keys(codexBody)) {
    if (!RESPONSES_API_ALLOWLIST.has(k)) {
      delete codexBody[k];
    }
  }

  const getHeaders = (token: string): Record<string, string> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      originator: CODEX_ORIGINATOR,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": CODEX_USER_AGENT,
      version: CODEX_CLIENT_VERSION,
    };
    if (accountId) {
      headers["ChatGPT-Account-ID"] = accountId;
      headers["ChatGPT-Account-Id"] = accountId;
    }
    return headers;
  };

  let activeToken = params.accessToken;
  let response = await fetch(CODEX_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: getHeaders(activeToken),
    body: JSON.stringify(codexBody),
    signal: AbortSignal.timeout(300000),
  });

  if (response.status === 401 && params.connectionId) {
    try {
      activeToken = await refreshConnectionOn401(params.connectionId);
      response = await fetch(CODEX_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: getHeaders(activeToken),
        body: JSON.stringify(codexBody),
        signal: AbortSignal.timeout(300000),
      });
    } catch {}
  }

  if (!response.ok) {
    if (params.connectionId && (response.status === 401 || response.status === 429 || response.status >= 500)) {
      markConnectionCooldown(params.connectionId, response.status === 401 ? 3600 : 60);
    }

    const errText = await response.text();
    let errMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.detail || errJson.error?.message || errText;
    } catch {}

    adminLogger.error({
      message: `Codex error: ${errMsg.slice(0, 150)}`,
      durationMs: Date.now() - startTime,
      model: params.clientRequestedModel || params.model,
      upstreamModel: logModel,
      status: response.status,
    });

    logUpstreamRequest({
      connectionId: params.connectionId,
      provider: "OPENAI_CODEX",
      model: logModel,
      clientApiKeyId: params.clientApiKeyId,
      clientUserId: params.clientUserId,
      promptTokens: 15,
      completionTokens: 0,
      totalTokens: 15,
      latencyMs: Date.now() - startTime,
      statusCode: response.status,
      isFailover: false,
      failoverReason: `Codex Responses HTTP ${response.status}: ${errMsg.slice(0, 100)}`,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: {
          message: `[OpenAI Codex Responses] ${errMsg}`,
          type: "upstream_error",
          code: response.status,
        },
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...(response.status === 401
            ? { "X-Aidev-Account-Fallback": "true", "X-Aidev-Transient-Error": "invalidated_token" }
            : {}),
        },
      }
    );
  }

  // Peek SSE stream for capacity / transient errors inside 200 OK
  const peek = await peekSseTransientError(response);
  if (peek.matched) {
    if (params.connectionId) {
      markConnectionCooldown(params.connectionId, 60);
    }

    logUpstreamRequest({
      connectionId: params.connectionId,
      provider: "OPENAI_CODEX",
      model: logModel,
      clientApiKeyId: params.clientApiKeyId,
      clientUserId: params.clientUserId,
      promptTokens: 15,
      completionTokens: 0,
      totalTokens: 15,
      latencyMs: Date.now() - startTime,
      statusCode: 503,
      isFailover: true,
      failoverReason: `Codex SSE transient error: ${peek.matched}`,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: {
          message: peek.message || "Selected model is at capacity. Please try a different model.",
          type: "server_error",
          code: "service_unavailable",
        },
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "X-Aidev-Account-Fallback": peek.accountFallback ? "true" : "false",
          "X-Aidev-Transient-Error": peek.matched || "capacity",
        },
      }
    );
  }

  const effectiveBody = peek.replacementBody || response.body;

  // If client wants native SSE streaming: pass through the stream
  if (params.clientWantsStream && effectiveBody) {
    const upstreamBody = effectiveBody;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let buffer = "";
    let accumulatedChunks = "";
    let firstTokenTime: number | null = null;

    const responseModel = params.clientRequestedModel || params.model;
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const decoded = new TextDecoder().decode(chunk);
        if (accumulatedChunks.length < 50000) {
          accumulatedChunks += decoded;
        }
        buffer += decoded;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        const newLines = lines.map((line) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") return line;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (!firstTokenTime && (data.delta || data.type?.includes("delta") || data.item)) {
              firstTokenTime = Date.now();
            }
            let modified = false;
            if (data.response && responseModel && data.response.model !== responseModel) {
              data.response.model = responseModel;
              modified = true;
            }
            if (data.model && responseModel && data.model !== responseModel) {
              data.model = responseModel;
              modified = true;
            }
            if (data.type === "response.completed" && data.response?.usage) {
              promptTokens = data.response.usage.input_tokens || promptTokens;
              completionTokens = data.response.usage.output_tokens || completionTokens;
              totalTokens = data.response.usage.total_tokens || (promptTokens + completionTokens);
            }
            if (modified) {
              return "data: " + JSON.stringify(data);
            }
          } catch {}
          return line;
        });

        controller.enqueue(new TextEncoder().encode(newLines.join("\n") + (newLines.length > 0 ? "\n" : "")));
      },
      flush() {
        const durationMs = Date.now() - startTime;
        const ttftMs = firstTokenTime ? firstTokenTime - startTime : undefined;
        const hasStreamedContent = Boolean(firstTokenTime || accumulatedChunks.length > 0 || completionTokens > 0);
        const estimatedCompletion = completionTokens > 0 
          ? completionTokens 
          : hasStreamedContent 
          ? Math.max(1, Math.round(accumulatedChunks.length / 4)) 
          : 0;
        const finalTokens = hasStreamedContent ? estimatedCompletion : 0;
        const statusCode = (response.status === 200 && (hasStreamedContent || response.ok)) 
          ? 200 
          : (response.status >= 400 ? response.status : 502);

        if (statusCode === 200) {
          adminLogger.done({
            durationMs,
            ttftMs,
            promptTokens: promptTokens || 15,
            completionTokens: finalTokens,
            model: responseModel,
            upstreamModel: logModel,
            reasoningEffort: params.reasoningEffort || effectiveEffort,
          });
        } else {
          adminLogger.error({
            message: `Codex stream completed with status ${statusCode}`,
            durationMs,
            model: responseModel,
            upstreamModel: logModel,
          });
        }

        logUpstreamRequest({
          connectionId: params.connectionId,
          provider: "OPENAI_CODEX",
          model: logModel,
          clientApiKeyId: params.clientApiKeyId,
          clientUserId: params.clientUserId,
          clientUserEmail: params.clientUserEmail,
          reasoningEffort: params.reasoningEffort || effectiveEffort,
          rawHeaders: params.rawHeaders,
          rawBody: params.rawBody,
          rawResponse: accumulatedChunks,
          promptTokens: promptTokens || 15,
          completionTokens: finalTokens,
          totalTokens: (promptTokens || 15) + finalTokens,
          latencyMs: durationMs,
          statusCode,
          isFailover: false,
        }).catch(() => {});

        if (params.clientApiKeyId) {
          logRequest({
            apiKeyId: params.clientApiKeyId,
            path: params.reqPath,
            method: "POST",
            statusCode,
            model: responseModel,
            promptTokens: promptTokens || 15,
            completionTokens: finalTokens,
            totalTokens: (promptTokens || 15) + finalTokens,
            costUsd: statusCode >= 400 ? 0 : undefined,
            durationMs,
          });
        }
      },
    });

    return new Response(upstreamBody.pipeThrough(transformStream), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming JSON
  const rawText = await response.text();
  const durationMs = Date.now() - startTime;
  let accumulatedContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let responseId = `resp_${Date.now()}`;

  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;

    try {
      const data = JSON.parse(trimmed.slice(6));
      if (data.response?.id) responseId = data.response.id;

      if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
        accumulatedContent += data.delta;
      } else if (data.type === "response.output_text.done" && typeof data.text === "string") {
        if (!accumulatedContent) accumulatedContent = data.text;
      }

      if (data.type === "response.completed" && data.response?.usage) {
        promptTokens = data.response.usage.input_tokens || promptTokens;
        completionTokens = data.response.usage.output_tokens || completionTokens;
        totalTokens = data.response.usage.total_tokens || (promptTokens + completionTokens);
      }
    } catch {}
  }

  const hasTokens = completionTokens > 0 || accumulatedContent.length > 0;
  const statusCode = (response.status === 200 && hasTokens) ? 200 : 502;

  logUpstreamRequest({
    connectionId: params.connectionId,
    provider: "OPENAI_CODEX",
    model: logModel,
    clientApiKeyId: params.clientApiKeyId,
    clientUserId: params.clientUserId,
    clientUserEmail: params.clientUserEmail,
    reasoningEffort: params.reasoningEffort,
    rawHeaders: params.rawHeaders,
    rawBody: params.rawBody,
    rawResponse: accumulatedContent,
    promptTokens: promptTokens || 15,
    completionTokens: hasTokens ? (completionTokens || 20) : 0,
    totalTokens: hasTokens ? (totalTokens || (promptTokens + completionTokens) || 35) : (promptTokens || 15),
    latencyMs: durationMs,
    statusCode,
    isFailover: false,
  }).catch(() => {});

  if (params.clientApiKeyId) {
    logRequest({
      apiKeyId: params.clientApiKeyId,
      path: params.reqPath,
      method: "POST",
      statusCode,
      model: params.model,
      promptTokens: promptTokens || 15,
      completionTokens: hasTokens ? (completionTokens || 20) : 0,
      totalTokens: hasTokens ? (totalTokens || (promptTokens + completionTokens) || 35) : (promptTokens || 15),
      costUsd: statusCode >= 400 ? 0 : undefined,
      durationMs,
    });
  }

  if (statusCode === 200) {
    adminLogger.done({
      durationMs,
      promptTokens: promptTokens || 15,
      completionTokens: hasTokens ? (completionTokens || 20) : 0,
      model: params.clientRequestedModel || params.model,
      upstreamModel: logModel,
    });
  }

  return new Response(
    JSON.stringify({
      id: responseId,
      object: "response",
      created_at: created,
      status: "completed",
      model: params.model,
      output: [
        {
          id: `msg_${Date.now()}`,
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: accumulatedContent,
            },
          ],
        },
      ],
      usage: {
        input_tokens: promptTokens || 15,
        output_tokens: completionTokens || 20,
        total_tokens: totalTokens || (promptTokens + completionTokens) || 35,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export interface CodexImageParams {
  model: string;
  prompt: string;
  accessToken: string;
  connectionId?: string;
  size?: string;
  quality?: string;
  output_format?: string;
  n?: number;
}

export async function dispatchCodexImage(params: CodexImageParams): Promise<{ created: number; data: { b64_json: string }[] }> {
  let activeToken = params.accessToken;
  const accountId = extractAccountId(activeToken);

  let toolModel = params.model.replace(/^cx\//i, "").trim() || "gpt-image-2.5";
  if (!toolModel.includes("image")) {
    toolModel = "gpt-image-2.5";
  }

  const codexBody = {
    model: "gpt-5.5",
    instructions: "",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: params.prompt }],
      },
    ],
    tools: [
      {
        type: "image_generation",
        action: "generate",
        model: toolModel,
        output_format: (params.output_format || "png").toLowerCase(),
        ...(params.size ? { size: params.size } : {}),
        ...(params.quality ? { quality: params.quality } : {}),
      },
    ],
    tool_choice: { type: "image_generation" },
    parallel_tool_calls: false,
    prompt_cache_key: crypto.randomUUID(),
    stream: true,
    store: false,
    reasoning: { effort: "medium", summary: "auto" },
  };

  const getHeaders = (token: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    originator: CODEX_ORIGINATOR,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "User-Agent": CODEX_USER_AGENT,
    version: CODEX_CLIENT_VERSION,
    session_id: crypto.randomUUID(),
    "x-client-request-id": crypto.randomUUID(),
    ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
  });

  let response = await fetch(CODEX_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: getHeaders(activeToken),
    body: JSON.stringify(codexBody),
    signal: AbortSignal.timeout(120000),
  });

  if (response.status === 401 && params.connectionId) {
    try {
      activeToken = await refreshConnectionOn401(params.connectionId);
      response = await fetch(CODEX_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: getHeaders(activeToken),
        body: JSON.stringify(codexBody),
        signal: AbortSignal.timeout(120000),
      });
    } catch {}
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Codex image HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const text = await response.text();
  const lines = text.split("\n");
  let imageB64: string | null = null;

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const d = JSON.parse(line.slice(6));
        if (d.item?.type === "image_generation_call" && d.item.result) {
          imageB64 = d.item.result;
        }
      } catch {}
    }
  }

  if (!imageB64) {
    throw new Error("Codex did not return an image. Account may not be entitled (Plus/Pro required).");
  }

  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ b64_json: imageB64 }],
  };
}

