import { logUpstreamRequest, refreshConnectionOn401 } from "@/lib/router";
import { adminLogger } from "@/lib/admin-logger";

export const ANTIGRAVITY_ENDPOINT_DAILY = "https://daily-cloudcode-pa.googleapis.com";
export const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";

const ANTIGRAVITY_HEADERS = {
  "User-Agent": "antigravity/cli/1.1.24 (aidev_client; os_type=windows; arch=amd64; auth_method=consumer)",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata": '{"ideType":"ANTIGRAVITY","platform":"WINDOWS","pluginType":"GEMINI"}',
};

// In-memory cache for discovered project IDs by access token prefix
const projectCache = new Map<string, string>();

export function isAntigravityProvider(provider?: string): boolean {
  if (!provider) return false;
  const p = provider.toUpperCase().trim();
  return p === "ANTIGRAVITY" || p === "GOOGLE_AG";
}

export interface AntigravityDispatchParams {
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
  tokensSavedRtk?: number;
}

/**
 * Discovers the cloudaicompanion project id for the OAuth account.
 * Defaults to "aicode-consumers" which is the standard consumer tier project.
 */
async function getEffectiveProjectId(accessToken: string): Promise<string> {
  const tokenPrefix = accessToken.slice(0, 20);
  if (projectCache.has(tokenPrefix)) {
    return projectCache.get(tokenPrefix)!;
  }

  try {
    const res = await fetch(`${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:loadCodeAssist`, {
      method: "POST",
      headers: {
        ...ANTIGRAVITY_HEADERS,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }),
    });

    if (res.ok) {
      const data = await res.json();
      const project = data.cloudaicompanionProject || data.cloudaicompanionProject?.id;
      if (project) {
        projectCache.set(tokenPrefix, project);
        return project;
      }
    }
  } catch {}

  const fallback = "aicode-consumers";
  projectCache.set(tokenPrefix, fallback);
  return fallback;
}

const DEFAULT_THOUGHT_SIGNATURE = "EmUKYwFpFH0TO+P4VtVlvIfIbcVwUekECf3ZSKGWk5GwOuoZNUiSwfbZnSc3JHOSA7PJV52mrnxAsKiOvrIePc+daK23MMiyNxAUQxWO/LvtyZjAB59/2IsZPd2jbvLwUqXKnYhs8w==";

/**
 * Converts OpenAI Chat Completion messages to Gemini contents and systemInstruction
 * Ensures strict Gemini turn alternation, merged function responses, and safe downgrading
 * of orphaned or aborted tool calls/responses from cross-model session switches.
 */
