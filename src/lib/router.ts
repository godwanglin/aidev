import { prisma } from '@/lib/prisma';
import { decryptCredential } from '@/lib/crypto';
import { refreshConnectionToken } from '@/lib/oauth/refresh-manager';
import { normalizeModelRequest, NormalizedModelResult } from '@/lib/model-normalizer';
import { matchCustomProviderForModel } from '@/lib/custom-providers';

export interface RouteResult {
  baseUrl: string;
  apiKey: string;
  cookieString?: string;
  authType?: string;
  connectionId: string;
  provider: string;
  connectionName: string;
  accountEmail: string | null;
  cleanModel?: string;
  upstreamModel?: string;
  thinkingLevel?: string | null;
  thinkingBudget?: number | null;
}

export interface RouteContext {
  model?: string;
  provider?: string;
  excludeConnectionIds?: string[];
}

interface CachedProviderConnections {
  connections: any[];
  cachedAt: number;
}
const providerConnectionsCache = new Map<string, CachedProviderConnections>();
const CONNECTIONS_CACHE_TTL_MS = 5000; // 5 seconds in-memory cache

export function invalidateProviderConnectionsCache(_provider?: string) {
  providerConnectionsCache.clear();
}

export function parseModelList(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
      } catch {}
    }
    return trimmed
      .split(/[,\n]+/)
      .map((s) => s.trim().replace(/^["'\s\[]+|["'\s\]]+$/g, ""))
      .filter(Boolean);
  }
  return [];
}

export function normalizeModelName(m: string): string {
  if (!m) return "";
  return m
    .toLowerCase()
    .trim()
    .replace(/^(ag|cx|cc|gem|copilot|cb|kimi|or|qwen|groq|mistral|together|gptweb|chatgpt|deepseek|ollama)\//i, "");
}

export function matchesModel(configuredModel: string, targetModel?: string): boolean {
  if (!targetModel || !configuredModel) return false;
  const rawConf = configuredModel.toLowerCase().trim();
  const rawTarget = targetModel.toLowerCase().trim();
  if (rawConf === rawTarget) return true;

  const normConf = normalizeModelName(rawConf);
  const normTarget = normalizeModelName(rawTarget);
  return normConf === normTarget;
}

function matchesAnyTargetModel(
  configuredModel: string,
  contextModel?: string,
  cleanModel?: string,
  upstreamModel?: string
): boolean {
  if (contextModel && matchesModel(configuredModel, contextModel)) return true;
  if (cleanModel && matchesModel(configuredModel, cleanModel)) return true;
  if (upstreamModel && matchesModel(configuredModel, upstreamModel)) return true;
  return false;
}

const roundRobinCounters = new Map<string, number>();

export async function resolveUpstreamConnection(context: RouteContext): Promise<RouteResult | null> {
  // Normalize model to infer provider from prefix (e.g. 'ag/', 'cx/', 'cc/')
  const norm = normalizeModelRequest(context.model);
  let targetProvider = context.provider || norm.providerId || undefined;

  // Dynamic Custom Provider Resolution (e.g. prefix 'jrt' -> slug 'juan-rt' -> CUSTOM_JUAN_RT)
  if (context.model && context.model.includes("/")) {
    const customMatch = await matchCustomProviderForModel(context.model);
    if (customMatch) {
      targetProvider = customMatch.providerKey;
      norm.providerId = customMatch.providerKey;
      norm.providerName = customMatch.providerName;
      norm.cleanModel = customMatch.cleanModel;
      norm.upstreamModel = customMatch.cleanModel;
    } else if (!targetProvider || targetProvider.startsWith("CUSTOM_")) {
      const pfx = context.model.split("/")[0].toLowerCase().trim();
      const clean = context.model.slice(pfx.length + 1).trim();
      const possibleConn = await prisma.providerConnection.findFirst({
        where: {
          isActive: true,
          OR: [
            { provider: `CUSTOM_${pfx.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}` },
            { provider: pfx.toUpperCase() },
            { name: { contains: pfx } },
          ]
        }
      });
      if (possibleConn) {
        targetProvider = possibleConn.provider;
        norm.providerId = possibleConn.provider;
        norm.providerName = possibleConn.name;
        norm.cleanModel = clean;
        norm.upstreamModel = clean;
      }
    }
  }


  let strategy: string | undefined;

  // Check if provider has a specific routing strategy configured
  if (targetProvider) {
    const providerSetting = await prisma.systemSetting.findUnique({
      where: { id: `provider_routing_${targetProvider.toUpperCase().trim()}` }
    });
    if (providerSetting?.defaultRoutingStrategy) {
      strategy = providerSetting.defaultRoutingStrategy;
    }
  }

  // Fallback to global config strategy if provider has no specific override
  if (!strategy) {
    const globalConfig = await prisma.systemSetting.findUnique({
      where: { id: 'global_config' }
    });
    strategy = (globalConfig as any)?.defaultRoutingStrategy || 'SMART_FALLBACK';
  }

  if (!targetProvider) {
    // Never silently route unknown models to an arbitrary provider connection!
    // Multi-model fallbacks are strictly reserved for explicit Combo Models.
    return null;
  }

  const isCustom = targetProvider.startsWith('CUSTOM_');
  const customSlug = isCustom ? targetProvider.replace(/^CUSTOM_/, '') : '';
  const providerInList = [
    targetProvider,
    targetProvider.toUpperCase(),
    ...(isCustom ? [customSlug, customSlug.toLowerCase(), 'CUSTOM'] : []),
    ...(targetProvider === 'OPENAI' || targetProvider === 'OPENAI_CODEX' || targetProvider === 'CODEX' ? ['OPENAI_CODEX', 'OPENAI', 'CODEX'] : []),
    ...(targetProvider === 'CHATGPT_WEB' || targetProvider === 'CHATGPT' || targetProvider === 'GPTWEB' ? ['CHATGPT_WEB', 'CHATGPT', 'GPTWEB'] : []),
    ...(targetProvider === 'GOOGLE' || targetProvider === 'GEMINI' || targetProvider === 'GEMINI_CLI' ? ['GEMINI', 'GOOGLE', 'GEMINI_CLI'] : []),
    ...(targetProvider === 'ANTIGRAVITY' ? ['ANTIGRAVITY'] : []),
    ...(targetProvider === 'DEEPSEEK' ? ['DEEPSEEK'] : []),
    ...(targetProvider === 'ALIBABA' || targetProvider === 'QWEN' ? ['ALIBABA', 'QWEN', 'DASHSCOPE'] : []),
    ...(targetProvider === 'OLLAMA_CLOUD' || targetProvider === 'OLLAMA' ? ['OLLAMA_CLOUD', 'OLLAMA'] : []),
    ...(targetProvider === 'GROQ' ? ['GROQ'] : []),
    ...(targetProvider === 'MISTRAL' ? ['MISTRAL'] : []),
    ...(targetProvider === 'TOGETHER' ? ['TOGETHER'] : []),
  ];

  // 1. In-memory cache scan: fetch all active connections for this provider set
  const cacheKey = providerInList.slice().sort().join(',');
  const now = Date.now();
  const cachedEntry = providerConnectionsCache.get(cacheKey);
  let allActiveConnections: any[] = [];

  if (cachedEntry && (now - cachedEntry.cachedAt) < CONNECTIONS_CACHE_TTL_MS) {
    allActiveConnections = cachedEntry.connections;
  } else {
    allActiveConnections = await prisma.providerConnection.findMany({
      where: {
        isActive: true,
        provider: { in: providerInList },
      },
      orderBy: [
        { priority: 'asc' },
        { weight: 'desc' }
      ]
    });
    providerConnectionsCache.set(cacheKey, {
      connections: allActiveConnections,
      cachedAt: now,
    });
  }

  if (allActiveConnections.length === 0) {
    return null;
  }

  // 2. In-memory filter for current request session:
  // Exclude connections specified in excludeConnectionIds (e.g. from failover/retries)
  const excludedIds = new Set(context.excludeConnectionIds || []);
  const pool = allActiveConnections.filter((c) => !excludedIds.has(c.id));

  // Filter out temporary cooldown unless all are in cooldown
  const nowTime = Date.now();
  const nonCooldown = pool.filter((c) => !c.cooldownUntil || new Date(c.cooldownUntil).getTime() <= nowTime);
  const activePool = nonCooldown.length > 0 ? nonCooldown : pool;

  // 3. Blacklist filter (Disallowed Models):
  // If an account blocks this model, remove it completely from primary and fallback candidate pool
  const nonBlocked = activePool.filter((conn) => {
    const disallowed = parseModelList(conn.disallowedModels);
    if (disallowed.length === 0) return true;
    return !disallowed.some((dm) => matchesAnyTargetModel(dm, context.model, norm.cleanModel, norm.upstreamModel));
  });

  // 4. Whitelist filter (Exclusive Custom Models):
  // Check if ANY active connection explicitly registered this model in customModels
  const whitelisted = nonBlocked.filter((conn) => {
    const custom = parseModelList(conn.customModels);
    if (custom.length === 0) return false;
    return custom.some((cm) => matchesAnyTargetModel(cm, context.model, norm.cleanModel, norm.upstreamModel));
  });

  // If at least 1 account claims this model -> ONLY route to those whitelisted accounts!
  // If NO account claims this model -> Skip whitelist rule, keep all non-blocked accounts!
  const candidatePool = whitelisted.length > 0 ? whitelisted : nonBlocked;

  // Filter out EXHAUSTED and FAILED connections if other healthy connections are available
  const healthy = candidatePool.filter((c) => c.syncStatus !== 'EXHAUSTED' && c.syncStatus !== 'FAILED');
  const poolAfterExhausted = healthy.length > 0 ? healthy : candidatePool;

  // Prefer NORMAL accounts over LOW_QUOTA if available
  const normalPool = poolAfterExhausted.filter((c) => c.syncStatus === 'NORMAL');
  const eligibleConnections = normalPool.length > 0 ? normalPool : poolAfterExhausted;

  if (eligibleConnections.length === 0) {
    return null;
  }

  let selectedConnection = eligibleConnections[0];

  if (strategy === 'ROUND_ROBIN') {
    const groupKey = targetProvider || 'ALL';
    let currentIndex = roundRobinCounters.get(groupKey) || 0;
    
    const totalWeight = eligibleConnections.reduce((sum, conn) => sum + (conn.weight || 1), 0);
    
    if (totalWeight > 0) {
      let targetWeight = currentIndex % totalWeight;
      for (const conn of eligibleConnections) {
        const weight = conn.weight || 1;
        if (targetWeight < weight) {
          selectedConnection = conn;
          break;
        }
        targetWeight -= weight;
      }
      
      roundRobinCounters.set(groupKey, currentIndex + 1);
    }
  } else {
    // For SMART_FALLBACK / default:
    // If multiple accounts share top priority and weight, balance requests across them
    const topPriority = eligibleConnections[0].priority ?? 1;
    const topWeight = eligibleConnections[0].weight ?? 1;
    const equalTier = eligibleConnections.filter(
      (c) => (c.priority ?? 1) === topPriority && (c.weight ?? 1) === topWeight
    );
    if (equalTier.length > 1) {
      const groupKey = targetProvider || 'ALL';
      const currentIndex = roundRobinCounters.get(groupKey) || 0;
      selectedConnection = equalTier[currentIndex % equalTier.length];
      roundRobinCounters.set(groupKey, (currentIndex + 1) % 1000000);
    }
  }

  return await buildRouteResult(selectedConnection, norm);
}

async function buildRouteResult(connection: any, norm?: NormalizedModelResult): Promise<RouteResult> {
  let baseUrl = connection.baseUrl;
  
  if (!baseUrl) {
    switch (connection.provider) {
      case 'OPENAI':
      case 'OPENAI_CODEX':
        baseUrl = 'https://api.openai.com/v1';
        break;
      case 'ANTHROPIC':
      case 'CLAUDE_CODE':
        baseUrl = 'https://api.anthropic.com/v1';
        break;
      case 'ANTIGRAVITY':
      case 'GEMINI_CLI':
        baseUrl = 'https://daily-cloudcode-pa.googleapis.com';
        break;
      case 'GOOGLE':
      case 'GEMINI':
      case 'GEMINI_API':
      case 'VERTEX_AI':
        baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
        break;
      case 'DEEPSEEK':
        baseUrl = 'https://api.deepseek.com';
        break;
      case 'ALIBABA':
      case 'QWEN':
      case 'DASHSCOPE':
        baseUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
        break;
      case 'OPENROUTER':
        baseUrl = 'https://openrouter.ai/api/v1';
        break;
      case 'OPENCODE':
      case 'OPENCODE_FREE':
        baseUrl = 'https://opencode.ai/api/v1';
        break;
      case 'KIMI':
        baseUrl = 'https://api.moonshot.cn/v1';
        break;
      case 'OLLAMA_CLOUD':
      case 'OLLAMA':
        baseUrl = 'https://ollama.com/v1';
        break;
      case 'GROQ':
        baseUrl = 'https://api.groq.com/openai/v1';
        break;
      case 'MISTRAL':
        baseUrl = 'https://api.mistral.ai/v1';
        break;
      case 'TOGETHER':
        baseUrl = 'https://api.together.xyz/v1';
        break;
      default:
        baseUrl = connection.baseUrl || 'https://api.openai.com/v1';
    }
  }

  let apiKey = '';
  let cookieString = '';

  if (connection.apiKeyEncrypted) {
    try {
      cookieString = decryptCredential(connection.apiKeyEncrypted);
    } catch {}
  }

  if (connection.authType === 'OAUTH') {
    try {
      // Proactively refreshes if tokenExpiresAt is within 10 minutes, using dedup lock
      apiKey = await refreshConnectionToken(connection.id, false);
    } catch (err) {
      // Fallback to existing decrypted accessTokenEnc if refresh fails temporarily
      if (connection.accessTokenEnc) {
        try {
          apiKey = decryptCredential(connection.accessTokenEnc);
        } catch {}
      }
    }
  } else if (connection.authType === 'COOKIE' || connection.provider === 'CHATGPT_WEB') {
    if (connection.accessTokenEnc) {
      try {
        apiKey = decryptCredential(connection.accessTokenEnc);
      } catch {}
    }
    if (!apiKey) {
      apiKey = cookieString;
    }
  } else if (connection.apiKeyEncrypted) {
    apiKey = cookieString;
  }

  return {
    baseUrl,
    apiKey,
    cookieString: cookieString || undefined,
    authType: connection.authType || 'API_KEY',
    connectionId: connection.id,
    provider: connection.provider,
    connectionName: connection.name,
    accountEmail: connection.accountEmail || null,
    cleanModel: norm?.cleanModel,
    upstreamModel: norm?.upstreamModel,
    thinkingLevel: norm?.thinkingLevel,
    thinkingBudget: norm?.thinkingBudget,
  };
}

export async function markConnectionCooldown(connectionId: string, durationSeconds: number = 60): Promise<void> {
  if (!connectionId || connectionId.startsWith("default-")) return;
  try {
    invalidateProviderConnectionsCache();
    const cooldownUntil = new Date(Date.now() + durationSeconds * 1000);
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { cooldownUntil }
    });
  } catch {}
}

