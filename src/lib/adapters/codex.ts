import { logUpstreamRequest, refreshConnectionOn401 } from "@/lib/router";
import { logRequest } from "@/lib/logger";
import { adminLogger } from "@/lib/admin-logger";

export const CODEX_RESPONSES_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";

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
 * Normalizes OpenAI model name for Codex backend.
 * Codex backend supports gpt-5.5, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, etc.
 */
function resolveCodexModel(rawModel: string): string {
  let clean = rawModel.replace(/^cx\//i, "").replace(/^codex\//i, "").trim();
  const lower = clean.toLowerCase();
  
  if (lower === "default" || lower === "default-model" || !clean) {
    return "gpt-5.5";
  }
  return clean;
}

/**
 * Converts OpenAI Chat messages into instructions and input array for Codex Responses API.
 */
function formatCodexPayload(parsedBody: any, targetModel: string) {
  const messages: any[] = Array.isArray(parsedBody.messages) ? parsedBody.messages : [];
  
  let instructions: string | undefined = undefined;
  const instructionParts: string[] = [];
  const input: Array<{ role: string; content: string }> = [];

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
    } else {
      input.push({
        role: m.role === "assistant" ? "assistant" : "user",
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

  return {
    model: targetModel,
    stream: true,
    store: false,
    ...(instructions ? { instructions } : {}),
    input,
  };
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
      originator: "codex_cli_rs",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };
    if (accountId) {
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
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Case 1: Client wants Streaming (OpenAI SSE format)
  if (params.clientWantsStream && response.body) {
    const upstreamBody = response.body;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let accumulatedText = "";

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

            if (data.type === "response.completed" && data.response?.usage) {
              promptTokens = data.response.usage.input_tokens || promptTokens;
              completionTokens = data.response.usage.output_tokens || completionTokens;
              totalTokens = data.response.usage.total_tokens || (promptTokens + completionTokens);
            }
          } catch {}
        }
      },
      flush(controller) {
        // Send final chunk with finish_reason: "stop" and [DONE]
        const finalChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: params.model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
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

      if (data.type === "response.completed" && data.response?.usage) {
        promptTokens = data.response.usage.input_tokens || promptTokens;
        completionTokens = data.response.usage.output_tokens || completionTokens;
        totalTokens = data.response.usage.total_tokens || (promptTokens + completionTokens);
      }
    } catch {}
  }

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
            content: accumulatedContent,
          },
          finish_reason: "stop",
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
// SSE error patterns inside 200-OK bodies
const CODEX_SSE_RETRY_PATTERNS = ["server_is_overloaded", "service_unavailable_error"];
const CODEX_SSE_ACCOUNT_FALLBACK_PATTERNS = ["selected model is at capacity", "model_at_capacity"];
const CODEX_SSE_USER_OUTPUT_PATTERNS = [
  "event: response.output_text.delta",
  "event: response.function_call_arguments.delta",
  '"type":"response.output_text.delta"',
  '"type":"response.function_call_arguments.delta"',
];
const CODEX_SSE_PEEK_BYTES = 64 * 1024;

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

// Peek first 64KB for transient SSE errors (e.g. 200 OK with "model at capacity")
async function peekSseTransientError(response: Response): Promise<{
  matched: string | null;
  message: string | null;
  replacementBody: ReadableStream<Uint8Array> | null;
}> {
  if (!response || !response.ok || !response.body) {
    return { matched: null, message: null, replacementBody: null };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let text = "";
  let matched: string | null = null;

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
      message: "Selected model is at capacity. Please try a different model.",
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

  return { matched: null, message: null, replacementBody };
}

export async function dispatchCodexResponsesDirect(params: CodexDispatchParams): Promise<Response> {
  const startTime = Date.now();
  const created = Math.floor(Date.now() / 1000);
  const targetModel = resolveCodexModel(params.model);
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

  // Include reasoning encrypted content for reasoning models
  if (codexBody.reasoning && codexBody.reasoning.effort && codexBody.reasoning.effort !== "none") {
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
      originator: "codex_cli_rs",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": "codex_cli_rs/0.154.0",
    };
    if (accountId) {
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
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Peek SSE stream for capacity / transient errors inside 200 OK
  const peek = await peekSseTransientError(response);
  if (peek.matched) {
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
        headers: { "Content-Type": "application/json" },
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
    let firstTokenTime: number | null = null;

    const responseModel = params.clientRequestedModel || params.model;
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk);
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
        const hasTokens = completionTokens > 0;
        const statusCode = (response.status === 200 && hasTokens) ? 200 : 502;

        if (statusCode === 200) {
          adminLogger.done({
            durationMs,
            ttftMs,
            promptTokens: promptTokens || 15,
            completionTokens: hasTokens ? completionTokens : 0,
            model: responseModel,
            upstreamModel: logModel,
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
          promptTokens: promptTokens || 15,
          completionTokens: hasTokens ? completionTokens : 0,
          totalTokens: hasTokens ? (promptTokens + completionTokens) : (promptTokens || 15),
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
            completionTokens: hasTokens ? completionTokens : 0,
            totalTokens: hasTokens ? (promptTokens + completionTokens) : (promptTokens || 15),
            creditsCost: statusCode >= 400 ? 0 : undefined,
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
      creditsCost: statusCode >= 400 ? 0 : undefined,
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