function convertOpenAiMessagesToGemini(messages: any[], wireModel?: string): {
  contents: any[];
  systemInstruction?: { parts: { text: string }[] };
} {
  const isClaude = Boolean(wireModel && wireModel.toLowerCase().includes("claude"));
  const systemTexts: string[] = [];
  const rawTurns: { role: "user" | "model"; parts: any[] }[] = [];

  if (!Array.isArray(messages)) {
    return { contents: [] };
  }

  // First pass: extract system messages
  const nonSystemMessages: any[] = [];
  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === "system") {
      const text = typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((p: any) => p.text || JSON.stringify(p)).join("\n")
          : JSON.stringify(msg.content || "");
      if (text.trim()) systemTexts.push(text.trim());
    } else {
      nonSystemMessages.push(msg);
    }
  }

  // Map tool_call_id to function name
  const toolIdToName = new Map<string, string>();
  for (const msg of nonSystemMessages) {
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.id && tc.function?.name) {
          toolIdToName.set(tc.id, tc.function.name);
        }
      }
    }
  }

  // Second pass: process messages turn by turn
  let i = 0;
  while (i < nonSystemMessages.length) {
    const msg = nonSystemMessages[i];
    const role = msg.role;

    if (role === "user") {
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content.map((p: any) => (typeof p === "string" ? p : p.text || JSON.stringify(p))).join("\n");
      } else if (msg.content) {
        text = JSON.stringify(msg.content);
      }
      rawTurns.push({
        role: "user",
        parts: [{ text: text.trim() || " " }],
      });
      i++;
    } else if (role === "assistant") {
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content.map((p: any) => (typeof p === "string" ? p : p.text || JSON.stringify(p))).join("\n");
      }

      const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;

      if (!hasToolCalls) {
        rawTurns.push({
          role: "model",
          parts: [{ text: text.trim() || "..." }],
        });
        i++;
      } else {
        // Look ahead: are the immediate next messages matching tool results?
        const toolCalls = msg.tool_calls;
        const callIds = new Set(toolCalls.map((tc: any) => tc.id).filter(Boolean));

        let lookAhead = i + 1;
        const matchingToolMsgs: any[] = [];
        while (lookAhead < nonSystemMessages.length && nonSystemMessages[lookAhead].role === "tool") {
          const toolMsg = nonSystemMessages[lookAhead];
          if (toolMsg.tool_call_id && callIds.has(toolMsg.tool_call_id)) {
            matchingToolMsgs.push(toolMsg);
            lookAhead++;
          } else {
            break;
          }
        }

        // If next messages provide responses for tool calls, emit proper functionCall + functionResponse pair
        if (matchingToolMsgs.length > 0) {
          const modelParts: any[] = [];
          if (text.trim()) modelParts.push({ text: text.trim() });

          for (let tcIdx = 0; tcIdx < toolCalls.length; tcIdx++) {
            const tc = toolCalls[tcIdx];
            const callId = tc.id || `call_${Date.now()}_${tcIdx}`;
            let args = {};
            try {
              args = typeof tc.function?.arguments === "string"
                ? JSON.parse(tc.function.arguments)
                : tc.function?.arguments || {};
            } catch {}
            const partObj: any = {
              functionCall: {
                name: tc.function?.name || "unknown_tool",
                args,
                id: callId,
              },
            };
            if (!isClaude) {
              partObj.thoughtSignature = DEFAULT_THOUGHT_SIGNATURE;
            }
            modelParts.push(partObj);
          }
          rawTurns.push({ role: "model", parts: modelParts });

          // Single user turn for all matching function responses
          const userParts: any[] = [];
          for (let tmIdx = 0; tmIdx < matchingToolMsgs.length; tmIdx++) {
            const tm = matchingToolMsgs[tmIdx];
            const callId = tm.tool_call_id || toolCalls[tmIdx]?.id || `call_${Date.now()}_${tmIdx}`;
            const fnName = toolIdToName.get(callId) || toolCalls[tmIdx]?.function?.name || "tool_output";
            let responseObj: any = { output: tm.content };
            try {
              const parsed = JSON.parse(tm.content);
              if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                responseObj = parsed;
              } else {
                responseObj = { output: parsed !== undefined ? parsed : tm.content };
              }
            } catch {}
            userParts.push({
              functionResponse: {
                name: fnName,
                response: responseObj,
                id: callId,
              },
            });
          }
          rawTurns.push({ role: "user", parts: userParts });

          // Advance index past assistant and matched tool messages
          i = lookAhead;
        } else {
          // Unfulfilled tool calls (aborted, interrupted by user prompt, etc.)
          // Downgrade to plain text so Gemini backend does not require a functionResponse turn
          const modelParts: any[] = [];
          if (text.trim()) modelParts.push({ text: text.trim() });
          for (const tc of toolCalls) {
            modelParts.push({
              text: `[Called tool ${tc.function?.name || "tool"} with arguments: ${typeof tc.function?.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {})}]`,
            });
          }
          if (modelParts.length === 0) {
            modelParts.push({ text: "..." });
          }
          rawTurns.push({ role: "model", parts: modelParts });
          i++;
        }
      }
    } else if (role === "tool") {
      // Orphan tool message (did not immediately follow a model turn with matching functionCall)
      // Downgrade to text so Gemini does not reject it with HTTP 400
      const fnName = toolIdToName.get(msg.tool_call_id) || "tool";
      const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
      rawTurns.push({
        role: "user",
        parts: [{ text: `[Tool Output for ${fnName}]:\n${text || "(empty output)"}` }],
      });
      i++;
    } else {
      i++;
    }
  }

  // Third pass: Merge consecutive turns of the same role
  const contents: any[] = [];
  for (const turn of rawTurns) {
    // Filter out parts with empty text (prevent Anthropic on Vertex rejecting with "text: Field required")
    turn.parts = turn.parts.filter((p: any) => {
      if (p.text !== undefined && typeof p.text === "string" && !p.text.trim()) {
        return false;
      }
      return true;
    });

    if (turn.parts.length === 0) {
      turn.parts.push({ text: turn.role === "user" ? " " : "..." });
    }

    if (contents.length === 0) {
      contents.push(turn);
      continue;
    }
    const lastTurn = contents[contents.length - 1];
    if (lastTurn.role === turn.role) {
      lastTurn.parts.push(...turn.parts);
    } else {
      contents.push(turn);
    }
  }

  // Ensure first turn is 'user' (Gemini & Anthropic Vertex strict requirement)
  if (contents.length > 0 && contents[0].role === "model") {
    contents.unshift({
      role: "user",
      parts: [{ text: "Hello" }],
    });
  }

  // Ensure last turn is NOT 'model' ("Requests ending with a model turn are not supported")
  if (contents.length > 0 && contents[contents.length - 1].role === "model") {
    contents.push({
      role: "user",
      parts: [{ text: "Continue" }],
    });
  }

  const systemInstruction = systemTexts.length > 0
    ? { parts: [{ text: systemTexts.join("\n\n") }] }
    : undefined;

  if (systemInstruction?.parts) {
    for (const part of systemInstruction.parts) {
      if (typeof part.text === "string") {
        for (const { from, to } of ANTIGRAVITY_PROMPT_REWRITES) {
          part.text = part.text.replaceAll(from, to as any);
        }
      }
    }
  }

  return { contents, systemInstruction };
}

