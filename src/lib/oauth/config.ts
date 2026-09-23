export interface ProviderOAuthConfig {
  name: string;
  provider: string;
  category: "CUSTOM" | "OAUTH" | "FREE_TIER";
  authorizeUrl: string;
  tokenUrl: string;
  defaultClientId: string;
  defaultClientSecret?: string;
  fixedRedirectUri?: string;
  extraAuthorizeParams?: Record<string, string>;
  scopes: string[];
  usePkce: boolean;
  audience?: string;
  color: string;
}

export const OAUTH_PROVIDERS: Record<string, ProviderOAuthConfig> = {
  // --- OAuth Providers (9Router Model) ---
  CLAUDE_CODE: {
    name: "Claude Code",
    provider: "CLAUDE_CODE",
    category: "OAUTH",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://claude.ai/oauth/token",
    defaultClientId: process.env.CLAUDE_OAUTH_CLIENT_ID || "claude-code-client",
    scopes: ["openid", "profile", "email", "offline_access"],
    usePkce: true,
    color: "#d97706",
  },
  ANTIGRAVITY: {
    name: "Antigravity",
    provider: "ANTIGRAVITY",
    category: "OAUTH",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultClientId:
      process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || "",
    defaultClientSecret:
      process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || "",

    fixedRedirectUri: "http://localhost:443/callback",
    extraAuthorizeParams: {
      access_type: "offline",
      prompt: "consent",
    },
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
    ],
    usePkce: false,
    color: "#4285f4",
  },
  OPENAI_CODEX: {
    name: "OpenAI Codex",
    provider: "OPENAI_CODEX",
    category: "OAUTH",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    defaultClientId: process.env.OPENAI_OAUTH_CLIENT_ID || "app_EMoamEEZ73f0CkXaXp7hrann",
    fixedRedirectUri: "http://localhost:1455/auth/callback",
    scopes: ["openid", "profile", "email", "offline_access"],
    extraAuthorizeParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
    usePkce: true,
    color: "#10a37f",
  },
  // Backward compatibility alias for OPENAI
  OPENAI: {
    name: "OpenAI Codex",
    provider: "OPENAI",
    category: "OAUTH",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    defaultClientId: process.env.OPENAI_OAUTH_CLIENT_ID || "app_EMoamEEZ73f0CkXaXp7hrann",
    fixedRedirectUri: "http://localhost:1455/auth/callback",
    scopes: ["openid", "profile", "email", "offline_access"],
    extraAuthorizeParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
    usePkce: true,
    color: "#10a37f",
  },
  CODEX: {
    name: "OpenAI Codex",
    provider: "CODEX",
    category: "OAUTH",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    defaultClientId: process.env.OPENAI_OAUTH_CLIENT_ID || "app_EMoamEEZ73f0CkXaXp7hrann",
    fixedRedirectUri: "http://localhost:1455/auth/callback",
    scopes: ["openid", "profile", "email", "offline_access"],
    extraAuthorizeParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
    usePkce: true,
    color: "#10a37f",
  },
  GITHUB_COPILOT: {
    name: "GitHub Copilot",
    provider: "GITHUB_COPILOT",
    category: "OAUTH",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    defaultClientId: process.env.GITHUB_OAUTH_CLIENT_ID || "github-copilot-client",
    scopes: ["read:user", "user:email", "copilot"],
    usePkce: false,
    color: "#3b82f6",
  },
  CODEBUDDY: {
    name: "CodeBuddy",
    provider: "CODEBUDDY",
    category: "OAUTH",
    authorizeUrl: "https://auth.codebuddy.ca/oauth/authorize",
    tokenUrl: "https://auth.codebuddy.ca/oauth/token",
    defaultClientId: process.env.CODEBUDDY_OAUTH_CLIENT_ID || "codebuddy-client",
    scopes: ["openid", "profile", "offline_access"],
    usePkce: true,
    color: "#3b82f6",
  },
  KIMI: {
    name: "Kimi",
    provider: "KIMI",
    category: "OAUTH",
    authorizeUrl: "https://auth.moonshot.cn/oauth/authorize",
    tokenUrl: "https://auth.moonshot.cn/oauth/token",
    defaultClientId: process.env.KIMI_OAUTH_CLIENT_ID || "moonshot-kimi-client",
    scopes: ["openid", "profile", "offline_access"],
    usePkce: true,
    color: "#0f172a",
  },
};

