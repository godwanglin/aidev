import { logUpstreamRequest } from "@/lib/router";
import { logRequest } from "@/lib/logger";

export interface ResponsesDispatchParams {
  rawBody: string;
  parsedBody: any;
  targetBase: string;
  targetKey: string;
  activeProvider: string;
  activeConnectionId?: string | null;
  clientApiKeyId?: string | null;
  clientUserId?: string | null;
  reqPath: string;
  clientWantsStream: boolean;
}

/**
 * Qualify a tool name with its namespace for Chat Completions flattening (9router pattern).
 */
export function qualifyToolName(ns: string, name: string): string {
  if (!ns || !name) return name;
  if (ns === "functions") return name;
  if (ns.startsWith("mcp__") && ns.endsWith("__")) return ns + name;
  return "mcp__" + ns + "__" + name;
}

/**
 * Decode a flat Chat Completions tool name back into { name, ns } (9router pattern).
 * Handles 'functions.exec' -> { name: 'exec', ns: 'functions' },
 * 'mcp__server__tool' -> { name: 'tool', ns: 'mcp__server__' }
 */
export function decodeToolName(flat?: string): { name: string; ns: string } {
  if (!flat) return { name: "", ns: "" };
  if (flat.startsWith("functions.")) {
    return { name: flat.slice(10), ns: "functions" };
  }
  if (flat.startsWith("mcp__")) {
    const rest = flat.slice(5);
    const idx = rest.indexOf("__");
    if (idx > 0) {
      const server = rest.slice(0, idx);
      const tool = rest.slice(idx + 2);
      return { name: tool, ns: "mcp__" + server + "__" };
    }
  }
  return { name: flat, ns: "" };
}

export function normalizeToolName(name?: string): string {
  return decodeToolName(name).name;
}

/**
 * Coerce Responses API tool output into clean string format (9router pattern).
 * Unwraps [{ type: "input_text", text: "..." }] arrays or objects into raw text.
 */
export function coerceResponsesOutput(value: any): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    return value
      .map((c) => {
        try {
          if (typeof c === "string") return c;
          if (c && typeof c === "object") {
            return c.text ?? c.output_text ?? c.input_text ?? JSON.stringify(c);
          }
          return String(c);
        } catch {
          return String(c);
        }
      })
      .join("");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const CODEX_APPLY_PATCH_DESC = `Apply changes to existing files, create new files, or delete files in the workspace.
Input MUST strictly follow the unified patch format:
*** Begin Patch
*** Update File: path/to/file.ext
@@
 context line
-deleted line
+added line
*** End Patch

For creating a new file:
*** Begin Patch
*** Add File: path/to/file.ext
+first line
+second line
*** End Patch

For deleting a file:
*** Begin Patch
*** Delete File: path/to/file.ext
*** End Patch`;

export const CODEX_EXEC_DESC = "Execute a shell or terminal command in the workspace environment.";

/**
 * Extracts all tools declared in a Responses API payload.
 * Codex Desktop sends tools in BOTH `parsedBody.tools` AND `parsedBody.input` (under `type: "additional_tools"`).
 * (9router pattern: merge top-level tools and additional_tools).
 * In follow-up turns, Codex Desktop often omits tools; this function ensures apply_patch
 * and exec are ALWAYS preserved and available to downstream models.
 */
export function extractAllResponsesTools(parsedBody: any): any[] {
  const tools: any[] = [];
  if (Array.isArray(parsedBody?.tools) && parsedBody.tools.length > 0) {
    tools.push(...parsedBody.tools);
  }
  const inputItems = Array.isArray(parsedBody?.input) ? parsedBody.input : [];
  for (const item of inputItems) {
    if (item && item.type === "additional_tools" && Array.isArray(item.tools)) {
      tools.push(...item.tools);
    }
    // Also inspect conversation history for any previously used tools
    if (item && (item.type === "custom_tool_call" || item.type === "function_call") && item.name) {
      const bare = normalizeToolName(item.name);
      if (bare && !tools.some((t: any) => normalizeToolName(t.name || t.function?.name) === bare)) {
        tools.push({
          type: "custom",
          name: item.name,
          description: bare === "apply_patch" ? CODEX_APPLY_PATCH_DESC : bare === "exec" ? CODEX_EXEC_DESC : `Custom tool: ${item.name}`,
        });
      }
    }
  }

  // Always ensure standard Codex tools are present so the agent never loses file-editing capability across turns
  const hasApplyPatch = tools.some((t: any) => normalizeToolName(t.name || t.function?.name) === "apply_patch");
  const hasExec = tools.some((t: any) => {
    const n = normalizeToolName(t.name || t.function?.name);
    return n === "exec" || n === "container.exec";
  });

  if (!hasApplyPatch) {
    tools.push({
      type: "custom",
      name: "apply_patch",
      description: CODEX_APPLY_PATCH_DESC,
    });
  }
  if (!hasExec) {
    tools.push({
      type: "custom",
      name: "exec",
      description: CODEX_EXEC_DESC,
    });
  }

  return tools;
}

/**
 * Normalizes Responses API tools array to standard OpenAI Chat Completions tools.
 * Handles standard function tools, namespace tools, and custom_tool_call types (apply_patch, exec, etc.)
 * by shimming custom tools as regular function declarations (9router pattern).
 */
export function convertResponsesToolsToChatTools(tools: any[]): any[] {
  if (!Array.isArray(tools)) return [];
  const result: any[] = [];
  const seen = new Set<string>();

  for (const t of tools) {
    if (!t) continue;

    // Namespace tools (e.g. Codex Desktop sends { type: "namespace", name: "functions", tools: [...] })
    if (t.type === "namespace" && Array.isArray(t.tools)) {
      const ns = t.name || "";
      for (const inner of t.tools) {
        if (!inner) continue;
        const rawInnerName = inner.name || (inner.function && inner.function.name) || "";
        if (!rawInnerName || typeof rawInnerName !== "string" || !rawInnerName.trim()) continue;
        const bareName = normalizeToolName(rawInnerName);
        if (seen.has(bareName)) continue;
        seen.add(bareName);

        if (inner.type === "custom" || bareName === "apply_patch" || bareName === "exec" || bareName === "container.exec") {
          let desc = String(inner.description || "");
          if (bareName === "apply_patch") {
            desc = CODEX_APPLY_PATCH_DESC;
          } else if (bareName === "exec" || bareName === "container.exec") {
            desc = CODEX_EXEC_DESC;
          }
          result.push({
            type: "function",
            function: {
              name: bareName,
              description: desc,
              parameters: {
                type: "object",
                properties: bareName === "apply_patch" ? {
                  input: {
                    type: "string",
                    description: `Patch string for apply_patch`,
                  },
                } : {
                  cmd: {
                    type: "string",
                    description: `Shell command to run in the workspace terminal`,
                  },
                  input: {
                    type: "string",
                    description: `Raw command or script to execute`,
                  },
                },
                required: [bareName === "apply_patch" ? "input" : "cmd"],
                additionalProperties: true,
              },
            },
          });
        } else {
          result.push({
            type: "function",
            function: {
              name: bareName,
              description: inner.description || (inner.function && inner.function.description) || "",
              parameters: inner.parameters || (inner.function && inner.function.parameters) || { type: "object", properties: {} },
              ...(inner.strict !== undefined ? { strict: inner.strict } : {}),
            },
          });
        }
      }
      continue;
    }

    const rawName = t.name || (t.function && t.function.name) || "";
    const bareName = normalizeToolName(rawName);

    // Standard function tool in Responses format: { type: "function", name: "...", parameters: {...} }
    if (t.type === "function" && !t.function && rawName) {
      if (seen.has(bareName)) continue;
      seen.add(bareName);
      result.push({
        type: "function",
        function: {
          name: bareName,
          description: t.description || "",
          parameters: t.parameters || { type: "object", properties: {} },
          ...(t.strict !== undefined ? { strict: t.strict } : {}),
        },
      });
    }
    // Standard function tool in Chat format: { type: "function", function: { name: "..." } }
    else if (t.type === "function" && t.function) {
      if (!bareName || seen.has(bareName)) continue;
      seen.add(bareName);
      result.push({
        ...t,
        function: {
          ...t.function,
          name: bareName,
        },
      });
    }
    // Custom tools in Responses format (e.g. apply_patch from Codex): { type: "custom", name: "...", format: {...} }
    // Chat Completions has no freeform custom-tool declaration, so expose custom
    // tools as functions with one raw `input` string while retaining their names (9router pattern).
    else if (t.type === "custom" && rawName) {
      if (seen.has(bareName)) continue;
      seen.add(bareName);
      let desc = String(t.description || "");
      if (bareName === "apply_patch") {
        desc = CODEX_APPLY_PATCH_DESC;
      } else if (bareName === "exec" || bareName === "container.exec") {
        desc = CODEX_EXEC_DESC;
      } else {
        const formatHint = [t.format?.syntax, t.format?.definition].filter(Boolean).join("\n");
        desc = [desc, formatHint].filter(Boolean).join("\n\n");
      }
      result.push({
        type: "function",
        function: {
          name: bareName,
          description: desc,
          parameters: {
            type: "object",
            properties: bareName === "apply_patch" ? {
              input: {
                type: "string",
                description: `Patch string for apply_patch`,
              },
            } : {
              cmd: {
                type: "string",
                description: `Shell command to run in the workspace terminal`,
              },
              input: {
                type: "string",
                description: `Raw command or script to execute`,
              },
            },
            required: [bareName === "apply_patch" ? "input" : "cmd"],
            additionalProperties: true,
          },
        },
      });
    }
    // Codex web_search_preview / code_interpreter — skip, not usable for cross-provider
    else if (t.type === "web_search_preview" || t.type === "code_interpreter" || t.type === "file_search") {
      continue;
    }
    // Non-standard types (e.g. computer, etc.) — sanitize to type: "function" or skip
    else {
      if (t.function && typeof t.function.name === "string") {
        const fnName = normalizeToolName(t.function.name);
        if (!seen.has(fnName)) {
          seen.add(fnName);
          result.push({
            type: "function",
            function: {
              ...t.function,
              name: fnName,
            },
          });
        }
      } else if (typeof t.name === "string") {
        if (!seen.has(bareName)) {
          seen.add(bareName);
          result.push({
            type: "function",
            function: {
              name: bareName,
              description: t.description || "",
              parameters: t.parameters || { type: "object", properties: {} },
            },
          });
        }
      }
    }
  }
  return result;
}

