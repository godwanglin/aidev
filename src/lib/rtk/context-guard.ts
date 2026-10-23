// Context Guard: Intelligent Auto Context Compression Engine
// Automatically compacts older bulky tool outputs/results and redundant history
// in the middle of the conversation when context reaches 50%-60% of model's limit,
// while strictly preserving system instructions, initial user objective, and recent turns.

import { getModelCapabilities } from "@/lib/model-capabilities";
import { prisma } from "@/lib/prisma";

export interface ContextGuardResult {
  compressedMessages: any[];
  tokensSaved: number;
  applied: boolean;
  originalTokens: number;
  newTokens: number;
  contextLimit: number;
  thresholdTokens: number;
  thresholdPct: number;
}

/**
 * Extracts character length from message content safely regardless of structure.
 */
export function extractContentChars(content: any): number {
  if (!content) return 0;
  if (typeof content === "string") return content.length;
  if (typeof content === "number" || typeof content === "boolean") return String(content).length;

  if (Array.isArray(content)) {
    let sum = 0;
    for (const part of content) {
      if (!part) continue;
      if (typeof part === "string") {
        sum += part.length;
      } else if (typeof part === "object") {
        // text block
        if (typeof part.text === "string") {
          sum += part.text.length;
        }
        // tool_result content (can be string or nested array of parts!)
        if (part.content !== undefined) {
          sum += extractContentChars(part.content);
        }
        // tool_use input (object or JSON string)
        if (part.input !== undefined) {
          if (typeof part.input === "string") {
            sum += part.input.length;
          } else if (typeof part.input === "object") {
            try {
              sum += JSON.stringify(part.input).length;
            } catch {
              sum += 100;
            }
          }
        }
        // tool_use / tool_result identifiers
        if (typeof part.name === "string") sum += part.name.length;
        if (typeof part.id === "string") sum += part.id.length;
        if (typeof part.tool_use_id === "string") sum += part.tool_use_id.length;

        // OpenAI tool call function arguments in content
        if (part.function) {
          if (typeof part.function.name === "string") sum += part.function.name.length;
          if (typeof part.function.arguments === "string") sum += part.function.arguments.length;
        }

        // image / source URL
        if (part.image_url?.url && typeof part.image_url.url === "string") {
          sum += part.image_url.url.length;
        }
        if (part.source?.data && typeof part.source.data === "string") {
          sum += part.source.data.length;
        }
      }
    }
    return sum;
  }

  if (typeof content === "object") {
    try {
      return JSON.stringify(content).length;
    } catch {
      return 100;
    }
  }

  return 0;
}

/**
 * Calculates total character count of a single message object.
 */
export function calculateMessageChars(m: any): number {
  if (!m) return 0;
  let count = 0;

  if (typeof m.role === "string") count += m.role.length;
  count += extractContentChars(m.content);

  // OpenAI tool calls
  if (Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      if (tc?.function?.name) count += tc.function.name.length;
      if (tc?.function?.arguments) count += String(tc.function.arguments).length;
      if (tc?.id) count += tc.id.length;
    }
  }

  if (m.tool_call_id) count += String(m.tool_call_id).length;
  if (m.name) count += String(m.name).length;

  return count;
}

/**
 * Calculates estimated tokens from messages array and system prompt.
 */
export function estimateMessagesTokens(messages: any[], system?: any): number {
  let charCount = 0;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      charCount += calculateMessageChars(m);
    }
  }
  if (system) {
    charCount += extractContentChars(system);
  }
  return Math.max(1, Math.ceil(charCount / 3.5));
}

/**
 * Parses context window string (e.g. "1M", "400k", "128k", 200000) to numeric token count.
 */
export function parseContextWindowNumber(val?: string | number): number {
  if (typeof val === "number" && !isNaN(val) && val > 0) return val;
  if (!val || typeof val !== "string") return 128000;
  const s = val.trim().toLowerCase();
  if (s.endsWith("m")) {
    const num = parseFloat(s.slice(0, -1));
    return isNaN(num) ? 1000000 : Math.round(num * 1000000);
  }
  if (s.endsWith("k")) {
    const num = parseFloat(s.slice(0, -1));
    return isNaN(num) ? 128000 : Math.round(num * 1000);
  }
  const parsed = parseInt(s, 10);
  return isNaN(parsed) || parsed <= 0 ? 128000 : parsed;
}

// In-memory cache for model context limits
const modelLimitCache = new Map<string, number>();
let modelLimitCacheExpiresAt = 0;

/**
 * Resolves the maximum context window limit for a model.
 */
