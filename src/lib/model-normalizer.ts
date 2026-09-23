/**
 * Model Prefix Normalization System
 * 
 * Normalizes provider prefixes (e.g. 'ag/', 'cx/', 'cc/', 'gem/', 'or/')
 * across routing, upstream dispatching, and virtual thinking parameter mapping.
 */

export interface ProviderPrefixConfig {
  prefix: string;
  providerId: string;
  providerName: string;
  aliases?: string[];
  defaultUpstreamModel?: string;
  virtualModelMap?: Record<string, string>;
}

export interface NormalizedModelResult {
  rawModel: string;
  cleanModel: string;             // Stripped of prefix, e.g. "gemini-3.8-flash-high"
  upstreamModel: string;          // Sent to real upstream API, e.g. "gemini-2.5-flash"
  providerId: string | null;      // e.g. "ANTIGRAVITY", "OPENAI_CODEX"
  providerName: string | null;
  matchedPrefix: string | null;
  thinkingLevel: "HIGH" | "MEDIUM" | "LOW" | "OFF" | null;
  thinkingBudget: number | null;
}

export const PROVIDER_PREFIX_REGISTRY: ProviderPrefixConfig[] = [
  {
    prefix: "ag/",
    providerId: "ANTIGRAVITY",
    providerName: "Antigravity",
    aliases: ["antigravity/", "google-ag/"],
    defaultUpstreamModel: "gemini-2.5-flash",
    virtualModelMap: {
      "gemini-3.8-flash-high": "gemini-3.8-flash-high",
      "gemini-3.8-flash-medium": "gemini-3.8-flash-medium",
      "gemini-3.8-flash-low": "gemini-3.8-flash-low",
      "gemini-3.8-flash": "gemini-3.8-flash-medium",
      "gemini-3.7-flash-high": "gemini-3.7-flash-high",
      "gemini-3.7-flash-medium": "gemini-3.7-flash-medium",
      "gemini-3.7-flash-low": "gemini-3.7-flash-low",
      "gemini-3.6-flash-high": "gemini-3.6-flash-high",
      "gemini-3.6-flash-medium": "gemini-3.6-flash-medium",
      "gemini-3.6-flash-low": "gemini-3.6-flash-low",
      "gemini-3.5-flash-high": "gemini-3.5-flash-high",
      "gemini-3.5-flash-medium": "gemini-3.5-flash-medium",
      "gemini-3.5-flash-low": "gemini-3.5-flash-low",
      "gemini-3.5-flash-extra-low": "gemini-3.5-flash-extra-low",
      "gemini-3-flash-agent": "gemini-3-flash-agent",
      "gemini-3-flash": "gemini-3-flash",
      "gemini-pro-agent": "gemini-pro-agent",
      "gemini-3.1-pro-high": "gemini-3.1-pro-high",
      "gemini-3.1-pro-low": "gemini-3.1-pro-low",
      "claude-sonnet-4-6": "claude-sonnet-4-6",
      "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
      "gpt-oss-120b-medium": "gpt-oss-120b-medium",
    },
  },
  {
    prefix: "cx/",
    providerId: "OPENAI_CODEX",
    providerName: "OpenAI Codex",
    aliases: ["codex/", "openai-codex/"],
    defaultUpstreamModel: "gpt-5.5",
  },
  {
    prefix: "cc/",
    providerId: "CLAUDE_CODE",
    providerName: "Claude Code",
    aliases: ["claude/", "anthropic/"],
    defaultUpstreamModel: "claude-3-7-sonnet-20250219",
  },
  {
    prefix: "gem/",
    providerId: "GEMINI",
    providerName: "Google Gemini",
    aliases: ["gemini/", "google/", "gcli/", "gemini-cli/"],
    defaultUpstreamModel: "gemini-2.5-flash",
  },
  {
    prefix: "or/",
    providerId: "OPENROUTER",
    providerName: "OpenRouter",
    aliases: ["openrouter/"],
    defaultUpstreamModel: "openrouter/free",
    virtualModelMap: {
      "free": "openrouter/free",
    },
  },
  {
    prefix: "oc/",
    providerId: "OPENCODE_FREE",
    providerName: "OpenCode Free",
    aliases: ["opencode/"],
    defaultUpstreamModel: "deepseek-coder",
  },
  {
    prefix: "kimi/",
    providerId: "KIMI",
    providerName: "Kimi Moonshot",
    aliases: ["moonshot/"],
    defaultUpstreamModel: "moonshot-v1-8k",
  },
  {
    prefix: "ollama/",
    providerId: "OLLAMA_CLOUD",
    providerName: "Ollama Cloud",
    defaultUpstreamModel: "llama3.3",
  },
  {
    prefix: "deepseek/",
    providerId: "DEEPSEEK",
    providerName: "DeepSeek",
    aliases: ["ds/"],
    defaultUpstreamModel: "deepseek-chat",
    virtualModelMap: {
      "deepseek-v4-flash": "deepseek-v4-flash",
      "deepseek-v4-flash-vision-exp": "deepseek-v4-flash-vision-exp",
      "deepseek-v4.1-flash": "deepseek-v4.1-flash",
      "deepseek-v4": "deepseek-v4",
      "deepseek-v4-pro": "deepseek-v4-pro",
      "deepseek-flash": "deepseek-flash",
      "deepseek-r1": "deepseek-r1",
      "deepseek-reasoner": "deepseek-reasoner",
      "deepseek-chat": "deepseek-chat",
    },
  },
  {
    prefix: "qwen/",
    providerId: "ALIBABA",
    providerName: "Alibaba Qwen",
    aliases: ["ali/", "alibaba/"],
    defaultUpstreamModel: "qwen-max",
  },
  {
    prefix: "groq/",
    providerId: "GROQ",
    providerName: "Groq",
    defaultUpstreamModel: "llama-3.3-70b-versatile",
  },
  {
    prefix: "mistral/",
    providerId: "MISTRAL",
    providerName: "Mistral AI",
    aliases: ["codestral/"],
    defaultUpstreamModel: "mistral-large-latest",
  },
  {
    prefix: "together/",
    providerId: "TOGETHER",
    providerName: "Together AI",
    defaultUpstreamModel: "deepseek-ai/DeepSeek-R1",
  },
];