import { telemetryStore } from "./telemetry-store";

/**
 * Compacts a chat request body for logging to prevent storing bloated multi-turn history.
 * Preserves:
 * 1. System instruction (developer prompt / agent instructions)
 * 2. Tool declarations summary (type & name, omit heavy schemas)
 * 3. An omitted breadcrumb note if older conversation turns exist
 * 4. The latest turn (last 1-2 messages: e.g. latest user prompt)
 *
 * Keeps output 100% valid JSON, reduces DB footprint from ~100KB to ~2KB.
 */
export function compactRequestBodyForLog(rawBody: any): string | null {
  if (!rawBody) return null;

  let bodyObj: any;
  if (typeof rawBody === "string") {
    try {
      bodyObj = JSON.parse(rawBody);
    } catch {
      // If it's not valid JSON, slice safely
      return rawBody.slice(0, 10000);
    }
  } else if (typeof rawBody === "object" && rawBody !== null) {
    try {
      bodyObj = JSON.parse(JSON.stringify(rawBody));
    } catch {
      bodyObj = { ...rawBody };
    }
  } else {
    return String(rawBody).slice(0, 5000);
  }

  try {
    const compacted: Record<string, any> = {
      model: bodyObj.model,
    };

    // 1. Anthropic / Top-level system
    if (bodyObj.system) {
      if (typeof bodyObj.system === "string") {
        compacted.system = bodyObj.system.length > 8000
          ? `${bodyObj.system.slice(0, 8000)}\n\n[... sisa instruksi sistem dipotong untuk log ...]`
          : bodyObj.system;
      } else {
        compacted.system = bodyObj.system;
      }
    }

    // 2. Compact tools declaration (keep names/types instead of heavy schemas)
    if (Array.isArray(bodyObj.tools) && bodyObj.tools.length > 0) {
      compacted.tools = bodyObj.tools.slice(0, 15).map((t: any) => ({
        type: t.type || "function",
        name: t.function?.name || t.name || "tool",
        description: t.function?.description?.slice(0, 80) || t.description?.slice(0, 80) || undefined,
      }));
      if (bodyObj.tools.length > 15) {
        compacted._toolsOmitted = `${bodyObj.tools.length - 15} more tools omitted from log`;
      }
    }

    // Helper to sanitize message content (strip huge base64 or bound long text)
    const sanitizeContent = (content: any): any => {
      if (typeof content === "string") {
        return content.length > 12000
          ? `${content.slice(0, 12000)}\n\n[... isi pesan dipotong pada 12KB untuk log ...]`
          : content;
      }
      if (Array.isArray(content)) {
        return content.map((part: any) => {
          if (typeof part === "string") {
            return part.length > 8000 ? `${part.slice(0, 8000)}...` : part;
          }
          if (part && typeof part === "object") {
            if (part.type === "image" || part.type === "image_url") {
              return { type: "image", note: "[Gambar/Lampiran Base64 diringkas untuk log]" };
            }
            if (part.type === "text" && typeof part.text === "string" && part.text.length > 8000) {
              return { ...part, text: `${part.text.slice(0, 8000)}\n\n[... teks dipotong pada 8KB ...]` };
            }
          }
          return part;
        });
      }
      return content;
    };

    // 3. Compact OpenAI / Anthropic messages
    if (Array.isArray(bodyObj.messages)) {
      const allMsgs = bodyObj.messages;
      const systemMsgs: any[] = [];
      const nonSystemMsgs: any[] = [];

      for (const m of allMsgs) {
        if (!m) continue;
        const role = (m.role || "").toLowerCase();
        if (role === "system" || role === "developer") {
          systemMsgs.push({ ...m, content: sanitizeContent(m.content) });
        } else {
          nonSystemMsgs.push(m);
        }
      }

      const compactedMessages: any[] = [...systemMsgs];

      // Helper to check if a message is a real human user prompt (not just synthetic total_tokens or tool_result)
      const isRealUserMsg = (m: any): boolean => {
        if (!m || (m.role !== "user" && m.role !== "human")) return false;
        let text = "";
        if (typeof m.content === "string") {
          text = m.content;
        } else if (Array.isArray(m.content)) {
          if (m.content.every((p: any) => p && p.type === "tool_result")) return false;
          text = m.content
            .filter((p: any) => p && p.type !== "tool_result")
            .map((p: any) => p.text || (typeof p === "string" ? p : ""))
            .join(" ");
        }
        const cleaned = text.replace(/<total_tokens>[\s\S]*?<\/total_tokens>/gi, "").trim();
        return cleaned.length > 0;
      };

      // Strip <total_tokens> tags from user content
      const cleanUserContent = (msg: any): any => {
        if (!msg) return msg;
        const cloned = { ...msg };
        if (typeof cloned.content === "string") {
          cloned.content = cloned.content.replace(/<total_tokens>[\s\S]*?<\/total_tokens>/gi, "").trim();
        } else if (Array.isArray(cloned.content)) {
          cloned.content = cloned.content
            .filter((p: any) => {
              if (typeof p === "string" && /<total_tokens>[\s\S]*?<\/total_tokens>/i.test(p)) return false;
              if (p?.text && /<total_tokens>[\s\S]*?<\/total_tokens>/i.test(p.text)) return false;
              return true;
            })
            .map((p: any) => {
              if (typeof p === "string") return p.replace(/<total_tokens>[\s\S]*?<\/total_tokens>/gi, "").trim();
              if (p?.text) return { ...p, text: p.text.replace(/<total_tokens>[\s\S]*?<\/total_tokens>/gi, "").trim() };
              return p;
            });
        }
        return cloned;
      };

      if (nonSystemMsgs.length > 0) {
        // Find the latest real human user prompt in conversation history
        const lastUserMsg = [...nonSystemMsgs].reverse().find(isRealUserMsg);
        
        // Find recent turn messages (tool calls, tool results, assistant interactions)
        const recentTurnMsgs = nonSystemMsgs.slice(-3).filter((m) => m !== lastUserMsg);

        const keptCount = (lastUserMsg ? 1 : 0) + recentTurnMsgs.length;
        if (nonSystemMsgs.length > keptCount) {
          const omittedCount = nonSystemMsgs.length - keptCount;
          compactedMessages.push({
            role: "system",
            content: `[Riwayat percakapan: ${omittedCount} pesan riwayat sebelumnya dilewati untuk menghemat log]`,
            _isHistoryOmittedNote: true,
          });
        }

        // 1. Put REAL User Prompt FIRST (so it renders at the top on the right!)
        if (lastUserMsg) {
          compactedMessages.push(cleanUserContent(lastUserMsg));
        }

        // 2. Put Tool execution / Tool result / Assistant turn AFTER user prompt (renders below on the left!)
        for (const tm of recentTurnMsgs) {
          if (isRealUserMsg(tm)) continue;
          const cleaned = cleanUserContent(tm);
          if (cleaned.role === "user" && (!cleaned.content || cleaned.content.length === 0)) {
            continue;
          }
          compactedMessages.push(cleaned);
        }
      }

      compacted.messages = compactedMessages;
    } else if (Array.isArray(bodyObj.input)) {
      // 4. Codex Responses input format
      const allInputs = bodyObj.input;
      const sysInputs: any[] = [];
      const nonSysInputs: any[] = [];

      for (const item of allInputs) {
        if (!item) continue;
        if (item.type === "additional_tools" || item.role === "system") {
          sysInputs.push(item);
        } else {
          nonSysInputs.push(item);
        }
      }

      const compactedInputs: any[] = [...sysInputs];
      if (nonSysInputs.length > 1) {
        compactedInputs.push({
          role: "system",
          content: `[Riwayat percakapan: ${nonSysInputs.length - 1} item input sebelumnya dilewati untuk menghemat log]`,
        });
      }
      if (nonSysInputs.length > 0) {
        compactedInputs.push(nonSysInputs[nonSysInputs.length - 1]);
      }
      compacted.input = compactedInputs;
    } else if (Array.isArray(bodyObj.contents)) {
      // 5. Gemini format
      if (bodyObj.systemInstruction) {
        compacted.systemInstruction = bodyObj.systemInstruction;
      }
      if (bodyObj.contents.length > 1) {
        compacted.contents = [
          {
            role: "user",
            parts: [{ text: `[Riwayat percakapan: ${bodyObj.contents.length - 1} turn sebelumnya dilewati untuk log]` }]
          },
          bodyObj.contents[bodyObj.contents.length - 1]
        ];
      } else {
        compacted.contents = bodyObj.contents;
      }
    } else if (bodyObj.prompt) {
      compacted.prompt = typeof bodyObj.prompt === "string" && bodyObj.prompt.length > 10000
        ? `${bodyObj.prompt.slice(0, 10000)}... [truncated]`
        : bodyObj.prompt;
    }

    if (bodyObj.max_tokens !== undefined) compacted.max_tokens = bodyObj.max_tokens;
    if (bodyObj.temperature !== undefined) compacted.temperature = bodyObj.temperature;
    if (bodyObj.stream !== undefined) compacted.stream = bodyObj.stream;

    return JSON.stringify(compacted, null, 2);
  } catch {
    return typeof rawBody === "object" ? JSON.stringify(rawBody).slice(0, 20000) : String(rawBody).slice(0, 20000);
  }
}

