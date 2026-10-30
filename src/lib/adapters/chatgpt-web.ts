import crypto from "crypto";
import { NextResponse } from "next/server";
import { logUpstreamRequest } from "@/lib/router";
import { logRequest } from "@/lib/logger";
import { adminLogger } from "@/lib/admin-logger";
import { prisma } from "@/lib/prisma";
import { encryptCredential } from "@/lib/crypto";
import { verifyAndFetchChatGptSession } from "@/lib/web-providers/chatgpt-session";
import { extractToolCallsFromText } from "@/lib/adapters/responses";

export const CHATGPT_WEB_REQUIREMENTS_ENDPOINT = "https://chatgpt.com/backend-api/sentinel/chat-requirements";
export const CHATGPT_WEB_CONVERSATION_ENDPOINT = "https://chatgpt.com/backend-api/conversation";

export const CHATGPT_WEB_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

export function extractAccountIdFromToken(token?: string): string | undefined {
  if (!token) return undefined;
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
      return (
        decoded["https://api.openai.com/auth"]?.chatgpt_account_id ||
        decoded.account_id ||
        decoded["chatgpt_account_id"]
      );
    }
  } catch {}
  return undefined;
}

export function extractDeviceIdFromCookie(cookieString?: string): string {
  if (!cookieString) return "9ba88336-3aaa-4e17-a1d0-8547451d69e4";
  const match = cookieString.match(/(?:oai-did|__Host-oai-did|oai-device-id)=([a-f0-9\-]+)/i);
  if (match && match[1]) return match[1];
  return "9ba88336-3aaa-4e17-a1d0-8547451d69e4";
}

export function isChatGptWebProvider(provider?: string, authType?: string): boolean {
  if (!provider && !authType) return false;
  const p = (provider || "").toUpperCase().trim();
  return (
    p === "CHATGPT_WEB" ||
    p === "CHATGPT" ||
    p === "GPTWEB" ||
    authType === "COOKIE"
  );
}

/**
 * Normalizes OpenAI tools or legacy functions format into standard tool definitions array.
 */
export function extractToolsList(parsedBody: any): any[] {
  const tools: any[] = [];
  if (Array.isArray(parsedBody.tools)) {
    for (const t of parsedBody.tools) {
      if (!t) continue;
      if (t.type === "function" && t.function) {
        tools.push({
          name: t.function.name,
          description: t.function.description || "",
          parameters: t.function.parameters || {},
        });
      } else if (t.name) {
        tools.push({
          name: t.name,
          description: t.description || "",
          parameters: t.parameters || {},
        });
      }
    }
  } else if (Array.isArray(parsedBody.functions)) {
    for (const f of parsedBody.functions) {
      if (!f || !f.name) continue;
      tools.push({
        name: f.name,
        description: f.description || "",
        parameters: f.parameters || {},
      });
    }
  }
  return tools;
}

/**
 * Universal English tool calling prompt for all agent tools.
 */
export function buildToolsInstruction(tools: any[]): string {
  if (!tools || tools.length === 0) return "";
  const compactTools = tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    parameters: t.parameters || {},
  }));
  const toolsJson = JSON.stringify(compactTools);

  return `
# AVAILABLE TOOLS
You have access to the following tools:
\`\`\`json
${toolsJson}
\`\`\`

# UNIVERSAL TOOL CALLING RULES
1. **Action-First Execution**: Whenever the user's request requires performing an action (such as inspecting system environment, running shell/terminal commands, checking software versions, reading, searching, writing, or editing files, running tests, or performing any operational task), you MUST invoke the appropriate tool immediately.
2. **Never Fabricate or Explain Manually**: NEVER simulate, guess, or explain how the user can perform the action manually when a tool is available. NEVER reply with introductory placeholders or tutorials instead of running the tool.
3. **Format**: To invoke a tool, output ONLY the tool invocation formatted inside \`<tool_call>\` XML tags:
<tool_call>
{"name": "tool_name", "arguments": {"param_key": "param_value"}}
</tool_call>
4. **Multiple Calls**: If multiple actions are required, you may output multiple \`<tool_call>\` blocks.
5. **No Filler Before Call**: Do NOT output polite filler, introductory greetings, or commentary prior to the \`<tool_call>\` tag. Output the \`<tool_call>\` block directly.
6. **Plain Text Responses**: If the user's message is purely conversational (such as a generic greeting, general conceptual question, or follow-up after tools have finished) and does NOT require tool execution, reply naturally in plain text without any \`<tool_call>\` tags.
`.trim();
}