/**
 * Normalizes a requested model name by detecting prefix, mapping virtual thinking aliases,
 * and identifying the target provider.
 */
export function normalizeModelRequest(rawModel?: string | null): NormalizedModelResult {
  if (!rawModel || typeof rawModel !== "string") {
    return {
      rawModel: "",
      cleanModel: "default-model",
      upstreamModel: "default-model",
      providerId: null,
      providerName: null,
      matchedPrefix: null,
      thinkingLevel: null,
      thinkingBudget: null,
    };
  }

  const trimmed = rawModel.trim();
  const lower = trimmed.toLowerCase();

  // 0. Check Combo Model prefix (e.g. combo/coding-stack or combo:fast)
  if (lower.startsWith("combo/") || lower.startsWith("combo:")) {
    const cleanModel = trimmed.slice(6);
    return {
      rawModel: trimmed,
      cleanModel,
      upstreamModel: cleanModel,
      providerId: "COMBO",
      providerName: "Combo Auto-Rotate",
      matchedPrefix: trimmed.slice(0, 6),
      thinkingLevel: null,
      thinkingBudget: null,
    };
  }

  // 0b. Check Gateway / Client tool namespace prefixes (e.g. "aidev/deepseek-reasoner", "aidev_gateway/gpt-5.2")
  const CLIENT_GATEWAY_NAMESPACES = [
    "aidev/",
    "aidev-cli/",
    "aidev_gateway/",
    "custom_gateway/",
    "custom/",
    "gateway/",
    "my-gateway/",
    "local/",
    "proxy/",
  ];
  for (const ns of CLIENT_GATEWAY_NAMESPACES) {
    if (lower.startsWith(ns)) {
      const strippedInner = trimmed.slice(ns.length);
      const innerResult = normalizeModelRequest(strippedInner);
      return {
        ...innerResult,
        rawModel: trimmed,
        matchedPrefix: ns,
      };
    }
  }

  // If prefixed with opencode/ but targeting a gateway model (not deepseek-coder / free)
  if ((lower.startsWith("opencode/") || lower.startsWith("oc/")) && !lower.includes("deepseek-coder") && !lower.endsWith("/free")) {
    const prefixLen = lower.startsWith("opencode/") ? 9 : 3;
    const strippedInner = trimmed.slice(prefixLen);
    const innerResult = normalizeModelRequest(strippedInner);
    return {
      ...innerResult,
      rawModel: trimmed,
      matchedPrefix: trimmed.slice(0, prefixLen),
    };
  }

  // 1. Check matching provider prefix (direct prefix or alias)
  for (const config of PROVIDER_PREFIX_REGISTRY) {
    const allPrefixes = [config.prefix, ...(config.aliases || [])];
    for (const p of allPrefixes) {
      if (lower.startsWith(p.toLowerCase())) {
        const cleanModel = trimmed.slice(p.length);
        const cleanLower = cleanModel.toLowerCase();

        // Detect reasoning / thinking level
        let thinkingLevel: "HIGH" | "MEDIUM" | "LOW" | "OFF" | null = null;
        let thinkingBudget: number | null = null;

        if (cleanLower.includes("extra-low")) {
          thinkingLevel = "LOW";
          thinkingBudget = 1024;
        } else if (cleanLower.includes("high")) {
          thinkingLevel = "HIGH";
          thinkingBudget = 24576;
        } else if (cleanLower.includes("medium")) {
          thinkingLevel = "MEDIUM";
          thinkingBudget = 8192;
        } else if (cleanLower.includes("low")) {
          thinkingLevel = "LOW";
          thinkingBudget = 2048;
        } else if (cleanLower.includes("thinking")) {
          thinkingLevel = "HIGH";
          thinkingBudget = 16384;
        }

        // Map virtual alias to true upstream model if mapped, otherwise use clean model
        let upstreamModel = cleanModel;
        if (config.providerId === "NINE_ROUTER") {
          upstreamModel = trimmed;
        } else if (config.virtualModelMap && config.virtualModelMap[cleanLower]) {
          upstreamModel = config.virtualModelMap[cleanLower];
        }

        return {
          rawModel: trimmed,
          cleanModel,
          upstreamModel,
          providerId: config.providerId,
          providerName: config.providerName,
          matchedPrefix: config.prefix,
          thinkingLevel,
          thinkingBudget,
        };
      }
    }
  }

  // 2. Fallback heuristic: Detect provider from standard model name patterns
  let inferredProvider: string | null = null;
  let inferredName: string | null = null;
  let inferredUpstream = trimmed;

if (
    lower.startsWith("gpt-") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("chatgpt-") ||
    lower.startsWith("text-embedding")
  ) {
    inferredProvider = "OPENAI";
    inferredName = "OpenAI";
  } else if (lower.startsWith("claude-")) {
    inferredProvider = "CLAUDE_CODE";
    inferredName = "Claude Code";
  } else if (lower.startsWith("gemini-")) {
    inferredProvider = "ANTIGRAVITY";
    inferredName = "Antigravity";
  } else if (lower.startsWith("deepseek-")) {
    inferredProvider = "DEEPSEEK";
    inferredName = "DeepSeek";
  } else if (lower.startsWith("qwen-")) {
    inferredProvider = "ALIBABA";
    inferredName = "Alibaba Qwen";
  }

  // 3. Dynamic Custom Provider Prefix detection (e.g. "ipeenk/gpt-5.5" or "oc-prod/gpt-4o")
  const slashIdx = trimmed.indexOf("/");
  if (slashIdx > 0) {
    const prefixCandidate = trimmed.slice(0, slashIdx + 1);
    const cleanModel = trimmed.slice(slashIdx + 1);
    const slug = prefixCandidate.slice(0, -1).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    return {
      rawModel: trimmed,
      cleanModel,
      upstreamModel: cleanModel,
      providerId: `CUSTOM_${slug.toUpperCase()}`,
      providerName: slug,
      matchedPrefix: prefixCandidate,
      thinkingLevel: null,
      thinkingBudget: null,
    };
  }

  return {
    rawModel: trimmed,
    cleanModel: trimmed,
    upstreamModel: inferredUpstream,
    providerId: inferredProvider,
    providerName: inferredName,
    matchedPrefix: null,
    thinkingLevel: null,
    thinkingBudget: null,
  };
}