export interface CatalogProviderItem {
  id: string;
  name: string;
  slug: string;
  category: "CUSTOM" | "OAUTH" | "API_KEY" | "FREE_TIER";
  color: string;
  iconName: string;
  description?: string;
  authType: "API_KEY" | "OAUTH";
  baseUrl?: string;
  defaultPrefix?: string;
  readyByDefault?: boolean;
}

// Full 9Router Catalog Definition with dynamic route slugs
export const FULL_PROVIDER_CATALOG: CatalogProviderItem[] = [
  // --- OAuth Providers ---
  { id: "CLAUDE_CODE", name: "Claude Code", slug: "claude", category: "OAUTH", color: "#d97706", iconName: "Sparkles", authType: "OAUTH" },
  { id: "ANTIGRAVITY", name: "Antigravity", slug: "antigravity", category: "OAUTH", color: "#4285f4", iconName: "Rocket", authType: "OAUTH" },
  { id: "OPENAI_CODEX", name: "OpenAI Codex", slug: "codex", category: "OAUTH", color: "#10a37f", iconName: "Bot", authType: "OAUTH" },
  { id: "GITHUB_COPILOT", name: "GitHub Copilot", slug: "copilot", category: "OAUTH", color: "#3b82f6", iconName: "Github", authType: "OAUTH" },
  { id: "CODEBUDDY", name: "CodeBuddy", slug: "codebuddy", category: "OAUTH", color: "#3b82f6", iconName: "Smile", authType: "OAUTH" },
  { id: "KIMI", name: "Kimi", slug: "kimi", category: "OAUTH", color: "#0f172a", iconName: "MessageSquare", authType: "OAUTH" },

  {
    id: "GEMINI",
    name: "Google Gemini (AI Studio)",
    slug: "gemini",
    category: "API_KEY",
    color: "#3182ce",
    iconName: "Sparkles",
    authType: "API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultPrefix: "gem/",
  },
  {
    id: "DEEPSEEK",
    name: "DeepSeek",
    slug: "deepseek",
    category: "API_KEY",
    color: "#0c62f2",
    iconName: "Bot",
    authType: "API_KEY",
    baseUrl: "https://api.deepseek.com",
    defaultPrefix: "deepseek/",
  },
  {
    id: "ALIBABA",
    name: "Alibaba (Qwen)",
    slug: "alibaba",
    category: "API_KEY",
    color: "#ff6a00",
    iconName: "Cloud",
    authType: "API_KEY",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultPrefix: "qwen/",
  },
  {
    id: "OLLAMA_CLOUD",
    name: "Ollama Cloud",
    slug: "ollama",
    category: "API_KEY",
    color: "#0f172a",
    iconName: "Box",
    authType: "API_KEY",
    baseUrl: "https://ollama.com/v1",
    defaultPrefix: "ollama/",
  },
  {
    id: "OPENROUTER",
    name: "OpenRouter",
    slug: "openrouter",
    category: "API_KEY",
    color: "#6366f1",
    iconName: "Layers",
    authType: "API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultPrefix: "or/",
  },
  {
    id: "GROQ",
    name: "Groq",
    slug: "groq",
    category: "API_KEY",
    color: "#f55036",
    iconName: "Zap",
    authType: "API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultPrefix: "groq/",
  },
  {
    id: "MISTRAL",
    name: "Mistral AI",
    slug: "mistral",
    category: "API_KEY",
    color: "#fa520f",
    iconName: "Sparkles",
    authType: "API_KEY",
    baseUrl: "https://api.mistral.ai/v1",
    defaultPrefix: "mistral/",
  },
  {
    id: "TOGETHER",
    name: "Together AI",
    slug: "together",
    category: "API_KEY",
    color: "#0f6fff",
    iconName: "Cpu",
    authType: "API_KEY",
    baseUrl: "https://api.together.xyz/v1",
    defaultPrefix: "together/",
  },
];

export function getProviderOAuthConfig(provider: string): ProviderOAuthConfig | null {
  const upper = provider.toUpperCase();
  return OAUTH_PROVIDERS[upper] || null;
}