/**
 * Sanitizes long system prompt to fit within safe limits for web chat messages.
 */
export function sanitizeSystemPrompt(prompt: string, maxChars = 8000): string {
  if (!prompt) return "";
  const cleaned = prompt.trim();
  if (cleaned.length <= maxChars) return cleaned;
  const head = cleaned.slice(0, Math.floor(maxChars * 0.7));
  const tail = cleaned.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n... [instructions truncated for length] ...\n${tail}`;
}

/**
 * Splits text into safe chunks under maxLen (prevents Cloudflare/OpenAI 413 message length limit).
 */
export function splitTextIntoChunks(text: string, maxLen = 10000): string[] {
  if (!text || text.length <= maxLen) return [text || ""];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let sliceIdx = remaining.lastIndexOf("\n\n", maxLen);
    if (sliceIdx < maxLen * 0.5) sliceIdx = remaining.lastIndexOf("\n", maxLen);
    if (sliceIdx < maxLen * 0.5) sliceIdx = remaining.lastIndexOf(" ", maxLen);
    if (sliceIdx < maxLen * 0.5) sliceIdx = maxLen;

    chunks.push(remaining.slice(0, sliceIdx).trim());
    remaining = remaining.slice(sliceIdx).trim();
  }
  return chunks.filter(Boolean);
}

/**
 * Strips tool call XML and DSML markup from text content.
 */
export function cleanToolMarkupFromText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<tool_call>[\s\S]*$/gi, "")
    .replace(/<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>/gi, "")
    .replace(/<[\s|｜]*\/?(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
    .trim();
}

export interface ChatGptWebDispatchParams {
  rawBody: string;
  parsedBody: any;
  accessToken: string;
  cookieString: string;
  connectionId: string;
  model: string;
  clientRequestedModel?: string;
  upstreamLogModel?: string;
  clientApiKeyId?: string | null;
  clientUserId?: string | null;
  clientUserEmail?: string | null;
  reasoningEffort?: string | null;
  rawHeaders?: Record<string, string> | null;
  reqPath: string;
  clientWantsStream: boolean;
  tokensSavedRtk?: number;
}

/**
 * Normalizes model slug for ChatGPT Web backend.
 * e.g. "gptweb/gpt-5-5" -> "gpt-5-5", "gptweb/auto" -> "auto", "gpt-web" -> "auto".
 */
export function resolveChatGptWebModel(rawModel: string): string {
  let clean = rawModel
    .replace(/^gptweb\//i, "")
    .replace(/^chatgpt-web\//i, "")
    .replace(/^chatgpt\//i, "")
    .replace(/^cw\//i, "")
    .trim();

  const lower = clean.toLowerCase();
  if (lower === "default" || lower === "default-model" || lower === "gpt-web" || !clean) {
    return "auto";
  }
  return clean;
}

/**
 * Solves the OpenAI Sentinel Proof-of-Work (PoW) challenge using SHA3-512.
 */
export function solveProofOfWork(seed: string, difficulty: string, userAgent: string): string | null {
  if (!seed || !difficulty) return null;

  const screen = [3008, 4010, 6000][Math.floor(Math.random() * 3)] * [1, 2, 4][Math.floor(Math.random() * 3)];
  const parseTime = new Date().toUTCString();
  const config: any[] = [
    screen,
    parseTime,
    null,
    0,
    userAgent,
    null,
    "en-US",
    "en-US,en",
    0,
    true,
    8,
    null,
  ];

  const diffLen = difficulty.length;
  for (let i = 0; i < 500000; i++) {
    config[3] = i;
    const jsonData = JSON.stringify(config);
    const base = Buffer.from(jsonData).toString("base64");
    const hash = crypto.createHash("sha3-512").update(seed + base).digest("hex");
    if (hash.slice(0, diffLen) <= difficulty) {
      return "gAAAAAB" + base;
    }
  }

  // Fallback signature
  const fallbackBase = Buffer.from(JSON.stringify(seed)).toString("base64");
  return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallbackBase;
}

/**
 * Obtains chat requirements token and calculates PoW token if required.
 */
export async function getChatRequirements(
  accessToken: string,
  cookieString: string,
  userAgent: string,
  accountId?: string,
  deviceId?: string
): Promise<{ token?: string; proofToken?: string }> {
  try {
    const devId = deviceId || extractDeviceIdFromCookie(cookieString);
    const accId = accountId || extractAccountIdFromToken(accessToken) || "ebed8daa-4806-42ea-ac5a-1294ab7932ba";

    const res = await fetch(CHATGPT_WEB_REQUIREMENTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Chatgpt-Account-Id": accId,
        "Oai-Device-Id": devId,
        "Oai-Did": devId,
        "Oai-Language": "id-ID",
        Originator: "Codex Browser",
        "X-Openai-Web-Frontend": "codex_webview",
        "Sec-Ch-Ua": '"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "User-Agent": userAgent,
        Referer: "https://chatgpt.com/",
        Origin: "https://chatgpt.com",
        "Content-Type": "application/json",
        Cookie: cookieString,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {};
    }

    const data = await res.json();
    let proofToken: string | undefined = undefined;

    if (data.proofofwork?.required && data.proofofwork.seed && data.proofofwork.difficulty) {
      const solved = solveProofOfWork(data.proofofwork.seed, data.proofofwork.difficulty, userAgent);
      if (solved) proofToken = solved;
    }

    return {
      token: data.token,
      proofToken,
    };
  } catch {
    return {};
  }
}

/**
 * Formats OpenAI Chat messages and tools into ChatGPT Web /backend-api/conversation payload.
 * Injects tools and instructions cleanly without any fake assistant messages.
 */
export function formatChatGptWebPayload(parsedBody: any, targetModel: string) {
  const rawMessages: any[] = Array.isArray(parsedBody.messages) ? parsedBody.messages : [];
  const tools = extractToolsList(parsedBody);
  const toolsInstruction = buildToolsInstruction(tools);

  let rawSystemPrompt = "";
  const conversationMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const m of rawMessages) {
    if (!m) continue;
    let content = "";
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content
        .map((c: any) => (typeof c === "string" ? c : c.text || JSON.stringify(c)))
        .join("\n");
    }

    if (m.role === "system" || m.role === "developer") {
      rawSystemPrompt += (rawSystemPrompt ? "\n\n" : "") + content;
    } else if (m.role === "tool" || m.role === "function") {
      const toolName = m.name ? ` (${m.name})` : "";
      const callId = m.tool_call_id ? ` [call_id: ${m.tool_call_id}]` : "";
      let boundedContent = content;
      if (boundedContent.length > 10000) {
        boundedContent = boundedContent.slice(0, 6000) + "\n... [output truncated] ...\n" + boundedContent.slice(-3000);
      }
      conversationMessages.push({
        role: "user",
        content: `[Tool Result${toolName}${callId}]:\n${boundedContent || "Success"}`,
      });
    } else if (m.role === "assistant") {
      let assistantText = content || "";
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        for (const tc of m.tool_calls) {
          const fnName = tc.function?.name || tc.name;
          const fnArgs = typeof tc.function?.arguments === "string"
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || {});
          assistantText += (assistantText ? "\n" : "") + `<tool_call>\n{"name": "${fnName}", "arguments": ${fnArgs}}\n</tool_call>`;
        }
      }
      conversationMessages.push({
        role: "assistant",
        content: assistantText || "Understood.",
      });
    } else {
      let boundedContent = content;
      if (boundedContent.length > 12000) {
        boundedContent = boundedContent.slice(0, 8000) + "\n... [content truncated] ...\n" + boundedContent.slice(-3000);
      }
      conversationMessages.push({
        role: "user",
        content: boundedContent || "Hello",
      });
    }
  }

  // Combine system prompt (sanitized) with tools instructions
  const cleanSystem = sanitizeSystemPrompt(rawSystemPrompt, 8000);
  const fullSystemPrompt = [cleanSystem.trim(), toolsInstruction.trim()].filter(Boolean).join("\n\n");

  // Prepend system instructions to the first user message
  if (fullSystemPrompt && conversationMessages.length > 0) {
    const firstUserMsg = conversationMessages.find((m) => m.role === "user");
    if (firstUserMsg) {
      firstUserMsg.content = `[System Instructions & Tools Configuration:\n${fullSystemPrompt}]\n\n${firstUserMsg.content}`;
    } else {
      conversationMessages.unshift({
        role: "user",
        content: `[System Instructions & Tools Configuration:\n${fullSystemPrompt}]`,
      });
    }
  } else if (fullSystemPrompt && conversationMessages.length === 0) {
    conversationMessages.push({
      role: "user",
      content: `[System Instructions & Tools Configuration:\n${fullSystemPrompt}]`,
    });
  }

  // Ensure conversation is not empty
  if (conversationMessages.length === 0) {
    conversationMessages.push({
      role: "user",
      content: "Hello",
    });
  }

  // Ensure last message is from user (ChatGPT Web requires last message to be user)
  const lastMsg = conversationMessages[conversationMessages.length - 1];
  if (lastMsg.role === "assistant") {
    conversationMessages.push({
      role: "user",
      content: "Please proceed with the execution.",
    });
  }

  // Windowing: Keep first message (with system instructions) + last 12 messages if history is long
  let finalMessages = conversationMessages;
  if (finalMessages.length > 14) {
    const firstMsg = finalMessages[0];
    const tail = finalMessages.slice(-12);
    finalMessages = [firstMsg, ...tail];
    // Ensure last is user
    if (finalMessages[finalMessages.length - 1].role === "assistant") {
      finalMessages.push({
        role: "user",
        content: "Please proceed.",
      });
    }
  }

  const nowSec = Date.now() / 1000;
  const formattedMessages = finalMessages.map((msg) => {
    const msgId = crypto.randomUUID();
    return {
      author: {
        metadata: {},
        name: null,
        role: msg.role,
      },
      channel: null,
      content: {
        content_type: "text",
        parts: [msg.content],
      },
      create_time: nowSec,
      end_turn: null,
      id: msgId,
      metadata: {
        automation_creation_attribution: {
          origin: "conversation",
          flow_id: msgId,
        },
      },
      recipient: "all",
      status: "finished_successfully",
      update_time: null,
      weight: 1,
    };
  });

  return {
    turn_attribution: { turn_trigger: "composer" },
    action: "next",
    model: targetModel === "default" || !targetModel ? "auto" : targetModel,
    parent_message_id: "client-created-root",
    timezone: "Asia/Jakarta",
    timezone_offset_min: -420,
    is_do_not_remember: false,
    client_contextual_info: {
      app_name: "chatgpt.com",
      app_surface: "codex_browser",
      has_web_push_capabilities: true,
      web_push_notification_permission: "default",
    },
    local_function_names: ["local.continue_in_work"],
    messages: formattedMessages,
    genui_state_snapshots: [],
    client_prepare_state: "sent",
  };
}

/**
 * Dispatches a Chat Completion request to ChatGPT Web (/backend-api/conversation)
 * and streams back OpenAI-compatible Chat Completion SSE or returns standard JSON.
 */
export async function dispatchChatGptWebChat(params: ChatGptWebDispatchParams): Promise<Response> {
  const startTime = Date.now();
  const completionId = `chatcmpl-gptweb-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const targetModel = resolveChatGptWebModel(params.model);
  const logModel = params.upstreamLogModel || params.model;
  const clientRequestedModel = params.clientRequestedModel || params.model || "auto";

  let activeToken = params.accessToken;
  const cookieString = params.cookieString;
  const userAgent = CHATGPT_WEB_USER_AGENT;
  const deviceId = extractDeviceIdFromCookie(cookieString);
  let accountId = extractAccountIdFromToken(activeToken) || "ebed8daa-4806-42ea-ac5a-1294ab7932ba";

  // 1. Get Chat Requirements & Proof of Work
  let { token: reqToken, proofToken } = await getChatRequirements(
    activeToken,
    cookieString,
    userAgent,
    accountId,
    deviceId
  );

  const payload = formatChatGptWebPayload(params.parsedBody, targetModel);

  const buildHeaders = (token: string, rToken?: string, pToken?: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Chatgpt-Account-Id": accountId,
      "Oai-Device-Id": deviceId,
      "Oai-Did": deviceId,
      "Oai-Language": "id-ID",
      Originator: "Codex Browser",
      Referer: "https://chatgpt.com/",
      "Sec-Ch-Ua": '"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "User-Agent": userAgent,
      "X-Openai-Codex-Window-Type": "browser",
      "X-Openai-Rate-Limit-Join-Workspace": "1",
      "X-Openai-Web-Frontend": "codex_webview",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Cookie: cookieString,
    };
    if (rToken) headers["openai-sentinel-chat-requirements-token"] = rToken;
    if (pToken) headers["openai-sentinel-proof-token"] = pToken;
    return headers;
  };

  let response = await fetch(CHATGPT_WEB_CONVERSATION_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(activeToken, reqToken, proofToken),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000),
  });

  // Handle 401 by refreshing access token via cookie session
  if (response.status === 401 && cookieString && params.connectionId) {
    try {
      const refreshed = await verifyAndFetchChatGptSession(cookieString);
      if (refreshed.success && refreshed.accessToken) {
        activeToken = refreshed.accessToken;
        accountId = extractAccountIdFromToken(activeToken) || accountId;
        await prisma.providerConnection.update({
          where: { id: params.connectionId },
          data: {
            accessTokenEnc: encryptCredential(refreshed.accessToken),
            tokenExpiresAt: refreshed.expires ? new Date(refreshed.expires) : null,
          },
        });

        // Re-obtain chat requirements with new token
        const newReq = await getChatRequirements(activeToken, cookieString, userAgent, accountId, deviceId);
        reqToken = newReq.token;
        proofToken = newReq.proofToken;

        response = await fetch(CHATGPT_WEB_CONVERSATION_ENDPOINT, {
          method: "POST",
          headers: buildHeaders(activeToken, reqToken, proofToken),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(300000),
        });
      }
    } catch {}
  }

  // Handle upstream error
  if (!response.ok) {
    const errText = await response.text();
    let errMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.detail?.message || errJson.detail || errJson.error?.message || errText;
    } catch {}

    logUpstreamRequest({
      connectionId: params.connectionId,
      provider: "CHATGPT_WEB",
      model: logModel,
      clientApiKeyId: params.clientApiKeyId,
      clientUserId: params.clientUserId,
      clientUserEmail: params.clientUserEmail,
      reasoningEffort: params.reasoningEffort || null,
      rawHeaders: params.rawHeaders,
      rawBody: params.parsedBody || params.rawBody,
      rawResponse: errText,
      promptTokens: 15,
      completionTokens: 0,
      totalTokens: 15,
      latencyMs: Date.now() - startTime,
      statusCode: response.status,
      isFailover: false,
      failoverReason: `ChatGPT Web upstream HTTP ${response.status}: ${errMsg.slice(0, 100)}`,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: {
          message: `[ChatGPT Web] ${errMsg}`,
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

  const upstreamBody = response.body;
  if (!upstreamBody) {
    return new Response(JSON.stringify({ error: "Empty response from ChatGPT Web" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Case 1: Client requested Streaming (OpenAI SSE format)
  if (params.clientWantsStream) {
    let promptTokens = Math.max(15, Math.ceil(params.rawBody.length / 4));
    let completionTokens = 0;
    let accumulatedText = "";
    let lastEmittedLength = 0;
    let buffer = "";
    let emittedToolCallsCount = 0;

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const raw = trimmed.slice(6).trim();
          if (raw === "[DONE]") continue;

          try {
            const data = JSON.parse(raw);

            // In ChatGPT Web conversation endpoint, only stream messages from assistant
            if (
              data.message?.author?.role === "assistant" &&
              data.message?.content?.parts &&
              Array.isArray(data.message.content.parts)
            ) {
              const currentFullText = data.message.content.parts[0] || "";
              if (typeof currentFullText === "string") {
                accumulatedText = currentFullText;

                // Check if text contains tool invocation
                const toolCallTagIdx = currentFullText.search(/<tool_call|<function_call|<invoke/i);

                if (toolCallTagIdx === -1) {
                  // No tool call markup detected yet.
                  // Hold back trailing partial tag (e.g. "<" or "<tool") if present
                  const pendingTagMatch = currentFullText.match(/<[a-zA-Z0-9_:｜|]*$/);
                  const safeLength = pendingTagMatch ? currentFullText.length - pendingTagMatch[0].length : currentFullText.length;
                  if (safeLength > lastEmittedLength) {
                    const deltaText = currentFullText.slice(lastEmittedLength, safeLength);
                    lastEmittedLength = safeLength;

                    const chunkPayload = {
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: clientRequestedModel,
                      choices: [
                        {
                          index: 0,
                          delta: { content: deltaText },
                          finish_reason: null,
                        },
                      ],
                    };
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
                  }
                } else {
                  // Tool call markup detected!
                  // 1. Emit any pre-tool commentary text
                  if (toolCallTagIdx > lastEmittedLength) {
                    const deltaText = currentFullText.slice(lastEmittedLength, toolCallTagIdx);
                    lastEmittedLength = toolCallTagIdx;

                    const chunkPayload = {
                      id: completionId,
                      object: "chat.completion.chunk",
                      created,
                      model: clientRequestedModel,
                      choices: [
                        {
                          index: 0,
                          delta: { content: deltaText },
                          finish_reason: null,
                        },
                      ],
                    };
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
                  }

                  // 2. Try extracting completed tool calls from the markup
                  const extracted = extractToolCallsFromText(currentFullText);
                  if (extracted.length > emittedToolCallsCount) {
                    for (let i = emittedToolCallsCount; i < extracted.length; i++) {
                      const tc = extracted[i];
                      const callId = `call_${Date.now()}_${i}`;
                      const chunk = {
                        id: completionId,
                        object: "chat.completion.chunk",
                        created,
                        model: clientRequestedModel,
                        choices: [
                          {
                            index: 0,
                            delta: {
                              role: "assistant",
                              tool_calls: [
                                {
                                  index: i,
                                  id: callId,
                                  type: "function",
                                  function: {
                                    name: tc.name,
                                    arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
                                  },
                                },
                              ],
                            },
                            finish_reason: null,
                          },
                        ],
                      };
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
                    }
                    emittedToolCallsCount = extracted.length;
                  }
                }
              }
            }

            if (data.error && !accumulatedText) {
              const errContent = typeof data.error === "string" ? data.error : data.error.message || "Usage limit reached";
              accumulatedText = `[ChatGPT Web]: ${errContent}`;
              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: clientRequestedModel,
                choices: [
                  {
                    index: 0,
                    delta: { content: accumulatedText },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            }
          } catch {}
        }
      },
      flush(controller) {
        // Final check: Extract any tool calls from accumulatedText
        const finalExtracted = extractToolCallsFromText(accumulatedText);
        if (finalExtracted.length > emittedToolCallsCount) {
          for (let i = emittedToolCallsCount; i < finalExtracted.length; i++) {
            const tc = finalExtracted[i];
            const callId = `call_${Date.now()}_${i}`;
            const chunk = {
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: clientRequestedModel,
              choices: [
                {
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [
                      {
                        index: i,
                        id: callId,
                        type: "function",
                        function: {
                          name: tc.name,
                          arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            };
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          emittedToolCallsCount = finalExtracted.length;
        }

        // If no tool calls were emitted and there's remaining held text, flush it
        if (emittedToolCallsCount === 0 && accumulatedText.length > lastEmittedLength) {
          const remainingText = accumulatedText.slice(lastEmittedLength);
          if (remainingText) {
            const chunk = {
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: clientRequestedModel,
              choices: [
                {
                  index: 0,
                  delta: { content: remainingText },
                  finish_reason: null,
                },
              ],
            };
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
        }

        completionTokens = Math.max(1, Math.ceil(accumulatedText.length / 4));
        const durationMs = Date.now() - startTime;
        const finishReason = emittedToolCallsCount > 0 ? "tool_calls" : "stop";
        const finalChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: clientRequestedModel,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: finishReason,
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));

        logUpstreamRequest({
          connectionId: params.connectionId,
          provider: "CHATGPT_WEB",
          model: logModel,
          clientApiKeyId: params.clientApiKeyId,
          clientUserId: params.clientUserId,
          clientUserEmail: params.clientUserEmail,
          reasoningEffort: params.reasoningEffort || null,
          rawHeaders: params.rawHeaders,
          rawBody: params.parsedBody || params.rawBody,
          rawResponse: accumulatedText,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
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
            model: clientRequestedModel,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            costUsd: 0,
            durationMs,
          });
        }

        adminLogger.done({
          durationMs,
          promptTokens,
          completionTokens,
          model: clientRequestedModel,
          upstreamModel: targetModel,
          account: "ChatGPT Web",
        });
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

  // Case 2: Client requested Non-Streaming (Standard OpenAI JSON)
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  let accumulatedText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const raw = trimmed.slice(6).trim();
      if (raw === "[DONE]") continue;

      try {
        const data = JSON.parse(raw);
        if (
          data.message?.author?.role === "assistant" &&
          data.message?.content?.parts &&
          Array.isArray(data.message.content.parts)
        ) {
          const currentFullText = data.message.content.parts[0];
          if (typeof currentFullText === "string") {
            accumulatedText = currentFullText;
          }
        }

        if (data.error && !accumulatedText) {
          const errContent = typeof data.error === "string" ? data.error : data.error.message || "Usage limit reached";
          accumulatedText = `[ChatGPT Web]: ${errContent}`;
        }
      } catch {}
    }
  }

  const promptTokens = Math.max(15, Math.ceil(params.rawBody.length / 4));
  const completionTokens = Math.max(1, Math.ceil(accumulatedText.length / 4));
  const totalTokens = promptTokens + completionTokens;
  const durationMs = Date.now() - startTime;

  logUpstreamRequest({
    connectionId: params.connectionId,
    provider: "CHATGPT_WEB",
    model: logModel,
    clientApiKeyId: params.clientApiKeyId,
    clientUserId: params.clientUserId,
    clientUserEmail: params.clientUserEmail,
    reasoningEffort: params.reasoningEffort || null,
    rawHeaders: params.rawHeaders,
    rawBody: params.parsedBody || params.rawBody,
    rawResponse: accumulatedText,
    promptTokens,
    completionTokens,
    totalTokens,
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
      model: clientRequestedModel,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: 0,
      durationMs,
    });
  }

  adminLogger.done({
    durationMs,
    promptTokens,
    completionTokens,
    model: clientRequestedModel,
    upstreamModel: targetModel,
    account: "ChatGPT Web",
  });

  const extractedToolCalls = extractToolCallsFromText(accumulatedText);
  const hasExtractedTools = extractedToolCalls.length > 0;

  let finalContent: string | null = null;
  let finalToolCalls: any[] | undefined = undefined;
  const finishReason = hasExtractedTools ? "tool_calls" : "stop";

  if (hasExtractedTools) {
    const cleanText = cleanToolMarkupFromText(accumulatedText);
    finalContent = cleanText || null;
    finalToolCalls = extractedToolCalls.map((tc, idx) => ({
      id: `call_${Date.now()}_${idx}`,
      type: "function",
      function: {
        name: tc.name,
        arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
      },
    }));
  } else {
    finalContent = accumulatedText;
  }

  return NextResponse.json({
    id: completionId,
    object: "chat.completion",
    created,
    model: clientRequestedModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: finalContent,
          ...(finalToolCalls ? { tool_calls: finalToolCalls } : {}),
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  });
}