/**
 * Converts Responses API input & instructions into standard Chat Completion messages.
 * Follows 9router's open-sse pattern for maximum cross-provider compatibility.
 */
export function convertResponsesToChatMessages(parsedBody: any): any[] {
  if (Array.isArray(parsedBody.messages)) {
    return parsedBody.messages;
  }

  const messages: any[] = [];

  const allTools = extractAllResponsesTools(parsedBody);
  const hasTools = allTools.length > 0;
  let systemContent = parsedBody.instructions ? String(parsedBody.instructions).trim() : "";

  // Build aggressive tool guidance (9router pattern: always inject when tools present)
  if (hasTools) {
    const toolNames: string[] = [];
    for (const t of allTools) {
      if (t.type === "namespace" && Array.isArray(t.tools)) {
        for (const inner of t.tools) {
          const rawName = inner.name || (inner.function && inner.function.name) || "";
          if (rawName) toolNames.push(normalizeToolName(rawName));
        }
      } else {
        const rawName = t.name || (t.function && t.function.name) || "";
        if (rawName) toolNames.push(normalizeToolName(rawName));
      }
    }
    const toolList = toolNames.length > 0 ? toolNames.map((n: string) => `\`${n}\``).join(", ") : "`apply_patch`, `exec`";

    const toolGuidance = [
      `[CRITICAL INSTRUCTION] You are an autonomous AI coding agent in OpenAI Codex Desktop.`,
      `You have access to these tools: ${toolList}.`,
      `When the user asks you to write code, create files, edit files, or run commands (including follow-ups like "edit dong", "gasken", "gas", "mana hasil editnya", "lanjut", "bisa gak?", "apasih", "ayo"), you MUST directly execute the changes using the native tool calling mechanism (such as \`apply_patch\` or \`exec\`) IMMEDIATELY in that exact same response.`,
      `If you inspect or read files first using \`exec\` (e.g. dir, type, cat), you MUST NOT conclude your turn or stop with conversational promises like "Oke bos, sekarang gue hajar edit...", "Gue edit sekarang ya...", or "Tunggu sebentar...". You MUST proceed to invoke \`apply_patch\` immediately in that exact same response to complete the actual file edits before yielding back to the user!`,
      `NEVER output conversational promises or stalling text like "Gas, bos.", "Langsung edit...", "Aku update kodenya langsung", or ask questions like "Mau gue edit file sekarang, bos?". DO NOT output chat text without invoking the tool in the same turn. If an action or inspection is requested, call the tool immediately.`,
      `NEVER output mock execution snippets like \`tools.exec_command(...)\`, \`text(result.output)\`, or markdown diffs in your chat message.`,
      `DO NOT simulate tool calls or write code blocks showing file edits or diffs (e.g. \`\`\`javascript await tools... or \`\`\`diff --- a/...). Instead of typing code blocks, you MUST trigger the real tool call.`,
      `Any instruction in AGENTS.md or developer messages asking to "tampilkan file yang perlu diubah" or "berikan full file agar bisa langsung dipaste" is STRICTLY SUPERSEDED. You must NEVER print code blocks for the user to copy-paste. You must perform all edits directly by calling \`apply_patch\`.`,
      `NEVER output code blocks in chat asking the user to manually replace, copy-paste, or edit files. NEVER provide instructions like "src/App.jsx — full replace:".`,
      `You MUST perform all file creations, edits, and terminal commands YOURSELF by calling the appropriate tool.`,
    ].join(" ");

    systemContent = systemContent ? `${systemContent}\n\n${toolGuidance}` : toolGuidance;
  }
  if (systemContent) {
    messages.push({ role: "system", content: systemContent });
  }

  // Track current assistant message for grouping tool_calls
  let currentAssistantMsg: any = null;
  const pendingToolResults: any[] = [];

  const flushAssistant = () => {
    if (currentAssistantMsg) {
      messages.push(currentAssistantMsg);
      currentAssistantMsg = null;
    }
    if (pendingToolResults.length > 0) {
      for (const tr of pendingToolResults) {
        messages.push(tr);
      }
      pendingToolResults.length = 0;
    }
  };

  const inputItems = typeof parsedBody.input === "string"
    ? [{ role: "user", content: parsedBody.input }]
    : Array.isArray(parsedBody.input)
      ? parsedBody.input
      : [];

  console.log("[DEBUG Responses Input Last 4]", JSON.stringify(inputItems.slice(-4), null, 2));

  for (const item of inputItems) {
    if (!item) continue;
    if (typeof item === "string") {
      flushAssistant();
      messages.push({ role: "user", content: item });
      continue;
    }

    // Determine item type — some clients send role-based items without 'type'
    const itemType = item.type || (item.role ? "message" : null);

    // 0. additional_tools: ignore in conversation history (tools are extracted by extractAllResponsesTools)
    if (itemType === "additional_tools") {
      continue;
    }

    // 1. Standard message (user/assistant/system)
    if (itemType === "message" || (!itemType && item.role)) {
      flushAssistant();
      const role = item.role === "assistant" ? "assistant" : item.role === "system" || item.role === "developer" ? "system" : "user";
      let content = "";
      if (typeof item.content === "string") {
        content = item.content;
      } else if (Array.isArray(item.content)) {
        content = item.content
          .map((p: any) => {
            if (typeof p === "string") return p;
            if (p && typeof p === "object") {
              return p.text || p.output_text || p.input_text || "";
            }
            return JSON.stringify(p);
          })
          .join("\n");
      }
      if (role === "assistant" && content) {
        content = content
          .replace(/<details[\s\S]*?<\/details>/gi, "")
          .replace(/<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>/gi, "")
          .replace(/<[\s|｜]*(?:DSML[\s|｜]*)?invoke[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*)?invoke>/gi, "")
          .replace(/<[\s|｜]*\/?(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
          .replace(/```(?:javascript|js)?\s*(?:(?:const\s+\w+\s*=\s*)?(?:await\s+)?tools\.[\s\S]*?)```/gi, "")
          .replace(/```(?:diff|patch)?\s*\n---[\s\S]*?```/gi, "")
          .replace(/```\s*\n---[\s\S]*?```/gi, "")
          .replace(/(?:await\s+)?tools\.apply_patch\s*\(\s*[`"'][\s\S]*?[`"']\s*\);?/gi, "")
          .trim();
      }
      const msgObj: any = { role, content: content || "..." };
      // Preserve reasoning_content for multi-turn continuity (required by thinking models like DeepSeek R1/v4-pro)
      if (item.role === "assistant") {
        msgObj.reasoning_content = item.reasoning_content ?? "";
      }
      if (Array.isArray(item.tool_calls)) {
        msgObj.tool_calls = item.tool_calls;
      }
      if (role === "user" && messages.length > 0 && messages[messages.length - 1].role === "user") {
        messages[messages.length - 1].content += "\n" + (content || "");
      } else {
        messages.push(msgObj);
      }
      continue;
    }

    // 2. function_call — group into assistant message with tool_calls
    if (itemType === "function_call") {
      if (!currentAssistantMsg) {
        currentAssistantMsg = { role: "assistant", content: null, reasoning_content: "", tool_calls: [] };
      }
      if (!item.name || typeof item.name !== "string" || !item.name.trim()) continue;
      const bareName = normalizeToolName(item.name);
      currentAssistantMsg.tool_calls.push({
        id: item.call_id || item.id || `call_${Date.now()}`,
        type: "function",
        function: {
          name: bareName || item.name,
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments || {}),
        },
      });
      continue;
    }

    // 3. custom_tool_call (apply_patch, container.exec, etc.) — shim as function call
    if (itemType === "custom_tool_call") {
      if (!currentAssistantMsg) {
        currentAssistantMsg = { role: "assistant", content: null, reasoning_content: "", tool_calls: [] };
      }
      if (!item.name || typeof item.name !== "string" || !item.name.trim()) continue;
      const bareName = normalizeToolName(item.name);
      const inputStr = typeof item.input === "string" ? item.input : JSON.stringify(item.input ?? "");
      let argsObj: any = { input: inputStr };
      if (bareName === "exec" || bareName === "container.exec") {
        argsObj = { cmd: inputStr, input: inputStr };
      }
      currentAssistantMsg.tool_calls.push({
        id: item.call_id || item.id || `call_${Date.now()}`,
        type: "function",
        function: {
          name: bareName || item.name,
          arguments: JSON.stringify(argsObj),
        },
      });
      continue;
    }

    // 4. function_call_output — tool result
    if (itemType === "function_call_output") {
      flushAssistant();
      messages.push({
        role: "tool",
        tool_call_id: item.call_id || item.id,
        content: coerceResponsesOutput(item.output),
      });
      continue;
    }

    // 5. custom_tool_call_output — shim as tool result
    if (itemType === "custom_tool_call_output") {
      flushAssistant();
      messages.push({
        role: "tool",
        tool_call_id: item.call_id || item.id,
        content: coerceResponsesOutput(item.output),
      });
      continue;
    }

    // 6. reasoning — skip (used for multi-turn continuity, not useful for chat providers)
    if (itemType === "reasoning") {
      continue;
    }

    // 7. Tool response (role: "tool")
    if (item.role === "tool") {
      flushAssistant();
      messages.push({
        role: "tool",
        tool_call_id: item.tool_call_id || item.call_id || item.id,
        content: typeof item.content === "string" ? item.content : JSON.stringify(item.content || ""),
      });
      continue;
    }

    // Fallback: treat as user message
    flushAssistant();
    const content = typeof item.content === "string" ? item.content : JSON.stringify(item);
    messages.push({ role: "user", content });
  }

  // Flush any remaining assistant message
  flushAssistant();

  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hello" });
  }

  // Inject critical reminder into the last user message to enforce native tool invocation
  const isAfterTool = messages.length > 0 && messages[messages.length - 1].role === "tool";
  if (hasTools && messages.length > 0 && !isAfterTool) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const reminder = `\n\n[CRITICAL CODEX DIRECTIVE: You are an autonomous coding agent running in OpenAI Codex Desktop on Windows. You have access to native tools: \`apply_patch\` and \`exec\`.
If the user asks to edit files, create files, or sends follow-ups/pings (e.g. "coba edit lagi", "WOI", "bisa gak?", "lanjut", "BOHONG", "kok gak ke edit"), you MUST NOT reply with conversational chat text or stalling promises like "Siap bos" or apologize.
You MUST IMMEDIATELY execute the requested action by invoking the appropriate native tool directly in this response:
1. To edit or write files, invoke \`apply_patch\` using Codex patch format:
*** Begin Patch
*** Update File: <full_or_relative_path>
@@
 <context lines>
-<deleted lines>
+<added lines>
*** End Patch
(For new files, use '*** Add File: <path>' with '+' before each line).
2. To run commands or inspect files, invoke \`exec\` with:
const r = await tools.exec_command({ cmd: "<powershell_command>" }); text(r.output);
NEVER print code blocks or simulated edits in chat text. You MUST invoke a native tool directly in this response.]`;
        if (typeof messages[i].content === "string") {
          messages[i].content += reminder;
        } else if (Array.isArray(messages[i].content)) {
          messages[i].content.push({ type: "text", text: reminder });
        }
        break;
      }
    }
  }

  return messages;
}


