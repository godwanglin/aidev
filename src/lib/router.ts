import { prisma } from '@/lib/prisma';
import { decryptCredential } from '@/lib/crypto';
import { refreshConnectionToken } from '@/lib/oauth/refresh-manager';
import { normalizeModelRequest, NormalizedModelResult } from '@/lib/model-normalizer';
import { matchCustomProviderForModel } from '@/lib/custom-providers';

export interface RouteResult {
  baseUrl: string;
  apiKey: string;
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

  const whereClause: any = {
    isActive: true,
    OR: [
      { cooldownUntil: null },
      { cooldownUntil: { lt: new Date() } }
    ]
  };

  if (targetProvider) {
    const isCustom = targetProvider.startsWith('CUSTOM_');
    const customSlug = isCustom ? targetProvider.replace(/^CUSTOM_/, '') : '';
    whereClause.provider = {
      in: [
        targetProvider,
        targetProvider.toUpperCase(),
        ...(isCustom ? [customSlug, customSlug.toLowerCase(), 'CUSTOM'] : []),
        ...(targetProvider === 'OPENAI' || targetProvider === 'OPENAI_CODEX' || targetProvider === 'CODEX' ? ['OPENAI_CODEX', 'OPENAI', 'CODEX'] : []),
        ...(targetProvider === 'GOOGLE' || targetProvider === 'GEMINI' || targetProvider === 'GEMINI_CLI' ? ['GEMINI', 'GOOGLE', 'GEMINI_CLI'] : []),
        ...(targetProvider === 'ANTIGRAVITY' ? ['ANTIGRAVITY'] : []),
        ...(targetProvider === 'DEEPSEEK' ? ['DEEPSEEK'] : []),
        ...(targetProvider === 'ALIBABA' || targetProvider === 'QWEN' ? ['ALIBABA', 'QWEN', 'DASHSCOPE'] : []),
        ...(targetProvider === 'OLLAMA_CLOUD' || targetProvider === 'OLLAMA' ? ['OLLAMA_CLOUD', 'OLLAMA'] : []),
        ...(targetProvider === 'GROQ' ? ['GROQ'] : []),
        ...(targetProvider === 'MISTRAL' ? ['MISTRAL'] : []),
        ...(targetProvider === 'TOGETHER' ? ['TOGETHER'] : []),
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
    if (targetProvider) {
      // If all connections are in temporary cooldown, find active connections ignoring cooldown,
      // ordered by earliest cooldown expiry so the request doesn't drop to an incompatible fallback provider!
      const fallbackConnections = await prisma.providerConnection.findMany({
        where: {
          isActive: true,
          provider: whereClause.provider,
        },
        orderBy: [
          { cooldownUntil: 'asc' },
          { priority: 'asc' },
          { weight: 'desc' }
        ]
      });
      if (fallbackConnections.length > 0) {
        const nonExhausted = fallbackConnections.filter(c => c.syncStatus !== 'EXHAUSTED');
        const eligible = nonExhausted.length > 0 ? nonExhausted : fallbackConnections;
        return await buildRouteResult(eligible[0], norm);
      }
    }
    return null;
  }

  // Filter out EXHAUSTED connections if other healthy connections are available
  const nonExhausted = connections.filter(c => c.syncStatus !== 'EXHAUSTED');
  const eligibleConnections = nonExhausted.length > 0 ? nonExhausted : connections;

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
  } else if (connection.apiKeyEncrypted) {
    try {
      apiKey = decryptCredential(connection.apiKeyEncrypted);
    } catch {}
  }

  return {
    baseUrl,
    apiKey,
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
    const cooldownUntil = new Date(Date.now() + durationSeconds * 1000);
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { cooldownUntil }
    });
  } catch {}
}

export async function logUpstreamRequest(data: {
  connectionId?: string | null;
  provider: string;
  model: string;
  clientApiKeyId?: string | null;
  clientUserId?: string | null;
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
  const safeData = {
    ...data,
    model: String(data.model || "default").slice(0, 190),
    connectionId: safeConnectionId,
    failoverReason: data.failoverReason ? String(data.failoverReason).slice(0, 180) : null,
  };
  try {
    const created = await prisma.upstreamLog.create({
      data: {
        ...safeData,
        tokensSavedRtk: rtkSaved,
      }
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
      const { tokensSavedRtk, ...rest } = safeData;
      const created = await prisma.upstreamLog.create({
        data: rest,
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

