"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Rocket,
  Bot,
  Code2,
  Box,
  Zap,
  Terminal,
  Key,
  Smile,
  MessageSquare,
  Crosshair,
  Smartphone,
  Boxes,
  Layers,
  Cpu,
  Cloud,
  Globe,
  Network,
} from "lucide-react";

export const PROVIDER_LOGO_MAP: Record<string, string> = {
  // OAuth Providers
  claude: "claude.png",
  claude_code: "claude.png",
  anthropic: "anthropic.png",
  antigravity: "antigravity.png",
  codex: "codex.png",
  openai_codex: "codex.png",
  openai: "openai.png",
  qoder: "qoder.png",
  copilot: "copilot.png",
  github_copilot: "copilot.png",
  cursor: "cursor.png",
  cursor_ide: "cursor.png",
  kilo: "kilo.png",
  kilo_code: "kilo.png",
  kilocode: "kilo.png",
  cline: "cline.png",
  clinepass: "clinepass.png",
  codebuddy: "codebuddy.png",
  codebuddy_cn: "codebuddy-cn.png",
  "codebuddy-cn": "codebuddy-cn.png",
  kimi: "kimi.png",
  "grok-cli": "grok-cli.png",
  grok_cli: "grok-cli.png",
  xai: "xai.png",
  xai_grok: "xai.png",
  mimo: "mimo.png",
  xiaomi_mimo: "mimo.png",

  // API Key Providers
  deepseek: "deepseek.png",
  alibaba: "alibaba.png",
  qwen: "alibaba.png",
  groq: "groq.png",
  mistral: "mistral.png",
  together: "together.png",
  openrouter: "openrouter.png",
  ollama: "ollama.png",
  ollama_cloud: "ollama.png",

  // Other Providers
  opencode: "opencode.png",
  opencode_free: "opencode.png",
  "gemini-cli": "gemini-cli.png",
  gemini_cli: "gemini-cli.png",
  kiro: "kiro.png",
  kiro_ai: "kiro.png",
  nvidia: "nvidia.png",
  nvidia_nim: "nvidia.png",
  "vertex-ai": "vertex-ai.png",
  vertex_ai: "vertex-ai.png",
  vertex: "vertex-ai.png",
  gemini: "gemini.png",
  google: "google.png",
};

export function getProviderDisplayName(providerKey: string): string {
  if (!providerKey) return "";
  const p = providerKey.toUpperCase().trim();
  if (p === "ANTIGRAVITY") return "Antigravity";
  if (p === "OPENAI_CODEX" || p === "CODEX") return "OpenAI Codex";
  if (p === "GEMINI" || p === "GEMINI_CLI" || p === "GEMINI-CLI") return "Gemini-Cli";
  if (p === "GOOGLE") return "Google Gemini";
  if (p === "DEEPSEEK") return "DeepSeek";
  if (p === "OLLAMA" || p === "OLLAMA_CLOUD") return "Ollama Cloud";
  if (p === "OPENROUTER") return "OpenRouter";
  if (p === "OPENAI") return "OpenAI";
  if (p === "ANTHROPIC" || p === "CLAUDE" || p === "CLAUDE_CODE") return "Claude Code";
  if (p === "KIMI") return "Kimi Moonshot";
  if (p === "ALIBABA" || p === "QWEN") return "Alibaba Qwen";
  if (p === "GROQ") return "Groq";
  if (p === "MISTRAL") return "Mistral";
  if (p === "TOGETHER") return "Together AI";
  if (p === "XAI" || p === "GROK" || p === "GROK_CLI") return "xAI Grok";
  if (p === "COMBO") return "Combo (Auto-Rotate)";
  return providerKey.charAt(0).toUpperCase() + providerKey.slice(1).toLowerCase();
}