/**
 * Cleans and transforms any JSON Schema into a strict Google Cloud / Antigravity Gemini Schema protobuf.
 * Uses a strict whitelist approach so that unknown vendor properties (like `encrypted`, `title`, `default`,
 * `format`, `additionalProperties`, etc.) can never leak into Google's strict Protobuf parser.
 */
export function cleanJSONSchemaForAntigravity(schema: any): any {
  if (!schema || typeof schema !== "object") {
    return {
      type: "object",
      properties: {
        reason: { type: "string", description: "Reason for action" },
      },
      required: ["reason"],
    };
  }

  function cleanNode(node: any): any {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(cleanNode);

    // Handle anyOf / oneOf by taking the first concrete non-null branch
    if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
      const branch = node.anyOf.find((b: any) => b && b.type && b.type !== "null") || node.anyOf[0];
      const copy = { ...node };
      delete copy.anyOf;
      return cleanNode({ ...copy, ...branch });
    }
    if (Array.isArray(node.oneOf) && node.oneOf.length > 0) {
      const branch = node.oneOf.find((b: any) => b && b.type && b.type !== "null") || node.oneOf[0];
      const copy = { ...node };
      delete copy.oneOf;
      return cleanNode({ ...copy, ...branch });
    }
    if (Array.isArray(node.allOf) && node.allOf.length > 0) {
      let merged: any = { ...node };
      delete merged.allOf;
      for (const branch of node.allOf) {
        if (branch && typeof branch === "object") {
          merged = {
            ...merged,
            ...branch,
            properties: { ...(merged.properties || {}), ...(branch.properties || {}) },
          };
        }
      }
      return cleanNode(merged);
    }

    const result: any = {};

    // Normalize type
    if (Array.isArray(node.type)) {
      const t = node.type.find((x: string) => x !== "null") || "string";
      result.type = String(t).toLowerCase();
      if (node.type.includes("null")) {
        result.nullable = true;
      }
    } else if (typeof node.type === "string") {
      result.type = node.type.toLowerCase();
    } else if (node.properties) {
      result.type = "object";
    } else if (node.items) {
      result.type = "array";
    }

    if (typeof node.description === "string" && node.description.trim()) {
      result.description = node.description;
    }

    if (node.nullable === true) {
      result.nullable = true;
    }

    if (Array.isArray(node.enum)) {
      result.enum = node.enum.map((e: any) => String(e));
    }

    // Process properties for objects
    if (node.properties && typeof node.properties === "object" && !Array.isArray(node.properties)) {
      result.properties = {};
      for (const [propName, propSchema] of Object.entries(node.properties)) {
        if (propSchema && typeof propSchema === "object") {
          result.properties[propName] = cleanNode(propSchema);
        } else {
          result.properties[propName] = { type: "string" };
        }
      }
    }

    // Process items for arrays
    if (node.items && typeof node.items === "object") {
      result.items = cleanNode(node.items);
    }

    // Process required fields
    if (Array.isArray(node.required) && result.properties) {
      const validRequired = node.required.filter((key: any) =>
        typeof key === "string" && Object.prototype.hasOwnProperty.call(result.properties, key)
      );
      if (validRequired.length > 0) {
        result.required = validRequired;
      }
    }

    // Default empty object handling: Antigravity requires non-empty properties for object schemas
    if (result.type === "object" && (!result.properties || Object.keys(result.properties).length === 0)) {
      result.properties = {
        reason: {
          type: "string",
          description: "Brief explanation of why you are calling this tool",
        },
      };
      result.required = ["reason"];
    }

    // Default array items handling: array must define items schema
    if (result.type === "array" && !result.items) {
      result.items = { type: "string" };
    }

    return result;
  }

  return cleanNode(schema);
}

