import crypto from "crypto";
import { logUpstreamRequest, refreshConnectionOn401, markConnectionCooldown } from "@/lib/router";
import { logRequest } from "@/lib/logger";
import { adminLogger } from "@/lib/admin-logger";
import { extractAnthropicText, fixMissingToolResponsesOpenAI, fixOrphanedToolResponsesOpenAI, sanitizeToolParameters } from "./anthropic";

export const GROK_CLI_RESPONSES_ENDPOINT = "https://cli-chat-proxy.grok.com/v1/responses";
export const GROK_CLI_VERSION = "1.0.44";
export const GROK_CLI_CLIENT_IDENTIFIER = "grok-shell";
export const GROK_CLI_USER_AGENT = `grok-shell/${GROK_CLI_VERSION} (linux; x86_64)`;

export function isGrokCliProvider(provider?: string): boolean {
  if (!provider) return false;
  const p = provider.toUpperCase().trim();
  return p === "GROK_CLI" || p === "GROK-CLI" || p === "GROK";
}

export interface GrokCliDispatchParams {
  rawBody: string;
  parsedBody: any;
  accessToken: string;
  connectionId: string;
  accountEmail?: string | null;
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
  estimatedPromptTokens?: number;
}

function stableUuid(seed: string): string {
  const h = crypto.createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function resolveGrokCliModel(rawModel: string): string {
  let clean = (rawModel || "grok-build")
    .replace(/^([a-z0-9_-]+\/)?(grok-cli|grok|xai)\//i, "")
    .trim();
  if (!clean || clean === "default" || clean === "default-model") {
    return "grok-build";
  }
  return clean;
}

export function supportsGrokCliReasoningEffort(model: string): boolean {
  return /^grok-4\.5(?:$|-)/i.test(model);
}

function formatGrokCliTools(tools: any[]): any[] {
  if (!Array.isArray(tools)) return [];
  const result: any[] = [];
  for (const t of tools) {
    if (!t) continue;
    if (t.type === "function" || !t.type) {
      const fn = t.function || t;
      const name = fn.name || t.name;
      if (!name) continue;
      const schema = fn.parameters || t.parameters || fn.input_schema || t.input_schema;
      result.push({
        type: "function",
        name,
        description: fn.description || t.description || "",
        parameters: sanitizeToolParameters(schema),
      });
    } else if (t.type === "custom") {
      result.push(t);
    }
  }
  return result;
}

function buildGrokCliHeaders(
  token: string,
  connectionId: string,
  accountEmail: string | null | undefined,
  targetModel: string,
  firstUserTextStr: string,
  turnsCount: number
): Record<string, string> {
  const sessionId = stableUuid(`grok-cli:${connectionId || "default"}:${firstUserTextStr}`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "User-Agent": GROK_CLI_USER_AGENT,
    "x-grok-client-identifier": GROK_CLI_CLIENT_IDENTIFIER,
    "x-grok-client-version": GROK_CLI_VERSION,
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-session-id": sessionId,
    "x-grok-conv-id": sessionId,
    "x-grok-req-id": crypto.randomUUID(),
    "x-grok-turn-idx": String(Math.max(1, turnsCount)),
    "x-grok-agent-id": stableUuid(`grok-cli-agent:${connectionId || "default"}`),
    "x-grok-model-override": targetModel,
  };
  if (accountEmail) {
    headers["x-email"] = accountEmail;
  }
  return headers;
}

function formatGrokCliPayload(parsedBody: any, targetModel: string, reasoningEffort?: string | null) {
  const messages: any[] = Array.isArray(parsedBody?.messages) ? parsedBody.messages : [];
  const instructionParts: string[] = [];
  const convMessages: any[] = [];

  for (const m of messages) {
    if (!m) continue;
    let content = "";
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .map((c: any) => {
          if (typeof c === "string") return c;
          if (c.text) return c.text;
          return JSON.stringify(c);
        })
        .join("\n");
    }
    const normalizedMsg = { ...m, content };
    if (m.role === "system" || m.role === "developer") {
      if (content.trim()) instructionParts.push(content.trim());
    } else {
      convMessages.push(normalizedMsg);
    }
  }

  if (parsedBody?.instructions && typeof parsedBody.instructions === "string" && parsedBody.instructions.trim()) {
    instructionParts.unshift(parsedBody.instructions.trim());
  }
  if (parsedBody?.system) {
    const sysText = extractAnthropicText(parsedBody.system);
    if (sysText.trim()) instructionParts.unshift(sysText.trim());
  }

  fixMissingToolResponsesOpenAI(convMessages);
  fixOrphanedToolResponsesOpenAI(convMessages);

  const emittedCallIds = new Set<string>();
  for (const m of convMessages) {
    if (m && m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc && tc.id) emittedCallIds.add(tc.id);
      }
    }
  }

  const input: any[] = [];
  for (const m of convMessages) {
    const content = m.content || "";
    if (m.role === "tool") {
      const callId = m.tool_call_id || m.id;
      if (callId && emittedCallIds.has(callId)) {
        input.push({
          type: "function_call_output",
          call_id: callId,
          output: content,
        });
      } else {
        input.push({
          role: "user",
          content: `[Tool Output]\n${content || "(empty result)"}`,
        });
      }
    } else if (m.role === "assistant") {
      if (content.trim()) {
        input.push({ role: "assistant", content });
      }
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        for (const tc of m.tool_calls) {
          const callId = tc.id || `call_${Date.now()}`;
          const fnName = tc.function?.name || tc.name || "";
          let args = tc.function?.arguments || tc.arguments || "{}";
          if (typeof args !== "string") {
            try {
              args = JSON.stringify(args);
            } catch {
              args = "{}";
            }
          }
          input.push({
            type: "function_call",
            call_id: callId,
            name: fnName,
            arguments: args,
          });
        }
      }
    } else {
      if (content.trim()) {
        input.push({ role: "user", content });
      }
    }
  }

  if (input.length === 0) {
    input.push({ role: "user", content: "Hello" });
  }

  const tools = formatGrokCliTools(parsedBody?.tools);
  let toolChoice = parsedBody?.tool_choice;
  if (toolChoice && typeof toolChoice === "object" && toolChoice.type === "function" && toolChoice.function?.name) {
    toolChoice = { type: "function", name: toolChoice.function.name };
  }

  const reasoning: Record<string, any> = { summary: "concise" };
  const eff =
    reasoningEffort ||
    parsedBody?.reasoning?.effort ||
    parsedBody?.reasoning_effort ||
    parsedBody?.effort;
  if (eff && eff !== "off" && eff !== "none" && supportsGrokCliReasoningEffort(targetModel)) {
    reasoning.effort = eff;
  }

  const firstUserMsg = convMessages.find((m) => m.role === "user");
  const firstUserTextStr = typeof firstUserMsg?.content === "string" ? firstUserMsg.content.slice(0, 2000) : "";
  const turnsCount = Math.max(1, convMessages.filter((m) => m.role === "user").length);

  const payload: Record<string, any> = {
    model: targetModel,
    input,
    stream: true,
    store: false,
    reasoning,
    include: ["reasoning.encrypted_content"],
    ...(instructionParts.length > 0 ? { instructions: instructionParts.join("\n\n") } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };

  return { payload, firstUserTextStr, turnsCount };
}

