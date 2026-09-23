export interface ModelCapabilities {
  vision: boolean;
  pdf: boolean;
  audioInput: boolean;
  videoInput: boolean;
  imageOutput: boolean;
  audioOutput: boolean;
  search: boolean;
  tools: boolean;
  reasoning: boolean;
  thinkingFormat?: string;
  thinkingCanDisable?: boolean;
  contextWindow: number;
  maxOutput: number;
}

export function getModelCapabilities(modelId: string, provider: string): {
  capabilities: ModelCapabilities;
  context_length: number;
  max_completion_tokens: number;
  owned_by: string;
} {
  const lower = modelId.toLowerCase();
  const provLower = provider.toLowerCase();

  let contextWindow = 128000;
  let maxOutput = 8192;
  let reasoning = false;
  let vision = true;
  let ownedBy = provLower;

  if (lower.startsWith("cx/") || lower.includes("gpt-5") || lower.includes("codex") || lower.includes("gpt-6")) {
    contextWindow = 400000;
    maxOutput = 128000;
    reasoning = true;
    ownedBy = "openai_codex";
  } else if (lower.includes("claude")) {
    contextWindow = 200000;
    maxOutput = 64000;
    reasoning = lower.includes("thinking") || lower.includes("3-7");
    ownedBy = "anthropic";
  } else if (lower.startsWith("ag/") || lower.includes("gemini")) {
    contextWindow = 1000000;
    maxOutput = 65536;
    reasoning = lower.includes("thinking") || lower.includes("high") || lower.includes("medium");
    ownedBy = "google";
  } else if (lower.startsWith("deepseek/") || lower.includes("deepseek")) {
    if (lower.includes("v4")) {
      contextWindow = 1000000;
      maxOutput = 32768;
    } else {
      contextWindow = 128000;
      maxOutput = 8192;
    }
    reasoning = lower.includes("r1") || lower.includes("reasoner");
    ownedBy = "deepseek";
  } else if (lower.startsWith("or/") || lower.includes("openrouter")) {
    contextWindow = 128000;
    maxOutput = 16384;
    ownedBy = "openrouter";
  }

  const capabilities: ModelCapabilities = {
    vision,
    pdf: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    search: true,
    tools: true,
    reasoning,
    thinkingFormat: reasoning ? "openai" : undefined,
    thinkingCanDisable: reasoning,
    contextWindow,
    maxOutput,
  };

    return {
    capabilities,
    context_length: contextWindow,
    max_completion_tokens: maxOutput,
    owned_by: ownedBy,
  };
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    const m = tokens / 1000000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(0)}k`;
  }
  return `${tokens}`;
}

export function resolveComboContextWindow(candidateModelId?: string, rawContext?: string, comboId?: string): string {
  // If comboId specifies v4 or candidate specifies v4, prioritize the more specific capability
  const effectiveId = (comboId && comboId.toLowerCase().includes("v4")) ? comboId : (candidateModelId || comboId || "");
  if (!effectiveId) return rawContext || "128k";

  // If candidate has explicit custom contextWindow e.g. "1M" in DB (other than outdated 64k/128k default)
  if (rawContext && rawContext.trim().toLowerCase() !== "128k" && rawContext.trim().toLowerCase() !== "64k") {
    return rawContext;
  }

  // Calculate from model capabilities
  const caps = getModelCapabilities(effectiveId, "");
  if (caps.context_length) {
    return formatContextWindow(caps.context_length);
  }

  return rawContext || "128k";
}