export async function logUpstreamRequest(data: {
  connectionId?: string | null;
  provider: string;
  model: string;
  clientApiKeyId?: string | null;
  clientUserId?: string | null;
  clientUserEmail?: string | null;
  reasoningEffort?: string | null;
  rawHeaders?: string | Record<string, any> | null;
  rawBody?: string | Record<string, any> | null;
  rawResponse?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensSavedRtk?: number;
  latencyMs: number;
  statusCode: number;
  isFailover: boolean;
  failoverReason?: string | null;
}): Promise<void> {
  const rtkSaved = Number(data.tokensSavedRtk) || 0;
  const safeConnectionId = (data.connectionId && !data.connectionId.startsWith("default-")) ? data.connectionId : null;
  
  const rawHeadersStr = data.rawHeaders
    ? (typeof data.rawHeaders === "object" ? JSON.stringify(data.rawHeaders, null, 2) : String(data.rawHeaders)).slice(0, 15000)
    : null;
    
  const rawBodyStr = compactRequestBodyForLog(data.rawBody);
  
  let rawResponseStr: string | null = null;
  if (data.rawResponse) {
    if (typeof data.rawResponse === "object") {
      try {
        rawResponseStr = JSON.stringify(data.rawResponse, null, 2);
      } catch {
        rawResponseStr = String(data.rawResponse);
      }
    } else {
      rawResponseStr = String(data.rawResponse);
    }
    if (rawResponseStr.length > 35000) {
      rawResponseStr = rawResponseStr.slice(0, 35000) + "\n\n[... response dipotong pada 35KB untuk log ...]";
    }
  }

  const safeData: any = {
    ...data,
    model: String(data.model || "default").slice(0, 190),
    connectionId: safeConnectionId,
    clientUserEmail: data.clientUserEmail ? String(data.clientUserEmail).slice(0, 190) : null,
    reasoningEffort: data.reasoningEffort ? String(data.reasoningEffort).slice(0, 50) : null,
    rawHeaders: rawHeadersStr,
    rawBody: rawBodyStr,
    rawResponse: rawResponseStr,
    failoverReason: data.failoverReason ? String(data.failoverReason).slice(0, 180) : null,
  };

  try {
    const created = await prisma.upstreamLog.create({
      data: {
        ...safeData,
        tokensSavedRtk: rtkSaved,
      }
    });

    telemetryStore.set(created.id, {
      id: created.id,
      timestamp: new Date().toISOString(),
      clientAccount: {
        userId: data.clientUserId,
        email: data.clientUserEmail,
      },
      reasoningEffort: data.reasoningEffort,
      rawHeaders: rawHeadersStr,
      rawBody: rawBodyStr,
      rawResponse: rawResponseStr,
    });

    if (rtkSaved > 0) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE UpstreamLog SET tokensSavedRtk = ${rtkSaved} WHERE id = '${created.id}'`
        );
      } catch {}
    }
  } catch {
    try {
      const { tokensSavedRtk, rawHeaders, rawBody, rawResponse, clientUserEmail, reasoningEffort, ...rest } = safeData;
      const created = await prisma.upstreamLog.create({
        data: rest,
      });

      telemetryStore.set(created.id, {
        id: created.id,
        timestamp: new Date().toISOString(),
        clientAccount: {
          userId: data.clientUserId,
          email: data.clientUserEmail,
        },
        reasoningEffort: data.reasoningEffort,
        rawHeaders: rawHeadersStr,
        rawBody: rawBodyStr,
        rawResponse: rawResponseStr,
      });

      if (rtkSaved > 0) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE UpstreamLog SET tokensSavedRtk = ${rtkSaved} WHERE id = '${created.id}'`
          );
        } catch {}
      }
    } catch {}
  }
}