/**
 * Dispatches Chat Completions or Messages request to Grok CLI (cli-chat-proxy.grok.com/v1/responses)
 * and converts the Responses SSE stream back to OpenAI Chat Completions format.
 */
export async function dispatchGrokCliChat(params: GrokCliDispatchParams): Promise<Response> {
  const startTime = Date.now();
  const completionId = `chatcmpl-grok-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const targetModel = resolveGrokCliModel(params.model);
  const logModel = params.upstreamLogModel || params.model;

  const { payload: grokBody, firstUserTextStr, turnsCount } = formatGrokCliPayload(
    params.parsedBody,
    targetModel,
    params.reasoningEffort
  );

  let activeToken = params.accessToken;
  let response = await fetch(GROK_CLI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: buildGrokCliHeaders(
      activeToken,
      params.connectionId,
      params.accountEmail,
      targetModel,
      firstUserTextStr,
      turnsCount
    ),
    body: JSON.stringify(grokBody),
    signal: AbortSignal.timeout(300000),
  });

  if (response.status === 401 && params.connectionId) {
    try {
      activeToken = await refreshConnectionOn401(params.connectionId);
      response = await fetch(GROK_CLI_RESPONSES_ENDPOINT, {
        method: "POST",
        headers: buildGrokCliHeaders(
          activeToken,
          params.connectionId,
          params.accountEmail,
          targetModel,
          firstUserTextStr,
          turnsCount
        ),
        body: JSON.stringify(grokBody),
        signal: AbortSignal.timeout(300000),
      });
    } catch {}
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    let errMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.detail || errJson.error?.message || errJson.message || errText;
    } catch {}

    if (params.connectionId && (response.status === 401 || response.status === 402 || response.status === 429 || response.status >= 500)) {
      const cooldownSec = response.status === 401 || response.status === 402 ? 3600 : 60;
      await markConnectionCooldown(
        params.connectionId,
        cooldownSec,
        response.status === 402 ? "EXHAUSTED" : response.status === 401 ? "ERROR" : undefined
      );
    }

    logUpstreamRequest({
      connectionId: params.connectionId,
      provider: "GROK_CLI",
      model: logModel,
      clientApiKeyId: params.clientApiKeyId,
      clientUserId: params.clientUserId,
      clientUserEmail: params.clientUserEmail,
      reasoningEffort: params.reasoningEffort,
      rawHeaders: params.rawHeaders,
      rawBody: params.parsedBody || params.rawBody,
      rawResponse: errMsg,
      promptTokens: 15,
      completionTokens: 0,
      totalTokens: 15,
      latencyMs: Date.now() - startTime,
      statusCode: response.status,
      isFailover: response.status === 400 || response.status === 401 || response.status === 402 || response.status === 429 || response.status >= 500,
      failoverReason: `Grok CLI HTTP ${response.status}: ${errMsg}`,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: {
          message: `[Grok CLI] ${errMsg}`,
          type: "upstream_error",
          code: response.status,
        },
      }),
      { status: response.status, headers: { "Content-Type": "application/json" } }
    );
  }

  // Case 1: Streaming (OpenAI Chat Completions SSE format)
  if (params.clientWantsStream && response.body) {
    const upstreamBody = response.body;
    let promptTokens = 0;
    let completionTokens = 0;
    let accumulatedText = "";
    const activeToolCalls = new Map<string, { index: number; id: string; name: string; arguments: string }>();
    let nextToolIndex = 0;
    let buffer = "";

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;

          try {
            const data = JSON.parse(trimmed.slice(6));

            if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
              accumulatedText += data.delta;
              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: params.clientRequestedModel || params.model,
                choices: [{ index: 0, delta: { content: data.delta }, finish_reason: null }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }

            if (
              (data.type === "response.reasoning_text.delta" ||
                data.type === "response.thinking_text.delta" ||
                data.type === "response.reasoning_summary_text.delta") &&
              typeof data.delta === "string"
            ) {
              accumulatedText += data.delta;
              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: params.clientRequestedModel || params.model,
                choices: [{ index: 0, delta: { reasoning_content: data.delta }, finish_reason: null }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }

            if (data.type === "response.output_item.added" && data.item?.type === "function_call") {
              const itemId = data.item.id || data.item.call_id || `call_${Date.now()}`;
              const callId = data.item.call_id || itemId;
              const name = data.item.name || "";
              const tIndex = nextToolIndex++;
              activeToolCalls.set(itemId, { index: tIndex, id: callId, name, arguments: "" });

              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: params.clientRequestedModel || params.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [{ index: tIndex, id: callId, type: "function", function: { name, arguments: "" } }],
                    },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }

            if (data.type === "response.function_call_arguments.delta" && typeof data.delta === "string") {
              const itemId = data.item_id || data.call_id;
              let toolEntry = activeToolCalls.get(itemId);
              if (!toolEntry) {
                const tIndex = nextToolIndex++;
                toolEntry = { index: tIndex, id: itemId || `call_${Date.now()}`, name: data.name || "", arguments: "" };
                activeToolCalls.set(itemId, toolEntry);
              }
              toolEntry.arguments += data.delta;

              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: params.clientRequestedModel || params.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [{ index: toolEntry.index, function: { arguments: data.delta } }],
                    },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }

            if (
              (data.type === "response.completed" || data.type === "response.done") &&
              (data.response?.usage || data.usage)
            ) {
              const u = data.response?.usage || data.usage;
              promptTokens = u.input_tokens || u.prompt_tokens || promptTokens;
              completionTokens = u.output_tokens || u.completion_tokens || completionTokens;
            }
          } catch {}
        }
      },
      flush(controller) {
        const hasToolCalls = activeToolCalls.size > 0;
        const durationMs = Date.now() - startTime;
        const finalPromptTokens = promptTokens || params.estimatedPromptTokens || 15;
        const finalCompletionTokens =
          completionTokens > 0 ? completionTokens : Math.max(1, Math.ceil(accumulatedText.length / 4));

        const finalChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: params.clientRequestedModel || params.model,
          choices: [{ index: 0, delta: {}, finish_reason: hasToolCalls ? "tool_calls" : "stop" }],
          usage: {
            prompt_tokens: finalPromptTokens,
            completion_tokens: finalCompletionTokens,
            total_tokens: finalPromptTokens + finalCompletionTokens,
          },
        };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));

        adminLogger.done({
          durationMs,
          promptTokens: finalPromptTokens,
          completionTokens: finalCompletionTokens,
          model: params.clientRequestedModel || params.model,
          upstreamModel: logModel,
          account: params.clientUserEmail || undefined,
          reasoningEffort: params.reasoningEffort || undefined,
        });

        logUpstreamRequest({
          connectionId: params.connectionId,
          provider: "GROK_CLI",
          model: logModel,
          clientApiKeyId: params.clientApiKeyId,
          clientUserId: params.clientUserId,
          clientUserEmail: params.clientUserEmail,
          reasoningEffort: params.reasoningEffort,
          rawHeaders: params.rawHeaders,
          rawBody: params.parsedBody || params.rawBody,
          rawResponse: accumulatedText,
          promptTokens: finalPromptTokens,
          completionTokens: finalCompletionTokens,
          totalTokens: finalPromptTokens + finalCompletionTokens,
          latencyMs: durationMs,
          statusCode: 200,
          isFailover: false,
        }).catch(() => {});

        if (params.clientApiKeyId) {
          logRequest({
            apiKeyId: params.clientApiKeyId,
            path: params.reqPath,
            method: "POST",
            statusCode: 200,
            model: params.clientRequestedModel || params.model,
            promptTokens: finalPromptTokens,
            completionTokens: finalCompletionTokens,
            totalTokens: finalPromptTokens + finalCompletionTokens,
            durationMs,
          });
        }
      },
    });

    return new Response(upstreamBody.pipeThrough(transformStream), {
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
  const rawText = await response.text();
  const durationMs = Date.now() - startTime;
  let accumulatedContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCallsMap = new Map<string, { id: string; name: string; arguments: string }>();

  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    try {
      const data = JSON.parse(trimmed.slice(6));
      if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
        accumulatedContent += data.delta;
      } else if (data.type === "response.output_text.done" && typeof data.text === "string" && !accumulatedContent) {
        accumulatedContent = data.text;
      }
      if (data.type === "response.output_item.added" && data.item?.type === "function_call") {
        const id = data.item.id || data.item.call_id;
        toolCallsMap.set(id, { id: data.item.call_id || id, name: data.item.name || "", arguments: "" });
      }
      if (data.type === "response.function_call_arguments.delta" && typeof data.delta === "string") {
        const id = data.item_id || data.call_id;
        const entry = toolCallsMap.get(id);
        if (entry) entry.arguments += data.delta;
      }
      if (data.type === "response.completed" && data.response?.usage) {
        promptTokens = data.response.usage.input_tokens || promptTokens;
        completionTokens = data.response.usage.output_tokens || completionTokens;
      }
    } catch {}
  }

  const finalToolCalls = Array.from(toolCallsMap.values()).map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.name, arguments: tc.arguments },
  }));

  const finalPrompt = promptTokens || params.estimatedPromptTokens || 15;
  const finalComp = completionTokens || Math.max(1, Math.ceil(accumulatedContent.length / 4));

  adminLogger.done({
    durationMs,
    promptTokens: finalPrompt,
    completionTokens: finalComp,
    model: params.clientRequestedModel || params.model,
    upstreamModel: logModel,
    account: params.clientUserEmail || undefined,
    reasoningEffort: params.reasoningEffort || undefined,
  });

  logUpstreamRequest({
    connectionId: params.connectionId,
    provider: "GROK_CLI",
    model: logModel,
    clientApiKeyId: params.clientApiKeyId,
    clientUserId: params.clientUserId,
    clientUserEmail: params.clientUserEmail,
    reasoningEffort: params.reasoningEffort,
    rawHeaders: params.rawHeaders,
    rawBody: params.parsedBody || params.rawBody,
    rawResponse: accumulatedContent,
    promptTokens: finalPrompt,
    completionTokens: finalComp,
    totalTokens: finalPrompt + finalComp,
    latencyMs: durationMs,
    statusCode: 200,
    isFailover: false,
  }).catch(() => {});

  if (params.clientApiKeyId) {
    logRequest({
      apiKeyId: params.clientApiKeyId,
      path: params.reqPath,
      method: "POST",
      statusCode: 200,
      model: params.clientRequestedModel || params.model,
      promptTokens: finalPrompt,
      completionTokens: finalComp,
      totalTokens: finalPrompt + finalComp,
      durationMs,
    });
  }

  return new Response(
    JSON.stringify({
      id: completionId,
      object: "chat.completion",
      created,
      model: params.clientRequestedModel || params.model,
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
        prompt_tokens: finalPrompt,
        completion_tokens: finalComp,
        total_tokens: finalPrompt + finalComp,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