/**
 * Cross-protocol adapter for POST /v1/responses.
 * Translates Responses API payloads to Chat Completions for non-Codex providers (Antigravity, Gemini, DeepSeek, etc.)
 * and wraps output in standard OpenAI Responses API format.
 */
export async function dispatchResponsesCrossProvider(params: ResponsesDispatchParams): Promise<Response> {
  const startTime = Date.now();
  const responseId = `resp_${Date.now()}`;
  const modelName = params.parsedBody.model || "default";

  const chatMessages = convertResponsesToChatMessages(params.parsedBody);
  const chatPayload = {
    model: modelName,
    messages: chatMessages,
    stream: params.clientWantsStream,
  };

  const internalChatUrl = "http://localhost:3000/v1/chat/completions";
  const upstreamRes = await fetch(internalChatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer sk-int-testbench999900001111222233334444`,
    },
    body: JSON.stringify(chatPayload),
  });

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text();
    return new Response(
      JSON.stringify({
        error: {
          message: `Upstream error: ${errText.slice(0, 150)}`,
          type: "upstream_error",
        },
      }),
      { status: upstreamRes.status, headers: { "Content-Type": "application/json" } }
    );
  }

  // Case 1: Client wants Streaming (OpenAI Responses SSE format)
  if (params.clientWantsStream && upstreamRes.body) {
    const upstreamBody = upstreamRes.body;
    let accumulatedText = "";
    let promptTokens = 20;
    let completionTokens = 0;
    let buffer = "";
    let sentInit = false;

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ") || trimmed.includes("[DONE]")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            const deltaContent = data.choices?.[0]?.delta?.content;

            if (!sentInit) {
              sentInit = true;
              const respCreated = {
                type: "response.created",
                response: {
                  id: responseId,
                  object: "response",
                  created_at: Math.floor(Date.now() / 1000),
                  status: "in_progress",
                  model: modelName,
                },
              };
              const itemAdded = {
                type: "response.output_item.added",
                item: {
                  id: `msg_${Date.now()}`,
                  type: "message",
                  status: "in_progress",
                  role: "assistant",
                },
              };
              controller.enqueue(new TextEncoder().encode(`event: response.created\ndata: ${JSON.stringify(respCreated)}\n\n`));
              controller.enqueue(new TextEncoder().encode(`event: response.output_item.added\ndata: ${JSON.stringify(itemAdded)}\n\n`));
            }

            if (typeof deltaContent === "string" && deltaContent.length > 0) {
              accumulatedText += deltaContent;
              completionTokens += Math.ceil(deltaContent.length / 3.5);

              const textDelta = {
                type: "response.output_text.delta",
                delta: deltaContent,
              };
              controller.enqueue(new TextEncoder().encode(`event: response.output_text.delta\ndata: ${JSON.stringify(textDelta)}\n\n`));
            }
          } catch {}
        }
      },
      flush(controller) {
        const textDone = {
          type: "response.output_text.done",
          text: accumulatedText,
        };
        const respDone = {
          type: "response.completed",
          response: {
            id: responseId,
            object: "response",
            status: "completed",
            model: modelName,
            usage: {
              input_tokens: promptTokens,
              output_tokens: completionTokens || 15,
              total_tokens: promptTokens + (completionTokens || 15),
            },
          },
        };

        controller.enqueue(new TextEncoder().encode(`event: response.output_text.done\ndata: ${JSON.stringify(textDone)}\n\n`));
        controller.enqueue(new TextEncoder().encode(`event: response.completed\ndata: ${JSON.stringify(respDone)}\n\n`));

        logUpstreamRequest({
          connectionId: params.activeConnectionId,
          provider: params.activeProvider,
          model: modelName,
          clientApiKeyId: params.clientApiKeyId,
          clientUserId: params.clientUserId,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          latencyMs: Date.now() - startTime,
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

  // Case 2: Non-Streaming JSON (Responses format)
  const chatJson = await upstreamRes.json().catch(() => ({}));
  const contentText = chatJson.choices?.[0]?.message?.content || "";
  const promptTokens = chatJson.usage?.prompt_tokens || 20;
  const completionTokens = chatJson.usage?.completion_tokens || Math.ceil(contentText.length / 3.5);

  logUpstreamRequest({
    connectionId: params.activeConnectionId,
    provider: params.activeProvider,
    model: modelName,
    clientApiKeyId: params.clientApiKeyId,
    clientUserId: params.clientUserId,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    latencyMs: Date.now() - startTime,
    statusCode: 200,
    isFailover: false,
  }).catch(() => {});

  return new Response(
    JSON.stringify({
      id: responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model: modelName,
      output: [
        {
          id: `msg_${Date.now()}`,
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: contentText,
            },
          ],
        },
      ],
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export interface ExtractedToolCall {
  name: string;
  arguments: Record<string, any> | string;
}

/**
 * Robust extractor for tool calls leaked into text content (DSML, DeepSeek special tokens, XML, JSON).
 * Handles DeepSeek V3/V4/R1 DSML protocol, generic <tool_call>, and raw markdown commands.
 */
export function extractToolCallsFromText(text: string): ExtractedToolCall[] {
  if (!text || typeof text !== "string") return [];
  const toolCalls: ExtractedToolCall[] = [];

  // 1. XML / DSML / function_calls format:
  // Supports: <function_calls>, <tool_calls>, <DSML||calls>, <DSML:calls>, <function_call>
  const xmlBlockRegex = /<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>([\s\S]*?)(?:<\/[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>|$)/gi;
  let xmlBlockMatch;
  while ((xmlBlockMatch = xmlBlockRegex.exec(text)) !== null) {
    const body = xmlBlockMatch[1];
    const invokeRegex = /<[\s|｜]*(?:DSML[\s|｜]*)?invoke\s+name=["']([^"']+)["'][\s|｜]*>([\s\S]*?)(?:<\/[\s|｜]*(?:DSML[\s|｜]*)?invoke[\s|｜]*>|$)/gi;
    let m;
    while ((m = invokeRegex.exec(body)) !== null) {
      const toolName = normalizeToolName(m[1]);
      const invokeBody = m[2];
      const paramRegex = /<[\s|｜]*(?:DSML[\s|｜]*)?parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/[\s|｜]*(?:DSML[\s|｜]*)?parameter[\s|｜]*>|$)/gi;
      const args: Record<string, any> = {};
      let pm;
      while ((pm = paramRegex.exec(invokeBody)) !== null) {
        const pName = pm[1];
        const pVal = pm[2].trim();
        try {
          args[pName] = JSON.parse(pVal);
        } catch {
          args[pName] = pVal;
        }
      }
      toolCalls.push({ name: toolName, arguments: args });
    }
  }

  // Also support bare <invoke name="...">...</invoke> even without enclosing <function_calls>
  if (toolCalls.length === 0) {
    const bareInvokeRegex = /<[\s|｜]*(?:DSML[\s|｜]*)?invoke\s+name=["']([^"']+)["'][\s|｜]*>([\s\S]*?)(?:<\/[\s|｜]*(?:DSML[\s|｜]*)?invoke[\s|｜]*>|$)/gi;
    let m;
    while ((m = bareInvokeRegex.exec(text)) !== null) {
      const toolName = normalizeToolName(m[1]);
      const invokeBody = m[2];
      const paramRegex = /<[\s|｜]*(?:DSML[\s|｜]*)?parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/[\s|｜]*(?:DSML[\s|｜]*)?parameter[\s|｜]*>|$)/gi;
      const args: Record<string, any> = {};
      let pm;
      while ((pm = paramRegex.exec(invokeBody)) !== null) {
        const pName = pm[1];
        const pVal = pm[2].trim();
        try {
          args[pName] = JSON.parse(pVal);
        } catch {
          args[pName] = pVal;
        }
      }
      toolCalls.push({ name: toolName, arguments: args });
    }
  }

  if (toolCalls.length > 0) return toolCalls;

  // 2. DeepSeek special tokens: <｜tool call begin｜>function<｜tool sep｜>name\n```json\n...\n```<｜tool call end｜>
  const dsSpecialRegex = /<[｜|]tool call begin[｜|]>function<[｜|]tool sep[｜|]>([^\n]+)\n(?:```json\s*)?([\s\S]*?)(?:```)?<[｜|]tool call end[｜|]>/gi;
  let dsm;
  while ((dsm = dsSpecialRegex.exec(text)) !== null) {
    const name = normalizeToolName(dsm[1].trim());
    let args: any = {};
    try { args = JSON.parse(dsm[2].trim()); } catch { args = { input: dsm[2].trim() }; }
    toolCalls.push({ name, arguments: args });
  }

  if (toolCalls.length > 0) return toolCalls;

  // 3. Generic XML: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
  const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let xm;
  while ((xm = xmlRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(xm[1].trim());
      if (parsed.name) {
        toolCalls.push({ name: normalizeToolName(parsed.name), arguments: parsed.arguments || {} });
      }
    } catch {}
  }

  if (toolCalls.length > 0) return toolCalls;

  // 5. Explicit tools.apply_patch(`...`) or tools.apply_patch("...") in markdown code block or text
  const applyPatchCallRegex = /(?:await\s+)?tools\.apply_patch\s*\(\s*[`"']([\s\S]*?)[`"']\s*\)/i;
  const apcMatch = text.match(applyPatchCallRegex);
  if (apcMatch && apcMatch[1].trim()) {
    let patchInput = apcMatch[1].trim();
    if (patchInput.includes("\\\\")) {
      patchInput = patchInput.replace(/\\\\/g, "\\");
    }
    toolCalls.push({
      name: "apply_patch",
      arguments: { input: patchInput },
    });
    return toolCalls;
  }

  // 6. Codex *** Begin Patch ... *** End Patch block (must have actual file directive, not just prose)
  const beginPatchRegex = /(\*{3}\s*Begin Patch\r?\n\*{3}\s*(?:Update|Add|Delete)\s+File:[\s\S]*?\*{3}\s*End Patch)/i;
  const bpMatch = text.match(beginPatchRegex);
  if (bpMatch && bpMatch[1].trim()) {
    toolCalls.push({
      name: "apply_patch",
      arguments: { input: bpMatch[1].trim() },
    });
    return toolCalls;
  }

  // 7. Standard Unified Diff (--- a/... +++ b/... @@ ... @@)
  const unifiedDiffRegex = /(?:```(?:diff|patch)?\s*\n)?(--- (?:[a-zA-Z]:[\\/]|[ab]\/|[^\n]+)\n\+\+\+ (?:[a-zA-Z]:[\\/]|[ab]\/|[^\n]+)\n@@[\s\S]*?)(?:```|$)/i;
  const udMatch = text.match(unifiedDiffRegex);
  if (udMatch && udMatch[1].trim()) {
    let patchInput = udMatch[1].trim();
    if (patchInput.includes("\\\\")) {
      patchInput = patchInput.replace(/\\\\/g, "\\");
    }
    if (!patchInput.endsWith("\n")) {
      patchInput += "\n";
    }
    toolCalls.push({
      name: "apply_patch",
      arguments: { input: patchInput },
    });
    return toolCalls;
  }

  // 8. Explicit tools.exec_command({ cmd: ... }) in markdown code block or text
  const execCmdRegex = /(?:(?:const\s+(\w+)\s*=\s*)?(?:await\s+)?)tools\.exec_command\s*\(\s*\{[\s\S]*?\}\s*\);?(?:\s*text\(\w+\.output\);?)?/i;
  const ecMatch = text.match(execCmdRegex);
  if (ecMatch && ecMatch[0].trim()) {
    let script = ecMatch[0].trim();
    if (!script.includes("text(")) {
      const varName = ecMatch[1] || "res";
      if (!ecMatch[1]) {
        script = `const ${varName} = ${script.replace(/^const\s+\w+\s*=\s*/, "")}`;
      }
      if (!script.endsWith(";")) script += ";";
      script += ` text(${varName}.output);`;
    }
    toolCalls.push({
      name: "exec",
      arguments: { input: script },
    });
    return toolCalls;
  }

  // 9. Markdown file write fallback: File [filename] ... ``` ... ``` or isi file [filename] ... ``` ... ```
  const fileDumpRegex = /(?:(?:File|isi\s+file)\s+(?:\[?([^\s\]\n:]+\.[a-zA-Z0-9_-]+)\]?|([^\s\n:]+\.[a-zA-Z0-9_-]+)))[\s\S]*?```(?:\w+)?\s*\n([\s\S]*?)```/i;
  const fdMatch = text.match(fileDumpRegex);
  if (fdMatch) {
    const rawFile = (fdMatch[1] || fdMatch[2] || "").trim();
    const content = (fdMatch[3] || "").trim();
    if (rawFile && content && !rawFile.includes("<") && !rawFile.includes(">")) {
      const b64 = Buffer.from(content).toString("base64");
      const cmd = `powershell -NoProfile -Command "[System.IO.File]::WriteAllText('${rawFile}', [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}')))"`;
      const script = `const r = await tools.exec_command({cmd: ${JSON.stringify(cmd)}}); text(r.output || 'File updated successfully');`;
      toolCalls.push({
        name: "exec",
        arguments: { input: script },
      });
      return toolCalls;
    }
  }

  return toolCalls;
}