export function findProviderBySlugOrId(slugOrId: string): CatalogProviderItem | null {
  if (!slugOrId) return null;
  const raw = slugOrId.trim().toLowerCase();
  const norm = raw.replace(/[-_]/g, "");

  // 1. Direct slug or ID match
  for (const item of FULL_PROVIDER_CATALOG) {
    if (item.slug.toLowerCase() === raw || item.id.toLowerCase() === raw) {
      return item;
    }
  }

  // 2. Normalized match
  for (const item of FULL_PROVIDER_CATALOG) {
    const sNorm = item.slug.toLowerCase().replace(/[-_]/g, "");
    const idNorm = item.id.toLowerCase().replace(/[-_]/g, "");
    if (norm === sNorm || norm === idNorm) {
      return item;
    }
  }

  // 3. Common aliases
  if (norm === "codex" || norm === "openai" || norm === "openaicodex") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "OPENAI_CODEX") || null;
  }
  if (norm === "claude" || norm === "claudecode" || norm === "anthropic") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "CLAUDE_CODE") || null;
  }
  if (norm === "gemini" || norm === "aistudio" || norm === "googlegemini") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "GEMINI") || null;
  }
  if (norm === "antigravity" || norm === "google") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "ANTIGRAVITY") || null;
  }
  if (norm === "deepseek") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "DEEPSEEK") || null;
  }
  if (norm === "alibaba" || norm === "qwen" || norm === "dashscope") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "ALIBABA") || null;
  }
  if (norm === "ollama" || norm === "ollamacloud") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "OLLAMA_CLOUD") || null;
  }
  if (norm === "groq") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "GROQ") || null;
  }
  if (norm === "mistral" || norm === "codestral") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "MISTRAL") || null;
  }
  if (norm === "together" || norm === "togetherai") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "TOGETHER") || null;
  }
  if (norm === "openrouter") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "OPENROUTER") || null;
  }
  if (norm === "copilot" || norm === "githubcopilot" || norm === "github") {
    return FULL_PROVIDER_CATALOG.find((p) => p.id === "GITHUB_COPILOT") || null;
  }

  return null;
}