export async function resolveModelContextLimit(modelId?: string): Promise<number> {
  if (!modelId) return 128000;
  const now = Date.now();
  if (modelLimitCache.has(modelId) && now < modelLimitCacheExpiresAt) {
    return modelLimitCache.get(modelId)!;
  }

  let limit = 128000;
  try {
    const aiModel = await prisma.aiModel.findUnique({
      where: { modelId },
      select: { contextWindow: true },
    });
    if (aiModel?.contextWindow) {
      limit = parseContextWindowNumber(aiModel.contextWindow);
    } else {
      const caps = getModelCapabilities(modelId, "");
      limit = caps?.context_length || 128000;
    }
  } catch {
    const caps = getModelCapabilities(modelId, "");
    limit = caps?.context_length || 128000;
  }

  modelLimitCache.set(modelId, limit);
  if (now >= modelLimitCacheExpiresAt) {
    modelLimitCacheExpiresAt = now + 60000; // cache for 60 seconds
  }
  return limit;
}

/**
 * Compacts a long text string by keeping the beginning and ending, omitting the bulky middle.
 */
function compactString(text: string, headChars: number, tailChars: number, label: string): string {
  if (!text || text.length <= headChars + tailChars + 50) return text;
  const omitted = text.length - (headChars + tailChars);
  return `${text.slice(0, headChars)}\n... [Context Guard: compacted ${omitted} characters of older ${label}] ...\n${text.slice(-tailChars)}`;
}

/**
 * Compacts a single message's tool results or bulky middle content.
 * Keeps IDs, structure, and roles strictly intact.
 */
function compactMessageContent(m: any, aggressionLevel: 1 | 2 = 1): any {
  if (!m) return m;
  const clone = { ...m };

  const toolHeadChars = aggressionLevel === 2 ? 120 : 250;
  const toolTailChars = aggressionLevel === 2 ? 120 : 250;
  const textHeadChars = aggressionLevel === 2 ? 200 : 400;
  const textTailChars = aggressionLevel === 2 ? 200 : 400;

  // 1. Anthropic multi-part content
  if (Array.isArray(clone.content)) {
    clone.content = clone.content.map((part: any) => {
      if (!part || typeof part !== "object") return part;
      const partClone = { ...part };

      // Tool result block (bulk of coding agent history)
      if (partClone.type === "tool_result") {
        if (typeof partClone.content === "string") {
          partClone.content = compactString(partClone.content, toolHeadChars, toolTailChars, "tool output");
        } else if (Array.isArray(partClone.content)) {
          partClone.content = partClone.content.map((sub: any) => {
            if (sub?.type === "text" && typeof sub.text === "string") {
              return { ...sub, text: compactString(sub.text, toolHeadChars, toolTailChars, "tool output") };
            }
            return sub;
          });
        }
      }

      // Tool use block (e.g. huge file write argument in older turn)
      if (partClone.type === "tool_use" && partClone.input && typeof partClone.input === "object") {
        const inputClone = { ...partClone.input };
        let modified = false;
        for (const [k, v] of Object.entries(inputClone)) {
          if (typeof v === "string" && v.length > 800) {
            inputClone[k] = compactString(v, 150, 150, `tool input parameter '${k}'`);
            modified = true;
          }
        }
        if (modified) {
          partClone.input = inputClone;
        }
      }

      // Middle assistant / user text block
      if (partClone.type === "text" && typeof partClone.text === "string" && partClone.text.length > 1200) {
        partClone.text = compactString(partClone.text, textHeadChars, textTailChars, "conversation turn");
      }

      return partClone;
    });
    return clone;
  }

  // 2. OpenAI Tool Message: role === "tool"
  if (clone.role === "tool" && typeof clone.content === "string") {
    clone.content = compactString(clone.content, toolHeadChars, toolTailChars, "tool result");
    return clone;
  }

  // 3. OpenAI Assistant Tool Calls: compact large arguments in older tool calls
  if (Array.isArray(clone.tool_calls)) {
    clone.tool_calls = clone.tool_calls.map((tc: any) => {
      if (tc?.function?.arguments && typeof tc.function.arguments === "string" && tc.function.arguments.length > 1000) {
        const argsStr = tc.function.arguments;
        return {
          ...tc,
          function: {
            ...tc.function,
            arguments: compactString(argsStr, 150, 150, "tool call arguments"),
          },
        };
      }
      return tc;
    });
  }

  // 4. Regular string content in middle turn (assistant or user)
  if (typeof clone.content === "string" && clone.content.length > 1500) {
    clone.content = compactString(clone.content, textHeadChars, textTailChars, "message content");
  }

  return clone;
}

/**
 * Compresses the conversation history if estimated tokens meet or exceed
 * the threshold percentage of the target model's maximum context limit.
 *
 * Keeps intact:
 * - System prompt (never modified)
 * - Initial user prompt / task instruction (never modified)
 * - Recent 4 messages / active turns (never modified)
 *
 * Only compacts bulky tool outputs and redundant history in the middle.
 */