export function formatAsCodexPatch(rawPatch: string): string {
  let patch = rawPatch.trim();
  if (!patch) return "";

  // 1. Unwrap from tools.apply_patch('...') or tools.apply_patch(`...`)
  const jsCallMatch = patch.match(/(?:await\s+)?tools\.apply_patch\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/i);
  if (jsCallMatch) {
    patch = jsCallMatch[2].trim();
  }

  // 2. Unescape newlines if string was single-line escaped
  if (patch.includes("\\n") && !patch.includes("\n")) {
    patch = patch.replace(/\\n/g, "\n");
  }

  // 3. Strip markdown code fences if present
  if (patch.startsWith("```")) {
    patch = patch.replace(/^```[^\r\n]*\r?\n/, "").replace(/\r?\n```\s*$/, "").trim();
  }

  if (patch.startsWith("*** Begin Patch")) {
    if (!patch.endsWith("*** End Patch")) {
      patch += "\n*** End Patch";
    }
    return patch;
  }

  // Convert unified diff (--- /dev/null +++ file or --- a/file +++ b/file) to Codex patch format
  const diffMatch = patch.match(/---\s+([^\r\n]+)\r?\n\+\+\+\s+([^\r\n]+)/);
  if (diffMatch) {
    const oldFile = diffMatch[1].trim();
    let newFile = diffMatch[2].trim();
    newFile = newFile.replace(/^[ab]\//, "");
    const isNewFile = oldFile === "/dev/null" || oldFile.startsWith("/dev/null");

    const lines = patch.split(/\r?\n/);
    const headerEndIdx = lines.findIndex((l) => l.startsWith("@@"));
    const bodyLines = headerEndIdx !== -1 ? lines.slice(headerEndIdx + 1) : lines.slice(2);

    if (isNewFile) {
      const contentLines = bodyLines.map((l) => (l.startsWith("+") ? l : `+${l}`));
      return `*** Begin Patch\n*** Add File: ${newFile}\n${contentLines.join("\n")}\n*** End Patch`;
    } else {
      return `*** Begin Patch\n*** Update File: ${newFile}\n@@\n${bodyLines.join("\n")}\n*** End Patch`;
    }
  }

  return `*** Begin Patch\n${patch}\n*** End Patch`;
}

/**
 * Unwraps raw custom tool input from Chat JSON wrapper (e.g. {"input": "..."} -> "...")
 * Codex expects the freeform program/diff directly as input, NOT the JSON envelope.
 * Without unwrapping, Codex rejects patches as invalid diff syntax and aborts execution.
 * (9router pattern: extract raw input and pass through directly)
 */
export function extractCustomToolInput(argumentsText: string, toolName?: string): string {
  if (typeof argumentsText !== "string") return "";
  const bare = normalizeToolName(toolName || "");
  const isApplyPatch = bare === "apply_patch";

  let raw = argumentsText;
  try {
    const parsed = JSON.parse(argumentsText);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.input === "string") raw = parsed.input;
      else if (typeof parsed.patch === "string") raw = parsed.patch;
      else if (typeof parsed.cmd === "string") raw = parsed.cmd;
      else if (typeof parsed.command === "string") raw = parsed.command;
    }
  } catch {}

  if (isApplyPatch) {
    return formatAsCodexPatch(raw);
  }

  // Pass raw command directly to Codex Desktop exec sandbox
  return raw.trim();
}

export function isCustomTool(state: any, name?: string): boolean {
  if (!name) return false;
  const bare = normalizeToolName(name);
  if (state?.customToolNames instanceof Set) {
    if (state.customToolNames.has(name) || state.customToolNames.has(bare)) {
      return true;
    }
  }
  return (
    bare === "apply_patch" ||
    bare === "exec" ||
    bare === "container.exec" ||
    name === "apply_patch" ||
    name === "exec" ||
    name === "container.exec"
  );
}

/**
 * Extracts custom tool names from Responses API request (tools declaration and message history).
 * In OpenAI Codex, 'apply_patch' and 'exec' are custom tools.
 */
export function extractCustomToolNames(parsedBody: any): Set<string> {
  const customNames = new Set<string>(["apply_patch", "exec", "container.exec", "functions.apply_patch", "functions.exec"]);
  if (Array.isArray(parsedBody?.tools)) {
    for (const t of parsedBody.tools) {
      if (!t) continue;
      if (t.type === "custom" && t.name) {
        customNames.add(t.name);
        customNames.add(normalizeToolName(t.name));
      }
      if (t.type === "namespace" && Array.isArray(t.tools)) {
        for (const inner of t.tools) {
          if (!inner) continue;
          const innerName = inner.name || (inner.function && inner.function.name);
          if (innerName) {
            const bare = normalizeToolName(innerName);
            if (inner.type === "custom" || bare === "apply_patch" || bare === "exec" || bare === "container.exec") {
              customNames.add(innerName);
              customNames.add(bare);
            }
          }
        }
      }
    }
  }
  const inputItems = Array.isArray(parsedBody?.input) ? parsedBody.input : [];
  for (const item of inputItems) {
    if (item && item.type === "additional_tools" && Array.isArray(item.tools)) {
      for (const t of item.tools) {
        if (!t) continue;
        const name = t.name || (t.function && t.function.name);
        if (name) {
          customNames.add(name);
          customNames.add(normalizeToolName(name));
        }
      }
    }
    if (item && (item.type === "custom_tool_call" || item.type === "custom_tool_call_output") && item.name) {
      customNames.add(item.name);
      customNames.add(normalizeToolName(item.name));
    }
  }
  return customNames;
}