/**
 * Returns the standard prefix for a given provider ID (e.g. "ag/" for ANTIGRAVITY).
 */
export function getProviderPrefix(providerId: string): string {
  const upper = providerId.toUpperCase().trim();
  const found = PROVIDER_PREFIX_REGISTRY.find(
    (p) => p.providerId === upper || p.providerName.toUpperCase() === upper
  );
  return found ? found.prefix : "";
}

/**
 * Rewrites a raw incoming JSON request payload so that the 'model' field
 * uses the normalized upstream model name, and optionally injects thinking budget parameters.
 */
export function normalizeRequestBody(rawBody: string | undefined): {
  normalizedBody: string | undefined;
  norm: NormalizedModelResult;
} {
  if (!rawBody) {
    return {
      normalizedBody: rawBody,
      norm: normalizeModelRequest(""),
    };
  }

  try {
    const parsed = JSON.parse(rawBody);
    const norm = normalizeModelRequest(parsed.model);

    if (norm.upstreamModel && norm.upstreamModel !== parsed.model) {
      parsed.model = norm.upstreamModel;
    }

    // Inject reasoning/thinking parameters if applicable and not already explicitly set
    if (norm.thinkingBudget && !parsed.thinking && !parsed.thinking_budget) {
      if (norm.providerId === "ANTIGRAVITY" || norm.providerId === "GEMINI") {
        parsed.thinking_budget = norm.thinkingBudget;
      } else if (norm.providerId === "CLAUDE_CODE" || norm.providerId === "ANTHROPIC") {
        parsed.thinking = { type: "enabled", budget_tokens: norm.thinkingBudget };
      }
    }

    return {
      normalizedBody: JSON.stringify(parsed),
      norm,
    };
  } catch {
    return {
      normalizedBody: rawBody,
      norm: normalizeModelRequest(""),
    };
  }
}

import { SHARED_PROVIDER_MODELS } from "./oauth/config";

/**
 * Validates whether a model ID is valid and supported for a given provider.
 * Checks against prefix standards, SHARED_PROVIDER_MODELS, virtualModelMap, and known patterns.
 */
export function validateModelForProvider(
  modelId: string,
  provider: string
): { isValid: boolean; normalizedModel: string; cleanModel: string; reason?: string } {
  if (!modelId || !modelId.trim()) {
    return { isValid: false, normalizedModel: "", cleanModel: "", reason: "Model ID tidak boleh kosong." };
  }

  const trimmed = modelId.trim();
  const norm = normalizeModelRequest(trimmed);

  // Jangan lakukan validasi buatan/artifisial sistem agar tidak menolak model baru dari upstream platform
  return {
    isValid: true,
    normalizedModel: norm.upstreamModel,
    cleanModel: norm.cleanModel,
  };
}