export function applyContextGuard(params: {
  messages: any[];
  system?: any;
  currentEstimatedTokens: number;
  contextLimit: number;
  thresholdPct: number;
}): ContextGuardResult {
  const { messages, system, currentEstimatedTokens, contextLimit, thresholdPct } = params;

  const thresholdTokens = Math.floor(contextLimit * (thresholdPct / 100));

  // If below threshold, no compression needed
  if (currentEstimatedTokens < thresholdTokens || !Array.isArray(messages) || messages.length <= 4) {
    return {
      compressedMessages: messages,
      tokensSaved: 0,
      applied: false,
      originalTokens: currentEstimatedTokens,
      newTokens: currentEstimatedTokens,
      contextLimit,
      thresholdTokens,
      thresholdPct,
    };
  }

  // Identify boundaries:
  // 1. Find initial user instruction index (skip system messages at start)
  let firstUserIdx = 0;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "user") {
      firstUserIdx = i;
      break;
    }
  }

  // 2. Keep the first user prompt and any initial system messages intact
  // 3. Keep the most recent 4 messages intact
  const protectRecentCount = Math.min(4, Math.max(2, messages.length - (firstUserIdx + 1)));
  const middleStartIndex = firstUserIdx + 1;
  const middleEndIndex = messages.length - protectRecentCount;

  if (middleStartIndex >= middleEndIndex) {
    // Not enough middle messages to compress safely
    return {
      compressedMessages: messages,
      tokensSaved: 0,
      applied: false,
      originalTokens: currentEstimatedTokens,
      newTokens: currentEstimatedTokens,
      contextLimit,
      thresholdTokens,
      thresholdPct,
    };
  }

  // Pass 1: Standard Middle Compaction
  let newMessages = messages.map((m, idx) => {
    if (idx >= middleStartIndex && idx < middleEndIndex) {
      return compactMessageContent(m, 1);
    }
    return m;
  });

  let newEstimatedTokens = estimateMessagesTokens(newMessages, system);

  // Pass 2: If still above threshold, apply aggressive compaction on older middle messages
  if (newEstimatedTokens >= thresholdTokens) {
    newMessages = newMessages.map((m, idx) => {
      if (idx >= middleStartIndex && idx < middleEndIndex) {
        return compactMessageContent(m, 2);
      }
      return m;
    });
    newEstimatedTokens = estimateMessagesTokens(newMessages, system);
  }

  const tokensSaved = Math.max(0, currentEstimatedTokens - newEstimatedTokens);

  return {
    compressedMessages: newMessages,
    tokensSaved,
    applied: tokensSaved > 0,
    originalTokens: currentEstimatedTokens,
    newTokens: newEstimatedTokens,
    contextLimit,
    thresholdTokens,
    thresholdPct,
  };
}

/**
 * Compresses Responses API input if context exceeds threshold.
 */
export function applyContextGuardToResponsesInput(params: {
  input: any[];
  instructions?: string;
  currentEstimatedTokens: number;
  contextLimit: number;
  thresholdPct: number;
}): {
  compressedInput: any[];
  tokensSaved: number;
  applied: boolean;
} {
  const { input, instructions, currentEstimatedTokens, contextLimit, thresholdPct } = params;
  const thresholdTokens = Math.floor(contextLimit * (thresholdPct / 100));

  if (currentEstimatedTokens < thresholdTokens || !Array.isArray(input) || input.length <= 4) {
    return { compressedInput: input, tokensSaved: 0, applied: false };
  }

  const protectRecentCount = 4;
  const middleStartIndex = 1;
  const middleEndIndex = input.length - protectRecentCount;

  if (middleStartIndex >= middleEndIndex) {
    return { compressedInput: input, tokensSaved: 0, applied: false };
  }

  const compressedInput = input.map((item, idx) => {
    if (idx >= middleStartIndex && idx < middleEndIndex) {
      if (typeof item === "string" && item.length > 800) {
        return compactString(item, 250, 250, "input turn");
      }
      if (item && typeof item === "object") {
        return compactMessageContent(item, 1);
      }
    }
    return item;
  });

  let charCount = 0;
  for (const item of compressedInput) {
    if (typeof item === "string") charCount += item.length;
    else if (item && typeof item === "object") charCount += calculateMessageChars(item);
  }
  if (instructions) charCount += instructions.length;

  const newTokens = Math.max(1, Math.ceil(charCount / 3.5));
  const tokensSaved = Math.max(0, currentEstimatedTokens - newTokens);

  return {
    compressedInput,
    tokensSaved,
    applied: tokensSaved > 0,
  };
}