export const TOOL_MARKUP_START = /<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|(?:function|tool)_calls?|invoke(?:\s+name=|\s*>)|tool_call|tool call begin|details)|\*{3}\s*Begin Patch\r?\n\*{3}\s*(?:Update|Add|Delete)\s+File:|(?:\bawait\s+)?tools\.(?:exec_command|apply_patch)|```(?:javascript|js)?\s*(?:(?:const\s+\w+\s*=\s*)?(?:await\s+)?tools\.|\/\/\s*apply_patch)|```(?:diff|patch)?\s*\n---\s+(?:[a-zA-Z]:|[ab]\/|[^\n]+)|```\s*\n---\s+(?:[a-zA-Z]:|[ab]\/)|(?:(?:File|isi\s+file)\s+(?:\[?[^\s\]\n:]+\.[a-zA-Z0-9_-]+\]?)[^`\n]*```)/i;

/**
 * Transforms an OpenAI chat completion Response (stream or JSON) into OpenAI Responses API format Response.
 */
export async function transformChatResponseToResponses(
  chatResponse: Response,
  params: {
    model: string;
    upstreamModel?: string;
    provider?: string;
    clientWantsStream: boolean;
    customToolNames?: Set<string>;
    hasTools?: boolean;
    logContext?: {
      apiKeyId: string;
      clientUserId?: string;
      reqPath: string;
      startTime: number;
      estimatedPromptTokens?: number;
    };
  }
): Promise<Response> {
  if (!chatResponse.ok) {
    return chatResponse;
  }

  const responseId = `resp_${Date.now()}`;
  const itemId = `msg_${Date.now()}`;
  const modelName = params.model;
  const createdAt = Math.floor(Date.now() / 1000);
  const requestHasTools = params.hasTools ?? (params.customToolNames ? params.customToolNames.size > 0 : false);
  const isDeepSeek =
    params.provider === "DEEPSEEK" ||
    Boolean(params.upstreamModel?.toLowerCase().includes("deepseek")) ||
    Boolean(params.model?.toLowerCase().includes("deepseek"));

  if (params.clientWantsStream && chatResponse.body) {
    let buffer = "";
    let promptTokens = 20;
    let completionTokens = 0;

    // 9router-compatible state machine
    const state = {
      seq: 0,
      started: false,
      // Text message state
      msgTextBuf: "" as string,
      pendingTextBuf: "" as string,
      msgItemAdded: false,
      msgContentAdded: false,
      msgItemDone: false,
      msgOutputIndex: -1,
      msgPhase: (requestHasTools ? "commentary" : "final_answer") as "commentary" | "final_answer",
      // Reasoning state (<think> tags & reasoning_content)
      reasoningId: "",
      reasoningIndex: -1,
      reasoningBuf: "",
      reasoningPartAdded: false,
      reasoningDone: false,
      inThinking: false,
      // Tool markup buffer (DSML, DeepSeek tokens, XML tool_call)
      toolMarkupBuf: "" as string,
      inToolMarkup: false,
      // Stream hold buffer for lookahead (prevents leaked code fences / tool markups)
      streamHoldBuf: "" as string,
      // Tool call state (keyed by tc.index from chat completions)
      funcArgsBuf: {} as Record<number, string>,
      funcNames: {} as Record<number, string>,
      funcNamespaces: {} as Record<number, string>,
      funcCallIds: {} as Record<number, string>,
      funcArgsDone: {} as Record<number, boolean>,
      funcItemAdded: {} as Record<number, boolean>,
      funcItemDone: {} as Record<number, boolean>,
      funcOutputIndex: {} as Record<number, number>,
      // Global output index counter (monotonically increasing)
      nextOutputIndex: 0,
      completedSent: false,
      customToolNames: params.customToolNames || new Set(["apply_patch", "exec", "container.exec"]),
    };

    const nextSeq = () => ++state.seq;

    const encoder = new TextEncoder();
    const emit = (controller: TransformStreamDefaultController, eventType: string, data: any) => {
      data.sequence_number = nextSeq();
      controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`));
    };

    // -- Reasoning helpers --
    const startReasoning = (controller: TransformStreamDefaultController) => {
      if (!state.reasoningId) {
        const idx = state.nextOutputIndex++;
        state.reasoningId = `rs_${responseId}_${idx}`;
        state.reasoningIndex = idx;

        emit(controller, "response.output_item.added", {
          type: "response.output_item.added",
          output_index: idx,
          item: { id: state.reasoningId, type: "reasoning", summary: [] },
        });
        emit(controller, "response.reasoning_summary_part.added", {
          type: "response.reasoning_summary_part.added",
          item_id: state.reasoningId,
          output_index: idx,
          summary_index: 0,
          part: { type: "summary_text", text: "" },
        });
        state.reasoningPartAdded = true;
      }
    };

    const emitReasoningDelta = (controller: TransformStreamDefaultController, text: string) => {
      if (!text) return;
      state.reasoningBuf += text;

      // Always emit to reasoning_summary_text.delta (consumed by Codex Desktop to populate accordion body)
      emit(controller, "response.reasoning_summary_text.delta", {
        type: "response.reasoning_summary_text.delta",
        item_id: state.reasoningId,
        output_index: state.reasoningIndex,
        summary_index: 0,
        delta: text,
      });

      if (isDeepSeek) {
        // Also emit to raw reasoning events for clients supporting CoT stream
        emit(controller, "response.reasoning.delta", {
          type: "response.reasoning.delta",
          item_id: state.reasoningId,
          output_index: state.reasoningIndex,
          content_index: 0,
          delta: text,
        });
        emit(controller, "response.reasoning_text.delta", {
          type: "response.reasoning_text.delta",
          item_id: state.reasoningId,
          output_index: state.reasoningIndex,
          content_index: 0,
          delta: text,
        });
      }
    };

    const closeReasoning = (controller: TransformStreamDefaultController) => {
      if (state.reasoningId && !state.reasoningDone) {
        state.reasoningDone = true;

        emit(controller, "response.reasoning_summary_text.done", {
          type: "response.reasoning_summary_text.done",
          item_id: state.reasoningId,
          output_index: state.reasoningIndex,
          summary_index: 0,
          text: state.reasoningBuf,
        });
        emit(controller, "response.reasoning_summary_part.done", {
          type: "response.reasoning_summary_part.done",
          item_id: state.reasoningId,
          output_index: state.reasoningIndex,
          summary_index: 0,
          part: { type: "summary_text", text: state.reasoningBuf },
        });
        if (isDeepSeek) {
          emit(controller, "response.reasoning.done", {
            type: "response.reasoning.done",
            item_id: state.reasoningId,
            output_index: state.reasoningIndex,
            content_index: 0,
            text: state.reasoningBuf,
          });
          emit(controller, "response.reasoning_text.done", {
            type: "response.reasoning_text.done",
            item_id: state.reasoningId,
            output_index: state.reasoningIndex,
            content_index: 0,
            text: state.reasoningBuf,
          });
        }
        emit(controller, "response.output_item.done", {
          type: "response.output_item.done",
          output_index: state.reasoningIndex,
          item: {
            id: state.reasoningId,
            type: "reasoning",
            summary: [{ type: "summary_text", text: state.reasoningBuf }],
            status: "completed",
          },
        });
      }
    };

    // -- Text message helpers --
    const ensureMessageStarted = (controller: TransformStreamDefaultController, phase?: "commentary" | "final_answer") => {
      if (!state.msgItemAdded) {
        state.msgItemAdded = true;
        state.msgPhase = phase || state.msgPhase || (requestHasTools ? "commentary" : "final_answer");
        state.msgOutputIndex = state.nextOutputIndex++;
        emit(controller, "response.output_item.added", {
          type: "response.output_item.added",
          output_index: state.msgOutputIndex,
          item: {
            id: itemId,
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
            phase: state.msgPhase,
          },
        });
      }
      if (!state.msgContentAdded) {
        state.msgContentAdded = true;
        emit(controller, "response.content_part.added", {
          type: "response.content_part.added",
          item_id: itemId,
          output_index: state.msgOutputIndex,
          content_index: 0,
          part: { type: "output_text", text: "" },
        });
      }
    };

    const emitTextDelta = (controller: TransformStreamDefaultController, text: string) => {
      ensureMessageStarted(controller, state.msgPhase);
      state.msgTextBuf += text;
      completionTokens += Math.ceil(text.length / 3.5);
      emit(controller, "response.output_text.delta", {
        type: "response.output_text.delta",
        item_id: itemId,
        output_index: state.msgOutputIndex,
        content_index: 0,
        delta: text,
      });
    };

    const flushPendingText = (controller: TransformStreamDefaultController, targetPhase: "commentary" | "final_answer") => {
      if (!state.pendingTextBuf) return;
      const raw = state.pendingTextBuf;
      state.pendingTextBuf = "";
      const textToFlush = raw
        .replace(/<details[\s\S]*?<\/details>/gi, "")
        .replace(/<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>/gi, "")
        .replace(/<[\s|｜]*(?:DSML[\s|｜]*)?invoke[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*)?invoke>/gi, "")
        .replace(/<[\s|｜]*\/?(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
        .replace(/<[\s|｜]*DSML[\s|｜]*(?:calls|tool_calls)[\s|｜]*>[\s\S]*/i, "")
        .replace(/```(?:javascript|js)?\s*(?:(?:const\s+\w+\s*=\s*)?(?:await\s+)?tools\.[\s\S]*?)```/gi, "")
        .replace(/```(?:diff|patch)?\s*\n---[\s\S]*?```/gi, "")
        .replace(/```\s*\n---[\s\S]*?```/gi, "")
        .replace(/(?:await\s+)?tools\.apply_patch\s*\(\s*[`"'][\s\S]*?[`"']\s*\);?/gi, "")
        .trim();
      if (textToFlush) {
        state.msgPhase = targetPhase;
        emitTextDelta(controller, textToFlush);
      }
    };

    const closeMessage = (controller: TransformStreamDefaultController, phase?: "commentary" | "final_answer") => {
      if (state.msgItemAdded && !state.msgItemDone) {
        state.msgItemDone = true;
        const outIdx = state.msgOutputIndex;
        const effectivePhase = phase || state.msgPhase || "final_answer";
        state.msgPhase = effectivePhase;
        emit(controller, "response.output_text.done", {
          type: "response.output_text.done",
          item_id: itemId,
          output_index: outIdx,
          content_index: 0,
          text: state.msgTextBuf,
        });
        emit(controller, "response.content_part.done", {
          type: "response.content_part.done",
          item_id: itemId,
          output_index: outIdx,
          content_index: 0,
          part: { type: "output_text", text: state.msgTextBuf },
        });
        emit(controller, "response.output_item.done", {
          type: "response.output_item.done",
          output_index: outIdx,
          item: {
            id: itemId,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: state.msgTextBuf }],
            phase: effectivePhase,
          },
        });
      }
    };

    // -- Tool call helpers --
    const emitToolCall = (controller: TransformStreamDefaultController, tc: any) => {
      const tcIdx = typeof tc.index === "number" ? tc.index : 0;
      const rawName = tc.function?.name || "";
      const { name: decodedName, ns } = decodeToolName(rawName);
      const effectiveName = decodedName || rawName;

      // Initialize tool call state
      if (!(tcIdx in state.funcCallIds)) {
        if (state.pendingTextBuf.trim()) {
          state.msgPhase = "commentary";
          flushPendingText(controller, "commentary");
        }
        // Close text message before first tool call (9router closeMessage pattern)
        if (state.msgItemAdded && !state.msgItemDone) {
          closeMessage(controller, "commentary");
        }
        closeReasoning(controller);

        const outIdx = state.nextOutputIndex++;
        state.funcCallIds[tcIdx] = tc.id || `call_${Date.now()}_${tcIdx}`;
        state.funcNames[tcIdx] = effectiveName;
        state.funcNamespaces[tcIdx] = ns;
        state.funcArgsBuf[tcIdx] = "";
        state.funcArgsDone[tcIdx] = false;
        state.funcItemAdded[tcIdx] = false;
        state.funcItemDone[tcIdx] = false;
        state.funcOutputIndex[tcIdx] = outIdx;
      }

      // Update ID if we get a real one
      if (tc.id && state.funcCallIds[tcIdx].startsWith("call_")) {
        state.funcCallIds[tcIdx] = tc.id;
      }
      // Update name
      if (effectiveName && (!state.funcNames[tcIdx] || state.funcNames[tcIdx].startsWith("functions."))) {
        state.funcNames[tcIdx] = effectiveName;
        state.funcNamespaces[tcIdx] = ns;
      }

      // Emit output_item.added once we have the name
      if (state.funcNames[tcIdx] && !state.funcItemAdded[tcIdx]) {
        state.funcItemAdded[tcIdx] = true;
        const toolName = state.funcNames[tcIdx];
        const isCustom = isCustomTool(state, toolName);
        const itemType = isCustom ? "custom_tool_call" : "function_call";
        const callId = state.funcCallIds[tcIdx];
        const itemId = `${isCustom ? "ctc" : "fc"}_${callId}`;
        const toolItem: any = {
          id: itemId,
          type: itemType,
          name: toolName,
          call_id: callId,
          status: "in_progress",
        };
        if (state.funcNamespaces[tcIdx] && !isCustom && state.funcNamespaces[tcIdx] !== "functions") {
          toolItem.namespace = state.funcNamespaces[tcIdx];
        }
        if (isCustom) {
          toolItem.input = "";
        } else {
          toolItem.arguments = "";
        }
        emit(controller, "response.output_item.added", {
          type: "response.output_item.added",
          output_index: state.funcOutputIndex[tcIdx],
          item: toolItem,
        });
      }

      // Stream arguments delta
      if (tc.function?.arguments) {
        state.funcArgsBuf[tcIdx] += tc.function.arguments;
        const isCustom = isCustomTool(state, state.funcNames[tcIdx]);
        // For custom tools (e.g. apply_patch, exec): DO NOT stream JSON fragments during streaming!
        // Codex expects the unwrapped raw code/diff once at completion.
        if (!isCustom) {
          const callId = state.funcCallIds[tcIdx];
          const itemId = `fc_${callId}`;
          emit(controller, "response.function_call_arguments.delta", {
            type: "response.function_call_arguments.delta",
            item_id: itemId,
            output_index: state.funcOutputIndex[tcIdx],
            call_id: callId,
            delta: tc.function.arguments,
          });
        }
      }
    };

    const closeToolCall = (controller: TransformStreamDefaultController, tcIdx: number) => {
      if (state.funcItemDone[tcIdx]) return;
      state.funcItemDone[tcIdx] = true;
      const toolName = state.funcNames[tcIdx];
      const isCustom = isCustomTool(state, toolName);
      const callId = state.funcCallIds[tcIdx];
      const itemId = `${isCustom ? "ctc" : "fc"}_${callId}`;
      const outIdx = state.funcOutputIndex[tcIdx];
      const args = state.funcArgsBuf[tcIdx] || "";

      if (isCustom) {
        // UNWRAP: extract the raw diff/script string from {"input": "..."} so Codex can apply/exec it
        const rawInput = extractCustomToolInput(args, toolName);
        console.log("[DEBUG Tool Call Close - CUSTOM]", {
          name: toolName,
          callId,
          itemId,
          rawInputLen: rawInput.length,
          preview: rawInput.slice(0, 150)
        });
        emit(controller, "response.custom_tool_call_input.delta", {
          type: "response.custom_tool_call_input.delta",
          item_id: itemId,
          output_index: outIdx,
          call_id: callId,
          delta: rawInput,
        });
        emit(controller, "response.custom_tool_call_input.done", {
          type: "response.custom_tool_call_input.done",
          item_id: itemId,
          output_index: outIdx,
          call_id: callId,
          input: rawInput,
        });
        emit(controller, "response.output_item.done", {
          type: "response.output_item.done",
          output_index: outIdx,
          item: {
            id: itemId,
            type: "custom_tool_call",
            name: toolName,
            call_id: callId,
            input: rawInput,
            status: "completed",
          },
        });
      } else {
        const ns = state.funcNamespaces[tcIdx];
        console.log("[DEBUG Tool Call Close - FUNCTION]", {
          name: toolName,
          callId,
          itemId,
          argsLen: args.length,
          preview: args.slice(0, 150)
        });
        let effectiveArgs = args;
        const bareTool = normalizeToolName(toolName);
        if (bareTool === "exec" || bareTool === "container.exec") {
          try {
            const parsed = JSON.parse(args);
            if (!parsed.cmd && (parsed.input || parsed.command)) {
              parsed.cmd = parsed.input || parsed.command;
              effectiveArgs = JSON.stringify(parsed);
            }
          } catch {
            if (args.trim()) {
              effectiveArgs = JSON.stringify({ cmd: args.trim() });
            }
          }
        }
        emit(controller, "response.function_call_arguments.done", {
          type: "response.function_call_arguments.done",
          item_id: itemId,
          output_index: outIdx,
          call_id: callId,
          name: toolName,
          arguments: effectiveArgs,
        });
        const doneItem: any = {
          id: itemId,
          type: "function_call",
          name: toolName,
          call_id: callId,
          arguments: effectiveArgs,
          status: "completed",
        };
        if (ns && ns !== "functions") {
          doneItem.namespace = ns;
        }
        emit(controller, "response.output_item.done", {
          type: "response.output_item.done",
          output_index: outIdx,
          item: doneItem,
        });
      }
    };

    // -- Process buffered DSML / leaked tool call markup --
    const processBufferedToolMarkup = (controller: TransformStreamDefaultController) => {
      const textToInspect = state.toolMarkupBuf || state.msgTextBuf || state.pendingTextBuf;
      if (textToInspect && Object.keys(state.funcCallIds).length === 0) {
        const extracted = extractToolCallsFromText(textToInspect);
        if (extracted.length > 0) {
          state.msgPhase = "commentary";
          if (state.pendingTextBuf.trim()) {
            flushPendingText(controller, "commentary");
          }
          // If text was put into msgTextBuf before being recognized as tool markup,
          // make sure we don't output that raw markup in text
          if (state.msgItemAdded && !state.msgItemDone) {
            state.msgTextBuf = state.msgTextBuf
              .replace(/<details[\s\S]*?<\/details>/gi, "")
              .replace(/<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>/gi, "")
              .replace(/<[\s|｜]*(?:DSML[\s|｜]*)?invoke[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*)?invoke>/gi, "")
              .replace(/<[\s|｜]*\/?(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
              .replace(/<[\s|｜]*DSML[\s|｜]*(?:calls|tool_calls)[\s|｜]*>[\s\S]*/i, "")
              .replace(/```(?:javascript|js)?\s*(?:(?:const\s+\w+\s*=\s*)?(?:await\s+)?tools\.[\s\S]*?)```/gi, "")
              .replace(/```(?:diff|patch)?\s*\n---[\s\S]*?```/gi, "")
              .replace(/```\s*\n---[\s\S]*?```/gi, "")
              .replace(/(?:await\s+)?tools\.apply_patch\s*\(\s*[`"'][\s\S]*?[`"']\s*\);?/gi, "")
              .trim();
            closeMessage(controller, "commentary");
          }
          closeReasoning(controller);

          for (let i = 0; i < extracted.length; i++) {
            const tc = extracted[i];
            const rawTcName = tc.name;
            const { name: decodedName, ns } = decodeToolName(rawTcName);
            const toolName = decodedName || rawTcName;
            const tcKey = 900 + i;
            const autoId = `call_${Date.now()}_${i}`;
            const autoIdx = state.nextOutputIndex++;
            state.funcCallIds[tcKey] = autoId;
            state.funcNames[tcKey] = toolName;
            state.funcNamespaces[tcKey] = ns;
            state.funcArgsBuf[tcKey] = typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments);
            state.funcArgsDone[tcKey] = false;
            state.funcItemAdded[tcKey] = true;
            state.funcItemDone[tcKey] = false;
            state.funcOutputIndex[tcKey] = autoIdx;

            const isCustom = isCustomTool(state, toolName);
            const itemId = `${isCustom ? "ctc" : "fc"}_${autoId}`;

            const itemAdded: any = {
              id: itemId,
              type: isCustom ? "custom_tool_call" : "function_call",
              name: toolName,
              call_id: autoId,
              status: "in_progress",
              ...(isCustom ? { input: "" } : { arguments: "" }),
            };
            if (ns && !isCustom && ns !== "functions") {
              itemAdded.namespace = ns;
            }
            emit(controller, "response.output_item.added", {
              type: "response.output_item.added",
              output_index: autoIdx,
              item: itemAdded,
            });
            closeToolCall(controller, tcKey);
          }
        } else if (state.inToolMarkup && state.toolMarkupBuf) {
          // If buffered markup turned out not to contain any tools, clean details tags and release remaining text
          const cleaned = state.toolMarkupBuf.replace(/<details[\s\S]*?<\/details>/gi, "").trim();
          if (cleaned) {
            emitTextDelta(controller, cleaned);
          }
          state.toolMarkupBuf = "";
        }
      }
    };

    // -- Send completed event --
    const sendCompleted = (controller: TransformStreamDefaultController) => {
      if (state.completedSent) return;
      state.completedSent = true;

      const hasTools = Object.keys(state.funcCallIds).length > 0;

      // If upstream returned no tools and no message text (e.g. model only reasoned or produced empty STOP),
      // emit a clean assistant message instead of triggering response.failed which crashes Codex Desktop
      if (!hasTools && !state.msgItemAdded && !state.msgTextBuf.trim()) {
        const fallbackText = state.reasoningBuf.trim()
          ? "Selesai menganalisis. Tidak ada tindakan lanjutan yang diperlukan saat ini."
          : "Model upstream menyelesaikan respon tanpa output tambahan.";
        emitTextDelta(controller, fallbackText);
        closeMessage(controller);
      }

      // If upstream returned absolutely nothing (no tools, no content, no reasoning), fail cleanly
      if (!hasTools && !state.msgItemAdded && !state.msgTextBuf.trim() && !state.reasoningBuf.trim()) {
        emit(controller, "error", {
          type: "error",
          error: {
            message: "Model upstream tidak menghasilkan respon atau terhenti tanpa output.",
            type: "upstream_empty_response",
            code: 502,
          },
        });
        emit(controller, "response.failed", {
          type: "response.failed",
          response: {
            id: responseId,
            object: "response",
            status: "failed",
            error: {
              message: "Model upstream tidak menghasilkan respon atau terhenti tanpa output.",
              type: "upstream_empty_response",
              code: 502,
            },
            output: [],
            usage: { input_tokens: promptTokens, output_tokens: 0, total_tokens: promptTokens },
          },
        });

        if (params.logContext) {
          logRequest({
            apiKeyId: params.logContext.apiKeyId,
            path: params.logContext.reqPath,
            method: "POST",
            statusCode: 502,
            model: modelName,
            promptTokens: promptTokens || params.logContext.estimatedPromptTokens || 0,
            completionTokens: 0,
            totalTokens: promptTokens || params.logContext.estimatedPromptTokens || 0,
            creditsCost: 0,
            durationMs: Date.now() - params.logContext.startTime,
          });
        }
        return;
      }

      const finalOutputs: any[] = [];
      // Add reasoning if present
      if (state.reasoningId) {
        finalOutputs.push({
          id: state.reasoningId,
          type: "reasoning",
          summary: [{ type: "summary_text", text: state.reasoningBuf }],
          status: "completed",
        });
      }
      // Add text message if present
      if (state.msgItemAdded) {
        finalOutputs.push({
          id: itemId,
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: state.msgTextBuf }],
          phase: state.msgPhase,
        });
      }
      // Add tool calls
      for (const tcIdx of Object.keys(state.funcCallIds).map(Number)) {
        const toolName = state.funcNames[tcIdx];
        const isCustom = isCustomTool(state, toolName);
        const callId = state.funcCallIds[tcIdx];
        const itemId = `${isCustom ? "ctc" : "fc"}_${callId}`;
        const ns = state.funcNamespaces[tcIdx];
        const tc: any = {
          id: itemId,
          type: isCustom ? "custom_tool_call" : "function_call",
          name: toolName,
          call_id: callId,
          status: "completed",
        };
        if (ns && !isCustom && ns !== "functions") {
          tc.namespace = ns;
        }
        if (isCustom) {
          tc.input = extractCustomToolInput(state.funcArgsBuf[tcIdx] || "", toolName);
        } else {
          let finalArgs = state.funcArgsBuf[tcIdx] || "";
          const bareTool = normalizeToolName(toolName);
          if (bareTool === "exec" || bareTool === "container.exec") {
            try {
              const parsed = JSON.parse(finalArgs);
              if (!parsed.cmd && (parsed.input || parsed.command)) {
                parsed.cmd = parsed.input || parsed.command;
                finalArgs = JSON.stringify(parsed);
              }
            } catch {
              if (finalArgs.trim()) {
                finalArgs = JSON.stringify({ cmd: finalArgs.trim() });
              }
            }
          }
          tc.arguments = finalArgs;
        }
        finalOutputs.push(tc);
      }

      const finalOutToks = completionTokens || Math.max(1, Math.ceil(state.msgTextBuf.length / 3.5) + Math.ceil(state.reasoningBuf.length / 3.5));
      const finalInToks = promptTokens || params.logContext?.estimatedPromptTokens || 20;

      const finalUsage = {
        input_tokens: finalInToks,
        output_tokens: finalOutToks,
        total_tokens: finalInToks + finalOutToks,
      };

      emit(controller, "response.completed", {
        type: "response.completed",
        response: {
          id: responseId,
          object: "response",
          status: "completed",
          model: modelName,
          output: finalOutputs,
          usage: finalUsage,
        },
      });

      if (params.logContext) {
        logRequest({
          apiKeyId: params.logContext.apiKeyId,
          path: params.logContext.reqPath,
          method: "POST",
          statusCode: 200,
          model: modelName,
          promptTokens: finalInToks,
          completionTokens: finalOutToks,
          totalTokens: finalInToks + finalOutToks,
          durationMs: Date.now() - params.logContext.startTime,
        });
      }
    };

    // ===== Main TransformStream =====
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ") || trimmed.includes("[DONE]")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices?.[0]?.delta || {};
            const finishReason = data.choices?.[0]?.finish_reason;
            const toolCalls = delta.tool_calls;

            if (delta.content || delta.reasoning_content || toolCalls || finishReason) {
              console.log("[DEBUG Responses Stream Delta]", {
                content: delta.content?.slice?.(0, 50),
                reasoning: delta.reasoning_content?.slice?.(0, 50),
                toolCalls: toolCalls?.map((t: any) => ({ name: t.function?.name, args: t.function?.arguments?.slice?.(0, 50) })),
                finishReason,
              });
            }

            // Extract usage
            if (data.usage) {
              promptTokens = data.usage.prompt_tokens || promptTokens;
              completionTokens = data.usage.completion_tokens || completionTokens;
            }

            // 1. Emit response.created + response.in_progress once
            if (!state.started) {
              state.started = true;
              emit(controller, "response.created", {
                type: "response.created",
                response: {
                  id: responseId,
                  object: "response",
                  created_at: createdAt,
                  status: "in_progress",
                  model: modelName,
                  background: false,
                  error: null,
                  output: [],
                },
              });
              emit(controller, "response.in_progress", {
                type: "response.in_progress",
                response: {
                  id: responseId,
                  object: "response",
                  created_at: createdAt,
                  status: "in_progress",
                },
              });
            }

            // 2. Handle reasoning_content (native reasoning from models like o1/o3)
            const reasoningText = delta.reasoning_content || delta.reasoning || "";
            if (reasoningText) {
              startReasoning(controller);
              emitReasoningDelta(controller, reasoningText);
            }

            // 3. Handle text content (including <think> tag filtering & DSML / tool markup interception)
            if (typeof delta.content === "string" && delta.content.length > 0) {
              // Khusus DeepSeek: tutup reasoning block begitu token jawaban pertama tiba
              if (isDeepSeek && state.reasoningId && !state.reasoningDone) {
                closeReasoning(controller);
              }

              let content = delta.content;

              // DeepSeek-style <think> tags → reasoning events
              if (content.includes("<think>")) {
                state.inThinking = true;
                content = content.replace("<think>", "");
                startReasoning(controller);
              }
              if (content.includes("</think>")) {
                const parts = content.split("</think>");
                const thinkPart = parts[0];
                const textPart = parts.slice(1).join("</think>");
                if (thinkPart) emitReasoningDelta(controller, thinkPart);
                closeReasoning(controller);
                state.inThinking = false;
                content = textPart;
              }

              if (state.inThinking && content) {
                emitReasoningDelta(controller, content);
              } else if (content) {
                if (state.inToolMarkup) {
                  state.toolMarkupBuf += content;
                } else {
                  const candidate = state.streamHoldBuf + content;
                  const match = candidate.match(TOOL_MARKUP_START);

                  if (match && match.index !== undefined) {
                    const rawPre = candidate.slice(0, match.index);
                    const markupText = candidate.slice(match.index);

                    const preText = rawPre
                      .replace(/<details[\s\S]*?<\/details>/gi, "")
                      .replace(/<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>/gi, "")
                      .replace(/<[\s|｜]*(?:DSML[\s|｜]*)?invoke[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*)?invoke>/gi, "")
                      .replace(/<[\s|｜]*\/?(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
                      .replace(/<[\s|｜]*DSML[\s|｜]*(?:calls|tool_calls)[\s|｜]*>[\s\S]*/i, "")
                      .trim();

                    if (preText) {
                      if (!state.msgItemAdded && requestHasTools) {
                        state.pendingTextBuf += preText;
                      } else {
                        emitTextDelta(controller, preText);
                      }
                    }
                    if (state.pendingTextBuf.trim()) {
                      state.msgPhase = "commentary";
                      flushPendingText(controller, "commentary");
                    }
                    if (state.msgItemAdded && !state.msgItemDone) {
                      closeMessage(controller, "commentary");
                    }
                    state.inToolMarkup = true;
                    state.toolMarkupBuf += markupText;
                    state.streamHoldBuf = "";
                  } else {
                    const openCodeFenceMatch = candidate.match(/(?:^|[^\\])```(?:javascript|js|diff|patch)?\s*(?:[^\n]*\n)?/i);
                    const hasUnclosedFence = openCodeFenceMatch && (candidate.split("```").length % 2 === 0);
                    const hasPartialTag = /<[\s|｜]*[a-zA-Z_:]*$/i.test(candidate);
                    const hasPartialPatch = /\*{1,3}\s*(?:Begin(?:\s+Patch)?)?$/i.test(candidate);
                    const hasPartialTools = /(?:const\s+\w+\s*=\s*)?(?:await\s+)?tools?\.?\w*$/i.test(candidate);

                    if ((hasUnclosedFence && candidate.length < 200) || hasPartialTag || hasPartialPatch || hasPartialTools) {
                      let suspectIndex = -1;
                      if (hasUnclosedFence && openCodeFenceMatch && openCodeFenceMatch.index !== undefined) {
                        suspectIndex = openCodeFenceMatch.index + (openCodeFenceMatch[0].startsWith("```") ? 0 : 1);
                      } else if (hasPartialTag) {
                        suspectIndex = candidate.search(/<[\s|｜]*[a-zA-Z_:]*$/i);
                      } else if (hasPartialPatch) {
                        suspectIndex = candidate.search(/\*{1,3}\s*(?:Begin(?:\s+Patch)?)?$/i);
                      } else if (hasPartialTools) {
                        suspectIndex = candidate.search(/(?:const\s+\w+\s*=\s*)?(?:await\s+)?tools?\.?\w*$/i);
                      }

                      if (suspectIndex > 0) {
                        const safeText = candidate.slice(0, suspectIndex);
                        if (safeText) {
                          if (!state.msgItemAdded && requestHasTools) {
                            state.pendingTextBuf += safeText;
                            if (state.pendingTextBuf.length >= 300) {
                              flushPendingText(controller, "final_answer");
                            }
                          } else {
                            emitTextDelta(controller, safeText);
                          }
                        }
                        state.streamHoldBuf = candidate.slice(suspectIndex);
                      } else {
                        state.streamHoldBuf = candidate;
                      }
                    } else {
                      state.streamHoldBuf = "";
                      if (!state.msgItemAdded && requestHasTools) {
                        state.pendingTextBuf += candidate;
                        if (state.pendingTextBuf.length >= 300) {
                          flushPendingText(controller, "final_answer");
                        }
                      } else {
                        emitTextDelta(controller, candidate);
                      }
                    }
                  }
                }
              }
            }

            // 4. Handle tool_calls
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
              if (state.reasoningId && !state.reasoningDone) {
                closeReasoning(controller);
              }
              for (const tc of toolCalls) {
                emitToolCall(controller, tc);
              }
            }

            // 5. Handle finish_reason (only from the final empty-delta chunk)
            if (finishReason) {
              if (!state.inToolMarkup && state.streamHoldBuf) {
                if (TOOL_MARKUP_START.test(state.streamHoldBuf) || extractToolCallsFromText(state.streamHoldBuf).length > 0) {
                  state.inToolMarkup = true;
                  state.toolMarkupBuf += state.streamHoldBuf;
                  state.streamHoldBuf = "";
                } else {
                  const cleanHold = state.streamHoldBuf
                    .replace(/<\/?[\s|｜]*(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
                    .trim();
                  if (cleanHold) {
                    if (!state.msgItemAdded && requestHasTools) {
                      state.pendingTextBuf += cleanHold;
                    } else {
                      emitTextDelta(controller, cleanHold);
                    }
                  }
                  state.streamHoldBuf = "";
                }
              }
              // Convert any buffered tool markup (DSML, etc.) into real tool calls
              processBufferedToolMarkup(controller);

              const hasTools = Object.keys(state.funcCallIds).length > 0;
              if (state.pendingTextBuf.trim()) {
                flushPendingText(controller, hasTools ? "commentary" : "final_answer");
              }

              // Close any open items
              if (state.msgItemAdded && !state.msgItemDone) closeMessage(controller, hasTools ? "commentary" : "final_answer");
              closeReasoning(controller);
              for (const tcIdx of Object.keys(state.funcCallIds).map(Number)) {
                closeToolCall(controller, tcIdx);
              }
              sendCompleted(controller);
            }
          } catch {}
        }
      },
      flush(controller) {
        // Ensure everything is closed even if no finish_reason was received
        if (!state.started) {
          state.started = true;
          emit(controller, "response.created", {
            type: "response.created",
            response: {
              id: responseId,
              object: "response",
              created_at: createdAt,
              status: "in_progress",
              model: modelName,
              background: false,
              error: null,
              output: [],
            },
          });
          emit(controller, "response.in_progress", {
            type: "response.in_progress",
            response: {
              id: responseId,
              object: "response",
              created_at: createdAt,
              status: "in_progress",
            },
          });
        }

        if (!state.inToolMarkup && state.streamHoldBuf) {
          if (TOOL_MARKUP_START.test(state.streamHoldBuf) || extractToolCallsFromText(state.streamHoldBuf).length > 0) {
            state.inToolMarkup = true;
            state.toolMarkupBuf += state.streamHoldBuf;
            state.streamHoldBuf = "";
          } else {
            const cleanHold = state.streamHoldBuf
              .replace(/<\/?[\s|｜]*(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
              .trim();
            if (cleanHold) {
              if (!state.msgItemAdded && requestHasTools) {
                state.pendingTextBuf += cleanHold;
              } else {
                emitTextDelta(controller, cleanHold);
              }
            }
            state.streamHoldBuf = "";
          }
        }
        // Convert any buffered tool markup (DSML, etc.) into real tool calls
        processBufferedToolMarkup(controller);

        const hasTools = Object.keys(state.funcCallIds).length > 0;
        if (state.pendingTextBuf.trim()) {
          flushPendingText(controller, hasTools ? "commentary" : "final_answer");
        }

        // Close any remaining open items
        if (state.msgItemAdded && !state.msgItemDone) closeMessage(controller, hasTools ? "commentary" : "final_answer");
        closeReasoning(controller);
        for (const tcIdx of Object.keys(state.funcCallIds).map(Number)) {
          if (!state.funcItemDone[tcIdx]) closeToolCall(controller, tcIdx);
        }
        if (!state.completedSent) sendCompleted(controller);
      },
    });

    return new Response(chatResponse.body.pipeThrough(transformStream), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }


  // Non-streaming JSON
  const rawText = await chatResponse.text();
  let contentText = "";
  let promptTokens = 20;
  let completionTokens = 25;
  const nonStreamOutputs: any[] = [];

  try {
    const chatJson = JSON.parse(rawText);
    contentText = chatJson.choices?.[0]?.message?.content || "";
    if (chatJson.usage) {
      promptTokens = chatJson.usage.prompt_tokens || promptTokens;
      completionTokens = chatJson.usage.completion_tokens || completionTokens;
    }
    const reasoningContent = chatJson.choices?.[0]?.message?.reasoning_content || chatJson.choices?.[0]?.message?.reasoning || "";
    if (reasoningContent) {
      nonStreamOutputs.push({
        id: `rs_${responseId}_0`,
        type: "reasoning",
        summary: [{ type: "summary_text", text: reasoningContent }],
        status: "completed",
      });
    }

    // Check if contentText contains leaked DSML or tool calls
    if (contentText && (!chatJson.choices?.[0]?.message?.tool_calls || chatJson.choices[0].message.tool_calls.length === 0)) {
      const extracted = extractToolCallsFromText(contentText);
      if (extracted.length > 0) {
        for (let i = 0; i < extracted.length; i++) {
          const tc = extracted[i];
          const rawName = tc.name;
          const { name: toolName, ns } = decodeToolName(rawName);
          const callId = `call_${Date.now()}_${i}`;
          const isCustom = isCustomTool({ customToolNames: params.customToolNames }, toolName);
          const itemId = `${isCustom ? "ctc" : "fc"}_${callId}`;
          const rawArgs = typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments);
          const outItem: any = {
            id: itemId,
            type: isCustom ? "custom_tool_call" : "function_call",
            name: toolName,
            call_id: callId,
            ...(isCustom
              ? { input: extractCustomToolInput(rawArgs, toolName) }
              : { arguments: rawArgs }),
            status: "completed",
          };
          if (ns && !isCustom && ns !== "functions") {
            outItem.namespace = ns;
          }
          nonStreamOutputs.push(outItem);
        }
        // Strip DSML and leaked tool markups from contentText so they don't leak to chat
        contentText = contentText
          .replace(/<details[\s\S]*?<\/details>/gi, "")
          .replace(/<[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*(?:calls|tool_calls)|function_calls?|tool_calls?)[\s|｜]*>/gi, "")
          .replace(/<[\s|｜]*(?:DSML[\s|｜]*)?invoke[\s\S]*?<\/[\s|｜]*(?:DSML[\s|｜]*)?invoke>/gi, "")
          .replace(/<[\s|｜]*\/?(?:function_calls?|tool_calls?|invoke|parameter)[\s\S]*?>/gi, "")
          .replace(/<[\s|｜]*DSML[\s|｜]*(?:calls|tool_calls)[\s|｜]*>[\s\S]*/i, "")
          .replace(/```(?:javascript|js)?\s*(?:(?:const\s+\w+\s*=\s*)?(?:await\s+)?tools\.[\s\S]*?)```/gi, "")
          .replace(/```(?:diff|patch)?\s*\n---[\s\S]*?```/gi, "")
          .replace(/```\s*\n---[\s\S]*?```/gi, "")
          .replace(/(?:await\s+)?tools\.apply_patch\s*\(\s*[`"'][\s\S]*?[`"']\s*\);?/gi, "")
          .trim();
      }
    }

    if (Array.isArray(chatJson.choices?.[0]?.message?.tool_calls)) {
      for (const tc of chatJson.choices[0].message.tool_calls) {
        const callId = tc.id || `call_${Date.now()}`;
        const rawName = tc.function?.name || "function_call";
        const { name: toolName, ns } = decodeToolName(rawName);
        const isCustom = isCustomTool({ customToolNames: params.customToolNames }, toolName);
        const itemId = `${isCustom ? "ctc" : "fc"}_${callId}`;
        const rawArgs = typeof tc.function?.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {});
        const outItem: any = {
          id: itemId,
          type: isCustom ? "custom_tool_call" : "function_call",
          name: toolName,
          call_id: callId,
          ...(isCustom
            ? { input: extractCustomToolInput(rawArgs, toolName) }
            : { arguments: rawArgs }),
          status: "completed",
        };
        if (ns && !isCustom && ns !== "functions") {
          outItem.namespace = ns;
        }
        nonStreamOutputs.push(outItem);
      }
    }

    const hasTools = nonStreamOutputs.some(o => o.type === "custom_tool_call" || o.type === "function_call");
    if (!hasTools && !contentText.trim()) {
      if (params.logContext) {
        logRequest({
          apiKeyId: params.logContext.apiKeyId,
          path: params.logContext.reqPath,
          method: "POST",
          statusCode: 502,
          model: modelName,
          promptTokens: promptTokens || params.logContext.estimatedPromptTokens || 0,
          completionTokens: 0,
          totalTokens: promptTokens || params.logContext.estimatedPromptTokens || 0,
          creditsCost: 0,
          durationMs: Date.now() - params.logContext.startTime,
        });
      }
      return new Response(
        JSON.stringify({
          error: {
            message: "Model upstream tidak menghasilkan respon atau terhenti tanpa output.",
            type: "upstream_empty_response",
            code: 502,
          },
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    if (contentText.trim() || hasTools) {
      if (contentText.trim()) {
        nonStreamOutputs.unshift({
          id: itemId,
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: contentText.trim(),
            },
          ],
          phase: hasTools ? "commentary" : "final_answer",
        });
      }
    }
  } catch {
    contentText = rawText;
    nonStreamOutputs.push({
      id: itemId,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: contentText,
        },
      ],
      phase: "final_answer",
    });
  }

  if (params.logContext) {
    logRequest({
      apiKeyId: params.logContext.apiKeyId,
      path: params.logContext.reqPath,
      method: "POST",
      statusCode: 200,
      model: modelName,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      durationMs: Date.now() - params.logContext.startTime,
    });
  }

  return new Response(
    JSON.stringify({
      id: responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model: modelName,
      output: nonStreamOutputs,
      usage: {
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