// Shared Models Map across 9Router Providers with standardized prefixes
export const SHARED_PROVIDER_MODELS: Record<string, { id: string; name: string }[]> = {
  OPENAI_CODEX: [
    { id: "cx/gpt-5.5", name: "GPT 5.5" },
    { id: "cx/gpt-5.5-review", name: "GPT 5.5 Review" },
    { id: "cx/gpt-5.6-luna", name: "GPT 5.6 Luna" },
    { id: "cx/gpt-5.6-luna-review", name: "GPT 5.6 Luna Review" },
    { id: "cx/gpt-5.6-sol", name: "GPT 5.6 Sol" },
    { id: "cx/gpt-5.6-sol-review", name: "GPT 5.6 Sol Review" },
    { id: "cx/gpt-5.6-terra", name: "GPT 5.6 Terra" },
    { id: "cx/gpt-5.6-terra-review", name: "GPT 5.6 Terra Review" },
    { id: "cx/gpt-6-astra", name: "GPT 6.0 Astra" },
    { id: "cx/gpt-4o", name: "GPT-4o Omnimodel" },
    { id: "cx/gpt-4o-mini", name: "GPT-4o Mini Fast" },
    { id: "cx/o3-mini", name: "O3 Reasoning Mini" },
    { id: "cx/o1", name: "O1 Reasoning Full" },
    { id: "cx/o1-mini", name: "O1 Mini Fast Reasoning" },
    { id: "cx/chatgpt-4o-latest", name: "ChatGPT 4o Latest Dynamic" },
    { id: "cx/gpt-4.5-preview", name: "GPT-4.5 Preview" },
    { id: "cx/gpt-4-turbo", name: "GPT-4 Turbo" },
  ],
  ANTIGRAVITY: [
    { id: "ag/gemini-2.5-flash", name: "Gemini 2.5 Flash Fast" },
    { id: "ag/gemini-2.5-pro", name: "Gemini 2.5 Pro Latest" },
    { id: "ag/gemini-2.0-flash", name: "Gemini 2.0 Flash" },
    { id: "ag/gemini-2.0-flash-thinking", name: "Gemini 2.0 Flash Thinking" },
    { id: "ag/gemini-2.0-pro-exp", name: "Gemini 2.0 Pro Experimental" },
    { id: "ag/claude-3-7-sonnet-thinking", name: "Claude 3.7 Thinking via Antigravity" },
    { id: "ag/gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" },
    { id: "ag/gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)" },
    { id: "ag/gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)" },
    { id: "ag/gemini-3.8-flash", name: "Gemini 3.8 Flash" },
    { id: "ag/gemini-3.7-flash-high", name: "Gemini 3.7 Flash (High)" },
    { id: "ag/gemini-3.7-flash-medium", name: "Gemini 3.7 Flash (Medium)" },
    { id: "ag/gemini-3.7-flash-low", name: "Gemini 3.7 Flash (Low)" },
    { id: "ag/gemini-3.6-flash-high", name: "Gemini 3.6 Flash (High)" },
    { id: "ag/gemini-3.6-flash-medium", name: "Gemini 3.6 Flash (Medium)" },
    { id: "ag/gemini-3.6-flash-low", name: "Gemini 3.6 Flash (Low)" },
    { id: "ag/gemini-3.5-flash-high", name: "Gemini 3.5 Flash (High)" },
    { id: "ag/gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Low)" },
    { id: "ag/claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)" },
    { id: "ag/claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
  ],
  CLAUDE_CODE: [
    { id: "cc/claude-3-7-sonnet", name: "Claude 3.7 Sonnet Hybrid Reasoning" },
    { id: "cc/claude-3-5-sonnet", name: "Claude 3.5 Sonnet v2" },
    { id: "cc/claude-3-5-haiku", name: "Claude 3.5 Haiku Ultra-fast" },
    { id: "cc/claude-3-opus", name: "Claude 3 Opus High-IQ" },
  ],
  GEMINI: [
    { id: "gem/gemini-3.6-flash", name: "Gemini 3.6 Flash" },
    { id: "gem/gemini-flash-latest", name: "Gemini Flash Latest" },
    { id: "gem/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    { id: "gem/gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
    { id: "gem/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gem/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  ],
  GITHUB_COPILOT: [
    { id: "copilot/claude-3.7-sonnet", name: "Claude 3.7 Copilot" },
    { id: "copilot/gpt-4o", name: "GPT-4o Copilot Agent" },
    { id: "copilot/o3-mini", name: "O3 Mini Copilot" },
    { id: "copilot/copilot-chat", name: "GitHub Copilot Chat" },
  ],
  CODEBUDDY: [
    { id: "cb/claude-3-7-sonnet", name: "Claude 3.7 Sonnet (CodeBuddy)" },
    { id: "cb/gpt-4o", name: "GPT-4o (CodeBuddy)" },
    { id: "cb/deepseek-r1", name: "DeepSeek R1 (CodeBuddy)" },
    { id: "cb/deepseek-v3", name: "DeepSeek V3 (CodeBuddy)" },
  ],
  KIMI: [
    { id: "kimi/kimi-k1.5", name: "Kimi K1.5 Multimodal" },
    { id: "kimi/moonshot-v1-128k", name: "Moonshot Kimi 128K" },
    { id: "kimi/moonshot-v1-32k", name: "Moonshot Kimi 32K" },
    { id: "kimi/moonshot-v1-8k", name: "Moonshot Kimi 8K" },
  ],
  OPENROUTER: [
    { id: "or/openrouter/free", name: "Free Models Router (OpenRouter)" },
    { id: "or/google/gemma-4-31b-it:free", name: "Google: Gemma 4 31B (free)" },
    { id: "or/google/gemma-4-26b-a4b-it:free", name: "Google: Gemma 4 26B A4B (free)" },
    { id: "or/poolside/laguna-s-2.1:free", name: "Poolside: Laguna S 2.1 (free)" },
    { id: "or/poolside/laguna-xs-2.1:free", name: "Poolside: Laguna XS 2.1 (free)" },
    { id: "or/cohere/north-mini-code:free", name: "Cohere: North Mini Code (free)" },
    { id: "or/nex-agi/nex-n2.5-pro:free", name: "Nex AGI: Nex-N2.5-Pro (free)" },
    { id: "or/nex-agi/nex-n2.5-mini:free", name: "Nex AGI: Nex-N2.5-Mini (free)" },
    { id: "or/nvidia/nemotron-3-ultra-550b-a55b:free", name: "NVIDIA: Nemotron 3 Ultra 550B (free)" },
    { id: "or/nvidia/nemotron-3.5-lightning:free", name: "NVIDIA: Nemotron 3.5 Lightning (free)" },
    { id: "or/nvidia/nemotron-3-super-120b-a12b:free", name: "NVIDIA: Nemotron 3 Super (free)" },
    { id: "or/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "NVIDIA: Nemotron 3 Nano Omni (free)" },
    { id: "or/thinkingmachines/inkling:free", name: "Thinking Machines: Inkling (free)" },
    { id: "or/thinkingmachines/inkling-small:free", name: "Thinking Machines: Inkling Small (free)" },
    { id: "or/liquid/lfm-2.5-2.6b:free", name: "LiquidAI: LFM2.5-2.6B (free)" },
    { id: "or/z-ai/glm-5.2:free", name: "Z.ai: GLM 5.2 (free)" },
    { id: "or/anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet Hybrid" },
    { id: "or/deepseek/deepseek-r1", name: "DeepSeek R1 Reasoning" },
    { id: "or/deepseek/deepseek-chat", name: "DeepSeek V3 671B" },
    { id: "or/google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
    { id: "or/meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
    { id: "or/qwen/qwen-2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B" },
  ],
  DEEPSEEK: [
    { id: "deepseek/deepseek-flash", name: "DeepSeek Flash Fast" },
    { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
  ],
  ALIBABA: [
    { id: "qwen/qwen-max", name: "Qwen Max Flagship" },
    { id: "qwen/qwen-max-latest", name: "Qwen Max Latest" },
    { id: "qwen/qwen-plus", name: "Qwen Plus Balanced" },
    { id: "qwen/qwen-plus-latest", name: "Qwen Plus Latest" },
    { id: "qwen/qwen-turbo", name: "Qwen Turbo High-speed" },
    { id: "qwen/qwen-2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct" },
    { id: "qwen/qwq-32b-preview", name: "QwQ 32B Reasoning Preview" },
  ],
  OLLAMA_CLOUD: [
    { id: "ollama/nemotron-3-super", name: "Nemotron 3 Super" },
    { id: "ollama/glm-5.3", name: "GLM 5.3" },
    { id: "ollama/glm-5.3-flash", name: "GLM 5.3 Flash" },
    { id: "ollama/glm-5.2", name: "GLM 5.2" },
    { id: "ollama/glm-5.1", name: "GLM 5.1" },
    { id: "ollama/deepseek-v4-pro:0813", name: "DeepSeek V4 Pro (0813)" },
    { id: "ollama/deepseek-v4-flash:0731", name: "DeepSeek V4 Flash (0731)" },
    { id: "ollama/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
    { id: "ollama/qwen3.5:397b", name: "Qwen 3.5 397B" },
    { id: "ollama/kimi-k3", name: "Kimi K3" },
    { id: "ollama/nemotron-3-nano:30b", name: "Nemotron 3 Nano 30B" },
    { id: "ollama/gpt-oss:20b", name: "GPT OSS 20B" },
    { id: "ollama/minimax-m2.7", name: "MiniMax M2.7" },
    { id: "ollama/mistral-large-3:675b", name: "Mistral Large 3 675B" },
    { id: "ollama/gemma4:31b", name: "Gemma 4 31B" },
  ],
  GROQ: [
    { id: "groq/deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill Llama 70B" },
    { id: "groq/llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
    { id: "groq/llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
    { id: "groq/qwen-2.5-coder-32b", name: "Qwen 2.5 Coder 32B" },
    { id: "groq/mixtral-8x7b-32768", name: "Mixtral 8x7B" },
  ],
  MISTRAL: [
    { id: "mistral/mistral-large-latest", name: "Mistral Large Latest" },
    { id: "mistral/codestral-latest", name: "Codestral Latest (Coding)" },
    { id: "mistral/mistral-small-latest", name: "Mistral Small Latest" },
    { id: "mistral/pixtral-large-latest", name: "Pixtral Large Latest (Vision)" },
    { id: "mistral/ministral-8b-latest", name: "Ministral 8B Latest" },
  ],
  TOGETHER: [
    { id: "together/deepseek-ai/DeepSeek-R1", name: "DeepSeek R1 (Together)" },
    { id: "together/deepseek-ai/DeepSeek-V3", name: "DeepSeek V3 (Together)" },
    { id: "together/meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo" },
    { id: "together/Qwen/Qwen2.5-Coder-32B-Instruct", name: "Qwen 2.5 Coder 32B" },
  ],
};