function sanitizeFunctionName(name: string): string {
  if (!name) return "_unknown";
  let s = name.replace(/[^a-zA-Z0-9_.:\-]/g, "_");
  if (!/^[a-zA-Z_]/.test(s)) s = "_" + s;
  return s.substring(0, 64);
}

const ANTIGRAVITY_PROMPT_REWRITES = [
  { from: "You are a Claude agent, built on Anthropic's Claude Agent SDK.", to: "" },
  { from: /^x-anthropic-billing-header:[^\n]*(?:\r?\n)*/gim, to: "" },
];

/**
 * Maps model alias to internal Antigravity wire model name
 */
function mapToWireModel(model: string): string {
  const lower = model.toLowerCase().replace(/^(ag\/|antigravity\/|google-ag\/|gem\/|gemini\/|gcli\/|gemini-cli\/|google\/)/i, "");
  if (lower.startsWith("claude-opus-4-6-thinking")) return "claude-opus-4-6-thinking";
  if (lower.startsWith("claude-sonnet-4-6")) return "claude-sonnet-4-6";
  if (lower.startsWith("claude-")) return lower;
  if (lower.startsWith("gemini-3.8-flash-high")) return "gemini-3.8-flash-high";
  if (lower.startsWith("gemini-3.8-flash-medium")) return "gemini-3.8-flash-medium";
  if (lower.startsWith("gemini-3.8-flash-low")) return "gemini-3.8-flash-low";
  if (lower.startsWith("gemini-3.8-flash")) return "gemini-3.8-flash-medium";
  if (lower.startsWith("gemini-3.7-flash-high")) return "gemini-3.7-flash-high";
  if (lower.startsWith("gemini-3.7-flash-medium")) return "gemini-3.7-flash-medium";
  if (lower.startsWith("gemini-3.7-flash-low")) return "gemini-3.7-flash-low";
  if (lower.startsWith("gemini-3.7-flash")) return "gemini-3.7-flash-medium";
  if (lower.startsWith("gemini-3.6-flash-high")) return "gemini-3.6-flash-high";
  if (lower.startsWith("gemini-3.6-flash-medium")) return "gemini-3.6-flash-medium";
  if (lower.startsWith("gemini-3.6-flash-low")) return "gemini-3.6-flash-low";
  if (lower.startsWith("gemini-3.5-flash-high")) return "gemini-3.5-flash-high";
  if (lower.startsWith("gemini-3.5-flash-medium")) return "gemini-3.5-flash-medium";
  if (lower.startsWith("gemini-3.5-flash-low")) return "gemini-3.5-flash-low";
  if (lower.startsWith("gemini-3.5-flash-extra-low")) return "gemini-3.5-flash-extra-low";
  if (lower.startsWith("gemini-3.5-flash-lite")) return "gemini-3.5-flash-lite";
  if (lower.startsWith("gemini-3-flash-agent")) return "gemini-3-flash-agent";
  if (lower.startsWith("gemini-3-flash")) return "gemini-3-flash";
  if (lower.startsWith("gemini-3.1-pro-high")) return "gemini-3.1-pro-high";
  if (lower.startsWith("gemini-3.1-pro-low")) return "gemini-3.1-pro-low";
  if (lower.startsWith("gemini-pro-agent")) return "gemini-pro-agent";
  if (lower.startsWith("gpt-oss-120b-medium")) return "gpt-oss-120b-medium";
  if (lower.startsWith("gemini-2.5-flash")) return "gemini-2.5-flash";
  if (lower.startsWith("gemini-2.5-pro")) return "gemini-2.5-pro";
  if (lower.startsWith("gemini-2.0-flash")) return "gemini-2.0-flash";
  if (lower.startsWith("gemini-1.5-flash")) return "gemini-1.5-flash";
  if (lower.startsWith("gemini-1.5-pro")) return "gemini-1.5-pro";
  return lower || "gemini-2.5-flash";
}