export async function resolveWithFailover(context: RouteContext): Promise<RouteResult | null> {
  const norm = normalizeModelRequest(context.model);
  const targetProvider = context.provider || norm.providerId || undefined;

  const whereClause: any = {
    isActive: true,
    syncStatus: { not: 'EXHAUSTED' },
    OR: [
      { cooldownUntil: null },
      { cooldownUntil: { lt: new Date() } }
    ]
  };

  if (targetProvider) {
    whereClause.provider = {
      in: [
        targetProvider,
        targetProvider.toUpperCase(),
        ...(targetProvider === 'OPENAI' ? ['OPENAI_CODEX'] : []),
        ...(targetProvider === 'OPENAI_CODEX' ? ['OPENAI'] : []),
        ...(targetProvider === 'GOOGLE' ? ['ANTIGRAVITY', 'GEMINI_API'] : []),
        ...(targetProvider === 'ANTIGRAVITY' ? ['GOOGLE'] : []),
      ]
    };
  }

  const connections = await prisma.providerConnection.findMany({
    where: whereClause,
    orderBy: [
      { priority: 'asc' },
      { weight: 'desc' }
    ]
  });

  if (connections.length === 0) {
    return null;
  }

  return await buildRouteResult(connections[0], norm);
}

/**
 * Force-refreshes an OAuth connection's token when upstream returns 401 Unauthorized.
 */
export async function refreshConnectionOn401(connectionId: string): Promise<string> {
  return refreshConnectionToken(connectionId, true);
}