export function getProviderSlug(provKey: string): string {
  if (!provKey) return "";
  const k = provKey.toLowerCase();
  if (k === "combo") return "combo";
  if (k.includes("openai") && k.includes("codex")) return "codex";
  if (k.includes("openai")) return "openai";
  if (k.includes("anthropic") || k.includes("claude")) return "claude";
  if (k.includes("gemini")) return "gemini-cli";
  if (k.includes("google")) return "google";
  if (k.includes("openrouter")) return "openrouter";
  if (k.includes("deepseek")) return "deepseek";
  if (k.includes("groq")) return "groq";
  if (k.includes("xai") || k.includes("grok")) return "grok-cli";
  if (k.includes("together")) return "together";
  if (k.includes("mistral")) return "mistral";
  if (k.includes("qwen") || k.includes("alibaba") || k.includes("dashscope")) return "alibaba";
  if (k.includes("ollama")) return "ollama";
  if (k.includes("antigravity")) return "antigravity";
  return k;
}

export function getProviderLogoUrl(slugOrId: string): string {
  if (!slugOrId) return "/assets/providers/default.png";
  const raw = slugOrId.toLowerCase().trim();
  if (PROVIDER_LOGO_MAP[raw]) {
    return `/assets/providers/${PROVIDER_LOGO_MAP[raw]}`;
  }
  const norm = raw.replace(/_/g, "-");
  if (PROVIDER_LOGO_MAP[norm]) {
    return `/assets/providers/${PROVIDER_LOGO_MAP[norm]}`;
  }
  return `/assets/providers/${norm}.png`;
}

export function renderProviderIcon(iconName: string, size = 16) {
  switch (iconName) {
    case "Sparkles":
      return <Sparkles size={size} />;
    case "Rocket":
      return <Rocket size={size} />;
    case "Bot":
    case "Github":
      return <Bot size={size} />;
    case "Code2":
      return <Code2 size={size} />;
    case "Box":
      return <Box size={size} />;
    case "Zap":
      return <Zap size={size} />;
    case "Terminal":
      return <Terminal size={size} />;
    case "Key":
      return <Key size={size} />;
    case "Smile":
      return <Smile size={size} />;
    case "MessageSquare":
      return <MessageSquare size={size} />;
    case "Crosshair":
      return <Crosshair size={size} />;
    case "Smartphone":
      return <Smartphone size={size} />;
    case "Boxes":
      return <Boxes size={size} />;
    case "Layers":
      return <Layers size={size} />;
    case "Cpu":
      return <Cpu size={size} />;
    case "Cloud":
      return <Cloud size={size} />;
    case "Globe":
      return <Globe size={size} />;
    default:
      return <Network size={size} />;
  }
}

export function ProviderAvatar({
  slugOrId,
  name = "",
  iconName = "Bot",
  brandColor,
  size = 32,
  imgSize = 22,
  className = "provider-card-avatar",
  style,
}: {
  slugOrId: string;
  name?: string;
  iconName?: string;
  brandColor?: string;
  size?: number;
  imgSize?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [hasError, setHasError] = useState(false);
  const logoUrl = getProviderLogoUrl(slugOrId);

  const isCombo =
    slugOrId?.toLowerCase() === "combo" ||
    name?.toUpperCase() === "COMBO" ||
    iconName === "Layers";

  if (isCombo) {
    return (
      <div
        className={className}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          borderRadius: "6px",
          backgroundColor: "#f5f3ff",
          border: "1px solid #ddd6fe",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#7c3aed",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          ...style,
        }}
        title={name || "Combo (Auto-Rotate)"}
      >
        <Layers size={Math.max(10, Math.round(imgSize * 0.9))} />
      </div>
    );
  }

  const containerBg = brandColor ? `${brandColor}14` : "#f8fafc";
  const containerBorder = brandColor ? `${brandColor}33` : "#e2e8f0";

  return (
    <div
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        borderRadius: "8px",
        backgroundColor: containerBg,
        border: `1px solid ${containerBorder}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
      title={name || slugOrId}
    >
      {!hasError && logoUrl ? (
        <img
          src={logoUrl}
          alt={name || slugOrId}
          width={imgSize}
          height={imgSize}
          style={{
            width: `${imgSize}px`,
            height: `${imgSize}px`,
            maxWidth: `${imgSize}px`,
            maxHeight: `${imgSize}px`,
            objectFit: "contain",
          }}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      ) : (
        <div style={{ color: brandColor || "var(--ink)" }}>
          {renderProviderIcon(iconName, Math.round(imgSize * 0.8))}
        </div>
      )}
    </div>
  );
}