/**
 * Dispatches an OpenAI chat completion request to Google Antigravity (Cloud Code Assist) backend,
 * and streams or aggregates the result in standard OpenAI format.
 */
export async function dispatchAntigravityChat(params: AntigravityDispatchParams): Promise<Response> {
  const startTime = Date.now();
  let currentToken = params.accessToken;
  const wireModel = mapToWireModel(params.model);
  const responseModel = params.clientRequestedModel || params.model;
  const logModel = params.upstreamLogModel || params.model;
  const projectId = await getEffectiveProjectId(currentToken);

  const isClaude = wireModel.includes("claude");
  const { contents, systemInstruction } = convertOpenAiMessagesToGemini(params.parsedBody.messages || [], wireModel);

  const generationConfig: any = {};
  if (params.parsedBody.max_tokens) {
    const requestedMax = Number(params.parsedBody.max_tokens);
    generationConfig.maxOutputTokens = isClaude ? Math.min(requestedMax, 8192) : requestedMax;
  } else {
    generationConfig.maxOutputTokens = isClaude ? 8192 : wireModel.includes("thinking") ? 16384 : 4096;
  }
  if (params.parsedBody.temperature !== undefined) {
    generationConfig.temperature = Number(params.parsedBody.temperature);
  }
  if (params.parsedBody.top_p !== undefined) {
    generationConfig.topP = Number(params.parsedBody.top_p);
  }
  const reasoningEffort = params.parsedBody.reasoning_effort;
  let thinkingBudget = 4096;
  if (reasoningEffort === "high") thinkingBudget = 8192;
  if (reasoningEffort === "low") thinkingBudget = 1024;
  if (wireModel.includes("high")) thinkingBudget = 8192;
  if (wireModel.includes("low")) thinkingBudget = 1024;

  generationConfig.thinkingConfig = {
    includeThoughts: true,
    thinkingBudget,
  };

  let geminiTools: any[] | undefined = undefined;
  if (Array.isArray(params.parsedBody.tools) && params.parsedBody.tools.length > 0) {
    const declarations: any[] = [];
    for (const t of params.parsedBody.tools) {
      const fn = t.function || t;
      if (fn && fn.name) {
        declarations.push({
          name: sanitizeFunctionName(fn.name),
          description: fn.description || "",
          parameters: cleanJSONSchemaForAntigravity(fn.parameters || { type: "object", properties: {} }),
        });
      }
    }
    if (declarations.length > 0) {
      geminiTools = [{ functionDeclarations: declarations }];
    }
  }

  // Gemini toolConfig: resolve mode dynamically from tool_choice
  let toolConfig: any = undefined;
  if (geminiTools) {
    const rawChoice = params.parsedBody.tool_choice;
    if (wireModel.includes("claude")) {
      // Claude on Antigravity Cloud Code only reliably accepts VALIDATED / AUTO; mode ANY causes silent STOP
      toolConfig = { functionCallingConfig: { mode: "VALIDATED" } };
    } else if (rawChoice === "required" || rawChoice === "any") {
      toolConfig = { functionCallingConfig: { mode: "ANY" } };
    } else if (rawChoice === "none") {
      toolConfig = { functionCallingConfig: { mode: "NONE" } };
    } else if (typeof rawChoice === "object" && rawChoice?.function?.name) {
      toolConfig = {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: [sanitizeFunctionName(rawChoice.function.name)],
        },
      };
    } else {
      // 9router standard: mode "VALIDATED" prevents schema rejections and enforces strict schema compliance
      toolConfig = { functionCallingConfig: { mode: "VALIDATED" } };
    }
  }

  console.log("[DEBUG AG Contents Sent]", JSON.stringify(contents.map(c => ({ role: c.role, partsCount: c.parts?.length, firstPart: c.parts?.[0] })), null, 2));
  console.log("[DEBUG AG Tools Sent]", JSON.stringify(geminiTools, null, 2));
  console.log("[DEBUG AG ToolConfig Sent]", JSON.stringify(toolConfig, null, 2));

  const envelope = {
    project: projectId,
    model: wireModel,
    userAgent: "antigravity",
    requestType: "agent",
    request: {
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
      ...(geminiTools ? { tools: geminiTools } : {}),
      ...(toolConfig ? { toolConfig } : {}),
    },
  };

  const endpoints = [ANTIGRAVITY_ENDPOINT_DAILY, ANTIGRAVITY_ENDPOINT_PROD];

  let lastResponse: Response | null = null;
  let lastError = "";

  for (const endpoint of endpoints) {
    const url = `${endpoint}/v1internal:streamGenerateContent?alt=sse`;

    try {
      let res = await fetch(url, {
        method: "POST",
        headers: {
          ...ANTIGRAVITY_HEADERS,
          Authorization: `Bearer ${currentToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(envelope),
      });

      // Handle 401: Refresh token and retry once
      if (res.status === 401 && params.connectionId) {
        try {
          currentToken = await refreshConnectionOn401(params.connectionId);
          res = await fetch(url, {
            method: "POST",
            headers: {
              ...ANTIGRAVITY_HEADERS,
              Authorization: `Bearer ${currentToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(envelope),
          });
        } catch {}
      }

      if (res.ok) {
        lastResponse = res;
        break;
      } else {
        const errText = await res.text().catch(() => "");
        console.error("[ANTIGRAVITY REJECT]", res.status, endpoint, errText);
        console.error("[ANTIGRAVITY ENVELOPE KEYS]", Object.keys(envelope.request || {}));
        lastError = `Upstream ${endpoint} returned HTTP ${res.status}: ${errText.slice(0, 500)}`;
        if (res.status === 429) {
          // If 429 on daily, try next endpoint
          continue;
        }
        // Don't retry non-429 errors (e.g. 400) on PROD to prevent false quota exhaustion
        break;
      }
    } catch (err: any) {
      lastError = err.message;
    }
  }

  if (!lastResponse || !lastResponse.body) {
    const durationMs = Date.now() - startTime;
    const isRateLimit = lastError.includes("429") || lastError.includes("RESOURCE_EXHAUSTED");
    const isInvalidArgument = lastError.includes("400") || lastError.includes("INVALID_ARGUMENT");
    const errStatus = isRateLimit ? 429 : isInvalidArgument ? 400 : 502;

    adminLogger.error({
      message: `Antigravity rejected: ${lastError}`,
      durationMs,
      model: responseModel,
      upstreamModel: logModel,
      status: errStatus,
    });

    logUpstreamRequest({
      connectionId: params.connectionId,
      provider: "ANTIGRAVITY",
      model: logModel,
      clientApiKeyId: params.clientApiKeyId,
      clientUserId: params.clientUserId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: durationMs,
      statusCode: errStatus,
      isFailover: false,
      failoverReason: lastError,
    }).catch(() => {});

    // Clean user-facing message (raw technical trace is preserved in UpstreamLog for admin)
    const friendlyMessage = isRateLimit
      ? `Model '${params.model}' sedang mencapai batas antrean atau kuota sementara. Silakan coba sesaat lagi atau gunakan model alternatif.`
      : isInvalidArgument
      ? `Format permintaan tidak didukung atau parameter tidak valid.`
      : `Layanan provider upstream sedang mengalami kendala sementara. Silakan coba kembali dalam beberapa saat.`;

    return new Response(
      JSON.stringify({
        error: {
          message: friendlyMessage,
          type: isRateLimit ? "rate_limit_error" : isInvalidArgument ? "invalid_request_error" : "upstream_error",
          code: errStatus,
        },
      }),
      { status: errStatus, headers: { "Content-Type": "application/json" } }
    );
  }

  const completionId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  // Case 1: Client requested Streaming (OpenAI SSE)
  if (params.clientWantsStream) {
    const upstreamBody = lastResponse.body;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let toolCallCounter = 0;
    let hasToolCalls = false;
    let firstTokenTime: number | null = null;
    let sseBuffer = "";

    const processCandidateLine = (trimmed: string, controller: TransformStreamDefaultController) => {
      if (!trimmed.startsWith("data: ")) return;

      try {
        const data = JSON.parse(trimmed.slice(6));
        const candidate = data.response?.candidates?.[0];

        if (candidate) {
          console.log("[DEBUG AG Chunk]", {
            finishReason: candidate?.finishReason,
            partsCount: candidate?.content?.parts?.length,
            parts: candidate?.content?.parts?.map((p: any) => ({
              thought: p.thought,
              text: p.text?.slice(0, 40),
              fn: p.functionCall?.name,
            })),
          });
        }

        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (!firstTokenTime && (part.text || part.functionCall)) {
              firstTokenTime = Date.now();
            }
            if (part.text && part.thought) {
              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: responseModel,
                choices: [
                  {
                    index: 0,
                    delta: { reasoning_content: part.text },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            } else if (part.text && !part.thought) {
              const chunkPayload = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: responseModel,
                choices: [
                  {
                    index: 0,
                    delta: { content: part.text },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkPayload)}\n\n`));
            } else if (part.functionCall) {
              hasToolCalls = true;
              const tcIndex = toolCallCounter++;
              const callId = part.functionCall.id || `call_${Date.now()}_${tcIndex}`;
              const argsStr = typeof part.functionCall.args === "string"
                ? part.functionCall.args
                : JSON.stringify(part.functionCall.args || {});

              // Emit tool call header (name + id) in one chunk
              const headerChunk = {
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: responseModel,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: tcIndex,
                          id: callId,
                          type: "function",
                          function: {
                            name: part.functionCall.name,
                            arguments: "",
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(headerChunk)}\n\n`));

              // Emit arguments in a separate chunk (simulating streaming delta)
              if (argsStr) {
                const argsChunk = {
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: responseModel,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: tcIndex,
                            function: {
                              arguments: argsStr,
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(argsChunk)}\n\n`));
              }
            }
          }
        }

        if (data.response?.usageMetadata) {
          promptTokens = data.response.usageMetadata.promptTokenCount || promptTokens;
          completionTokens = data.response.usageMetadata.candidatesTokenCount || completionTokens;
          totalTokens = data.response.usageMetadata.totalTokenCount || (promptTokens + completionTokens);
        }
      } catch {}
    };

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        sseBuffer += new TextDecoder().decode(chunk);
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            processCandidateLine(trimmed, controller);
          }
        }
      },
      flush(controller) {
        if (sseBuffer.trim()) {
          processCandidateLine(sseBuffer.trim(), controller);
          sseBuffer = "";
        }
        // Send final chunk with correct finish_reason and [DONE]
        const finalChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: responseModel,
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
        const ttftMs = firstTokenTime ? firstTokenTime - startTime : undefined;
        const rtkSaved = params.tokensSavedRtk || 0;

        adminLogger.done({
          durationMs,
          ttftMs,
          promptTokens: (promptTokens || 15) + rtkSaved,
          completionTokens: completionTokens || 25,
          rtkSavings: rtkSaved,
          model: responseModel,
          upstreamModel: logModel,
        });

        logUpstreamRequest({
          connectionId: params.connectionId,
          provider: "ANTIGRAVITY",
          model: logModel,
          clientApiKeyId: params.clientApiKeyId,
          clientUserId: params.clientUserId,
          promptTokens: promptTokens || 15,
          completionTokens: completionTokens || 25,
          totalTokens: totalTokens || (promptTokens + completionTokens) || 40,
          tokensSavedRtk: rtkSaved,
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
        "Connection": "keep-alive",
      },
    });
  }

  // Case 2: Client requested Non-Streaming (Standard OpenAI JSON)
  const rawText = await lastResponse.text();
  const durationMs = Date.now() - startTime;

  let accumulatedContent = "";
  let accumulatedReasoning = "";
  const accumulatedToolCalls: any[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  const lines = rawText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;

    try {
      const data = JSON.parse(trimmed.slice(6));
      const candidate = data.response?.candidates?.[0];

      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text && part.thought) {
            accumulatedReasoning += part.text;
          } else if (part.text && !part.thought) {
            accumulatedContent += part.text;
          } else if (part.functionCall) {
            accumulatedToolCalls.push({
              id: part.functionCall.id || `call_${Date.now()}`,
              type: "function",
              function: {
                name: part.functionCall.name,
                arguments: typeof part.functionCall.args === "string"
                  ? part.functionCall.args
                  : JSON.stringify(part.functionCall.args || {}),
              },
            });
          }
        }
      }

      if (data.response?.usageMetadata) {
        promptTokens = data.response.usageMetadata.promptTokenCount || promptTokens;
        completionTokens = data.response.usageMetadata.candidatesTokenCount || completionTokens;
        totalTokens = data.response.usageMetadata.totalTokenCount || (promptTokens + completionTokens);
      }
    } catch {}
  }

  const rtkSaved = params.tokensSavedRtk || 0;
  const upstreamPrompt = promptTokens || 15;
  const upstreamTotal = totalTokens || (upstreamPrompt + completionTokens) || 40;

  logUpstreamRequest({
    connectionId: params.connectionId,
    provider: "ANTIGRAVITY",
    model: logModel,
    clientApiKeyId: params.clientApiKeyId,
    clientUserId: params.clientUserId,
    promptTokens: upstreamPrompt,
    completionTokens: completionTokens || 25,
    totalTokens: upstreamTotal,
    tokensSavedRtk: rtkSaved,
    latencyMs: durationMs,
    statusCode: 200,
    isFailover: false,
  }).catch(() => {});

  const assistantMessage: any = {
    role: "assistant",
    content: accumulatedContent || (accumulatedToolCalls.length === 0 && accumulatedReasoning ? (accumulatedReasoning.slice(-300).trim() || "Thought process completed.") : null),
  };
  if (accumulatedReasoning) {
    assistantMessage.reasoning_content = accumulatedReasoning;
  }
  if (accumulatedToolCalls.length > 0) {
    assistantMessage.tool_calls = accumulatedToolCalls;
  }

  const openAiResponse = {
    id: completionId,
    object: "chat.completion",
    created,
    model: responseModel,
    choices: [
      {
        index: 0,
        message: assistantMessage,
        finish_reason: accumulatedToolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: upstreamPrompt + rtkSaved,
      completion_tokens: completionTokens || 25,
      total_tokens: upstreamTotal + rtkSaved,
    },
  };

  adminLogger.done({
    durationMs,
    promptTokens: upstreamPrompt + rtkSaved,
    completionTokens: completionTokens || 25,
    rtkSavings: rtkSaved,
    model: responseModel,
    upstreamModel: logModel,
  });

  return new Response(JSON.stringify(openAiResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
