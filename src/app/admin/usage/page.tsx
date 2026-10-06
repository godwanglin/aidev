"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import CustomDropdown from "@/components/CustomDropdown";
import { ProviderAvatar } from "@/components/providers/ProviderIcons";
import {
  Activity,
  Radio,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Filter,
  Search,
  ArrowUpRight,
  Clock,
  ShieldCheck,
  Code2,
  Copy,
  Check,
  Eye,
  X,
  Layers,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FolderTree,
  Terminal,
  SlidersHorizontal,
  User,
  Network,
  MessageSquare,
  Bot,
  Sparkles,
  Maximize2,
  ChevronUp,
  Wrench,
} from "lucide-react";

function DotsNineIcon({
  size = 15,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="3" cy="3" r="1.5" />
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="13" cy="3" r="1.5" />
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
      <circle cx="3" cy="13" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
      <circle cx="13" cy="13" r="1.5" />
    </svg>
  );
}

function getProviderSlug(providerKey: string): string {
  const p = (providerKey || "").toLowerCase().trim();
  if (p === "gemini" || p === "gemini_cli" || p === "gemini-cli") return "gemini-cli";
  if (p === "openai_codex" || p === "codex") return "codex";
  if (p === "ollama_cloud" || p === "ollama") return "ollama";
  if (p === "antigravity") return "antigravity";
  if (p === "deepseek") return "deepseek";
  if (p === "openrouter") return "openrouter";
  if (p === "google") return "google";
  if (p === "openai") return "openai";
  if (p === "anthropic" || p === "claude" || p === "claude_code") return "claude";
  return p;
}

function getProviderDisplayName(providerKey: string): string {
  const p = (providerKey || "").toUpperCase().trim();
  if (p === "ANTIGRAVITY") return "Antigravity";
  if (p === "OPENAI_CODEX" || p === "CODEX") return "Codex";
  if (p === "GEMINI" || p === "GEMINI_CLI") return "Gemini-Cli";
  if (p === "GOOGLE") return "Google Gemini";
  if (p === "DEEPSEEK") return "Deepseek";
  if (p === "OLLAMA" || p === "OLLAMA_CLOUD") return "Ollama";
  if (p === "OPENROUTER") return "OpenRouter";
  if (p === "OPENAI") return "OpenAI";
  if (p === "ANTHROPIC" || p === "CLAUDE" || p === "CLAUDE_CODE") return "Anthropic";
  if (p === "KIMI") return "Kimi";
  if (p === "CODEBUDDY_INTL" || p === "CODEBUDDY") return "Codebuddy-Intl";
  if (p === "GITHUB_COPILOT" || p === "COPILOT") return "Copilot";
  if (p === "CURSOR" || p === "CURSOR_IDE") return "Cursor";
  return providerKey.charAt(0).toUpperCase() + providerKey.slice(1).toLowerCase();
}

interface UpstreamEvent {
  id: string;
  provider: string;
  model: string;
  clientApiKeyId?: string | null;
  clientUserId?: string | null;
  clientUserEmail?: string | null;
  clientUser?: {
    id?: string | null;
    email: string;
    name?: string | null;
    role?: string;
    tier?: string;
    keyPrefix?: string | null;
    keyName?: string | null;
  } | null;
  reasoningEffort?: string | null;
  rawHeaders?: any;
  rawBody?: any;
  rawResponse?: any;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensSavedRtk?: number;
  latencyMs: number;
  statusCode: number;
  isFailover: boolean;
  failoverReason?: string | null;
  createdAt: string;
  connection?: {
    id?: string;
    name: string;
    accountEmail?: string | null;
  } | null;
}

interface ConnectionItem {
  id: string;
  provider: string;
  name: string;
  accountEmail?: string | null;
  isActive?: boolean;
}

interface UsageStats {
  totalRequests24h: number;
  totalPromptTokens24h: number;
  totalCompletionTokens24h: number;
  totalTokens24h: number;
  avgLatencyMs: number;
  successRate: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "#10a37f",
  OPENAI_CODEX: "#10a37f",
  CODEX: "#10a37f",
  ANTHROPIC: "#d97706",
  CLAUDE: "#d97706",
  GOOGLE: "#4285f4",
  GEMINI: "#4285f4",
  GEMINI_CLI: "#4285f4",
  ANTIGRAVITY: "#8b5cf6",
  DEEPSEEK: "#0284c7",
  OLLAMA: "#10b981",
  OLLAMA_CLOUD: "#10b981",
  OPENROUTER: "#8b5cf6",
  OPENCODE: "#06b6d4",
  CUSTOM: "#64748b",
  DEFAULT: "#3b82f6",
};

interface ParsedChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string;
  toolCalls?: Array<{ id?: string; name: string; args?: string }>;
  isFinalResponse?: boolean;
}

function extractChatMessages(rawBody: any, rawResponse?: any): ParsedChatMessage[] {
  const messages: ParsedChatMessage[] = [];
  let bodyObj: any = null;
  if (typeof rawBody === "string") {
    try {
      bodyObj = JSON.parse(rawBody);
    } catch {
      bodyObj = null;
    }
  } else {
    bodyObj = rawBody;
  }

  if (bodyObj) {
    // Anthropic top-level system
    if (bodyObj.system) {
      const s = typeof bodyObj.system === "string" ? bodyObj.system : JSON.stringify(bodyObj.system, null, 2);
      messages.push({ id: "sys-top", role: "system", content: s });
    }

    // Standard OpenAI / Anthropic messages
    if (Array.isArray(bodyObj.messages)) {
      for (let i = 0; i < bodyObj.messages.length; i++) {
        const m = bodyObj.messages[i];
        let content = "";
        if (typeof m.content === "string") {
          content = m.content;
        } else if (Array.isArray(m.content)) {
          content = m.content
            .map((p: any) => {
              if (typeof p === "string") return p;
              if (p.text) return p.text;
              if (p.type === "text") return p.text || "";
              if (p.type === "image_url") return `[Gambar/Image: ${p.image_url?.url ? "URL" : "Attached"}]`;
              return JSON.stringify(p);
            })
            .join("\n");
        } else if (m.content) {
          content = JSON.stringify(m.content, null, 2);
        }

        const reasoning = m.reasoning_content || m.reasoning || m.thought || undefined;
        const toolCalls = Array.isArray(m.tool_calls)
          ? m.tool_calls.map((tc: any) => ({
              id: tc.id,
              name: tc.function?.name || tc.name || "function",
              args: typeof tc.function?.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {}),
            }))
          : undefined;

        messages.push({
          id: `msg-${i}`,
          role: ((m.role || "user").toLowerCase() as any),
          content,
          reasoning,
          toolCalls,
        });
      }
    } else if (Array.isArray(bodyObj.input)) {
      // Codex Responses input format
      for (let i = 0; i < bodyObj.input.length; i++) {
        const item = bodyObj.input[i];
        const role = (item.role || (item.type === "message" ? "user" : item.type) || "user").toLowerCase();
        let text = "";
        if (typeof item.content === "string") {
          text = item.content;
        } else if (Array.isArray(item.content)) {
          text = item.content.map((p: any) => p.text || JSON.stringify(p)).join("\n");
        } else if (item.text) {
          text = item.text;
        } else {
          text = JSON.stringify(item, null, 2);
        }
        messages.push({
          id: `input-${i}`,
          role: role === "model" ? "assistant" : (role as any),
          content: text,
        });
      }
    } else if (Array.isArray(bodyObj.contents)) {
      // Gemini format
      if (bodyObj.systemInstruction?.parts) {
        const sys = bodyObj.systemInstruction.parts.map((p: any) => p.text || "").join("\n");
        messages.push({ id: "gem-sys", role: "system", content: sys });
      }
      for (let i = 0; i < bodyObj.contents.length; i++) {
        const c = bodyObj.contents[i];
        const text = (c.parts || []).map((p: any) => p.text || (p.functionCall ? `[Tool Call: ${p.functionCall.name}]` : "")).join("\n");
        messages.push({
          id: `gem-${i}`,
          role: c.role === "model" ? "assistant" : "user",
          content: text,
        });
      }
    } else if (bodyObj.prompt) {
      // Legacy prompt
      const p = typeof bodyObj.prompt === "string" ? bodyObj.prompt : JSON.stringify(bodyObj.prompt, null, 2);
      messages.push({ id: "prompt-0", role: "user", content: p });
    }
  }

  // Parse rawResponse for the Final Assistant Output
  if (rawResponse) {
    let accText = "";
    let accReasoning = "";
    const lines = String(rawResponse).split("\n");
    for (const l of lines) {
      const t = l.trim();
      if (!t.startsWith("data: ") || t === "data: [DONE]") continue;
      try {
        const d = JSON.parse(t.slice(6));
        const delta = d.choices?.[0]?.delta;
        if (delta) {
          if (delta.content) accText += delta.content;
          if (delta.reasoning_content) accReasoning += delta.reasoning_content;
        }
        const parts = d.response?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p.thought && p.text) accReasoning += p.text;
            else if (p.text) accText += p.text;
          }
        }
        if (d.type === "response.output_item.added" && d.item?.content) {
          for (const c of d.item.content) {
            if (c.text) accText += c.text;
          }
        }
      } catch {}
    }

    if (!accText && !accReasoning) {
      try {
        const respJson = typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
        const msg = respJson.choices?.[0]?.message;
        if (msg) {
          accText = msg.content || "";
          accReasoning = msg.reasoning_content || "";
        } else if (respJson.candidates?.[0]?.content?.parts) {
          for (const p of respJson.candidates[0].content.parts) {
            if (p.thought && p.text) accReasoning += p.text;
            else if (p.text) accText += p.text;
          }
        }
      } catch {}
    }

    if (accText || accReasoning) {
      messages.push({
        id: "response-final",
        role: "assistant",
        content: accText || "(Hanya pemikiran / tool call tanpa teks balasan langsung)",
        reasoning: accReasoning || undefined,
        isFinalResponse: true,
      });
    }
  }

  return messages;
}

function ChatConversationView({
  rawBody,
  rawResponse,
  loading = false,
  maxHeight = "500px",
  onOpenFullModal,
  onSwitchToRaw,
}: {
  rawBody: any;
  rawResponse?: any;
  loading?: boolean;
  maxHeight?: string;
  onOpenFullModal?: () => void;
  onSwitchToRaw?: () => void;
}) {
  const [roleFilter, setRoleFilter] = useState<"all" | "dialog" | "system" | "tool">("all");
  const [search, setSearch] = useState("");
  const [expandedSystem, setExpandedSystem] = useState<Record<string, boolean>>({});
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const messages = useMemo(() => extractChatMessages(rawBody, rawResponse), [rawBody, rawResponse]);

  const dialogCount = messages.filter((m) => m.role === "user" || m.role === "assistant").length;
  const systemCount = messages.filter((m) => m.role === "system").length;
  const toolCount = messages.filter((m) => m.role === "tool").length;

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      if (roleFilter === "dialog" && m.role !== "user" && m.role !== "assistant") return false;
      if (roleFilter === "system" && m.role !== "system") return false;
      if (roleFilter === "tool" && m.role !== "tool") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const inContent = m.content.toLowerCase().includes(q);
        const inReasoning = m.reasoning?.toLowerCase().includes(q);
        return inContent || inReasoning;
      }
      return true;
    });
  }, [messages, roleFilter, search]);

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    const transcript = messages
      .map((m, idx) => {
        let header = `--- [${m.role.toUpperCase()}] (#${idx + 1}) ---`;
        if (m.isFinalResponse) header += " (Final Output)";
        let text = `${header}\n${m.content}`;
        if (m.reasoning) text = `💭 REASONING:\n${m.reasoning}\n\n` + text;
        return text;
      })
      .join("\n\n");
    navigator.clipboard.writeText(transcript);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="flex flex-col w-full" style={{ gap: "10px" }}>
      {/* Top Filter and Actions Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap p-2 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {/* Role Filters */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setRoleFilter("all")}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              roleFilter === "all" ? "bg-blue text-white shadow-sm" : "text-muted hover:text-ink hover:bg-slate-800/30"
            }`}
            style={{
              background: roleFilter === "all" ? "#3b82f6" : "transparent",
              color: roleFilter === "all" ? "#fff" : "var(--muted)",
            }}
          >
            Semua ({messages.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter("dialog")}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              roleFilter === "dialog" ? "bg-blue text-white shadow-sm" : "text-muted hover:text-ink hover:bg-slate-800/30"
            }`}
            style={{
              background: roleFilter === "dialog" ? "#3b82f6" : "transparent",
              color: roleFilter === "dialog" ? "#fff" : "var(--muted)",
            }}
          >
            User & AI ({dialogCount})
          </button>
          {systemCount > 0 && (
            <button
              type="button"
              onClick={() => setRoleFilter("system")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                roleFilter === "system" ? "bg-blue text-white shadow-sm" : "text-muted hover:text-ink hover:bg-slate-800/30"
              }`}
              style={{
                background: roleFilter === "system" ? "#3b82f6" : "transparent",
                color: roleFilter === "system" ? "#fff" : "var(--muted)",
              }}
            >
              System ({systemCount})
            </button>
          )}
          {toolCount > 0 && (
            <button
              type="button"
              onClick={() => setRoleFilter("tool")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                roleFilter === "tool" ? "bg-blue text-white shadow-sm" : "text-muted hover:text-ink hover:bg-slate-800/30"
              }`}
              style={{
                background: roleFilter === "tool" ? "#3b82f6" : "transparent",
                color: roleFilter === "tool" ? "#fff" : "var(--muted)",
              }}
            >
              Tool ({toolCount})
            </button>
          )}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2.5 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Cari kata kunci..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-2.5 py-1 rounded-md text-xs border bg-transparent"
              style={{
                borderColor: "var(--border)",
                color: "var(--ink)",
                width: "150px",
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleCopyAll}
            className="px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition"
            style={{
              background: "var(--surface-hover)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
            }}
            title="Salin seluruh percakapan"
          >
            {copiedAll ? <Check size={12} className="text-green" /> : <Copy size={12} />}
            <span>{copiedAll ? "Tersalin!" : "Salin Transkrip"}</span>
          </button>

          {onOpenFullModal && (
            <button
              type="button"
              onClick={onOpenFullModal}
              className="px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition"
              style={{
                background: "rgba(59, 130, 246, 0.12)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                color: "#3b82f6",
              }}
              title="Buka Chat di Popup Penuh"
            >
              <Maximize2 size={12} />
              <span>Popup Penuh</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream Container */}
      <div
        className="flex flex-col gap-3 p-3 rounded-lg overflow-y-auto"
        style={{
          maxHeight,
          background: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <RefreshCw size={24} className="animate-spin text-blue mb-2" />
            <span className="text-xs text-muted">Sedang memuat data percakapan lengkap dari database...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted">
            <MessageSquare size={28} className="opacity-40 mb-2" />
            <p className="text-xs font-medium">Tidak ada pesan yang cocok dengan filter atau request ini bukan chat completion biasa.</p>
            {onSwitchToRaw && (
              <button
                type="button"
                onClick={onSwitchToRaw}
                className="mt-3 px-3 py-1.5 rounded-md text-xs font-semibold text-blue bg-blue/10 border border-blue/20 hover:bg-blue/20 transition"
              >
                Lihat Raw JSON Request
              </button>
            )}
          </div>
        ) : (
          filtered.map((msg, idx) => {
            const isUser = msg.role === "user";
            const isSystem = msg.role === "system";
            const isTool = msg.role === "tool";

            // SYSTEM PROMPT BUBBLE
            if (isSystem) {
              const isLong = msg.content.length > 300;
              const isExpanded = expandedSystem[msg.id] ?? false;
              const displayContent = isLong && !isExpanded ? msg.content.slice(0, 300) + "..." : msg.content;

              return (
                <div
                  key={msg.id || idx}
                  className="rounded-lg p-3 text-xs transition border"
                  style={{
                    backgroundColor: "rgba(245, 158, 11, 0.04)",
                    borderColor: "rgba(245, 158, 11, 0.25)",
                    color: "var(--ink)",
                  }}
                >
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-amber-500/20">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-500 uppercase tracking-wider">
                      <ShieldCheck size={13} />
                      <span>System Instructions (#{idx + 1})</span>
                      <span className="text-[10px] text-muted normal-case font-normal">({msg.content.length.toLocaleString()} chars)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => setExpandedSystem((prev) => ({ ...prev, [msg.id]: !isExpanded }))}
                          className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 transition flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          <span>{isExpanded ? "Ringkas" : "Lihat Semua"}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="p-1 rounded text-muted hover:text-ink hover:bg-slate-800/30 transition"
                        title="Salin instruksi sistem"
                      >
                        {copiedId === msg.id ? <Check size={11} className="text-green" /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>
                  <pre className="font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words opacity-90 max-h-[350px] overflow-y-auto">
                    {displayContent}
                  </pre>
                </div>
              );
            }

            // USER BUBBLE (Right aligned)
            if (isUser) {
              return (
                <div key={msg.id || idx} className="flex justify-end w-full">
                  <div
                    className="rounded-2xl rounded-tr-sm p-3.5 max-w-[85%] text-xs shadow-sm transition border"
                    style={{
                      background: "linear-gradient(135deg, rgba(30, 58, 138, 0.95), rgba(37, 99, 235, 0.9))",
                      borderColor: "rgba(59, 130, 246, 0.5)",
                      color: "#ffffff",
                    }}
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-blue-400/25">
                      <div className="flex items-center gap-1.5 font-bold text-[11px] text-blue-200">
                        <User size={12} />
                        <span>User</span>
                        <span className="text-[10px] opacity-75 font-mono">#{idx + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="p-1 rounded text-blue-200 hover:text-white hover:bg-white/10 transition"
                        title="Salin pesan user"
                      >
                        {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed break-words">
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            }

            // TOOL RESPONSE BUBBLE
            if (isTool) {
              const isLong = msg.content.length > 300;
              const isExpanded = expandedTools[msg.id] ?? false;
              const displayContent = isLong && !isExpanded ? msg.content.slice(0, 300) + "..." : msg.content;

              return (
                <div key={msg.id || idx} className="flex justify-start w-full">
                  <div
                    className="rounded-xl p-3 max-w-[88%] text-xs shadow-sm transition border"
                    style={{
                      backgroundColor: "rgba(100, 116, 139, 0.08)",
                      borderColor: "rgba(100, 116, 139, 0.25)",
                      color: "var(--ink)",
                    }}
                  >
                    <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-700/30">
                      <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-400">
                        <Wrench size={12} className="text-purple-400" />
                        <span>Tool Result</span>
                        <span className="text-[10px] text-muted font-mono">#{idx + 1}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isLong && (
                          <button
                            type="button"
                            onClick={() => setExpandedTools((prev) => ({ ...prev, [msg.id]: !isExpanded }))}
                            className="px-1.5 py-0.5 rounded text-[10px] text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
                          >
                            {isExpanded ? "Tutup" : "Lihat Semua"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.content)}
                          className="p-1 rounded text-muted hover:text-ink"
                          title="Salin hasil tool"
                        >
                          {copiedId === msg.id ? <Check size={11} className="text-green" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                    <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words opacity-85">
                      {displayContent}
                    </pre>
                  </div>
                </div>
              );
            }

            // ASSISTANT BUBBLE (Left aligned)
            const hasReasoning = !!msg.reasoning;
            const isReasoningExpanded = expandedReasoning[msg.id] ?? false;

            return (
              <div key={msg.id || idx} className="flex justify-start w-full">
                <div
                  className="rounded-2xl rounded-tl-sm p-3.5 max-w-[88%] text-xs shadow-sm transition border"
                  style={{
                    backgroundColor: msg.isFinalResponse ? "rgba(16, 185, 129, 0.04)" : "var(--surface)",
                    borderColor: msg.isFinalResponse ? "rgba(16, 185, 129, 0.3)" : "var(--border)",
                    color: "var(--ink)",
                  }}
                >
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-1.5 font-bold text-[11px]">
                      <Bot size={13} style={{ color: msg.isFinalResponse ? "#10b981" : "#a855f7" }} />
                      <span style={{ color: msg.isFinalResponse ? "#10b981" : "var(--ink)" }}>Assistant</span>
                      <span className="text-[10px] text-muted font-mono">#{idx + 1}</span>
                      {msg.isFinalResponse && (
                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 flex items-center gap-1">
                          <Sparkles size={9} />
                          <span>Final Upstream Output</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="p-1 rounded text-muted hover:text-ink hover:bg-slate-800/30 transition"
                      title="Salin jawaban assistant"
                    >
                      {copiedId === msg.id ? <Check size={11} className="text-green" /> : <Copy size={11} />}
                    </button>
                  </div>

                  {/* Collapsible Reasoning Block if present */}
                  {hasReasoning && (
                    <div
                      className="mb-2.5 rounded-lg p-2.5 transition border"
                      style={{
                        backgroundColor: "rgba(147, 51, 234, 0.06)",
                        borderColor: "rgba(147, 51, 234, 0.2)",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setExpandedReasoning((prev) => ({ ...prev, [msg.id]: !isReasoningExpanded }))}
                          className="flex items-center gap-1.5 text-[11px] font-bold text-purple-400 hover:text-purple-300 transition"
                        >
                          <Zap size={11} />
                          <span>Thought Process / Reasoning</span>
                          <span className="text-[10px] opacity-75 font-normal">({msg.reasoning!.length.toLocaleString()} chars)</span>
                          {isReasoningExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(`reasoning-${msg.id}`, msg.reasoning!)}
                          className="p-0.5 text-muted hover:text-ink"
                          title="Salin reasoning"
                        >
                          {copiedId === `reasoning-${msg.id}` ? <Check size={10} className="text-green" /> : <Copy size={10} />}
                        </button>
                      </div>
                      {isReasoningExpanded && (
                        <div className="mt-2 pt-2 border-t border-purple-500/20 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-purple-200/90 max-h-[300px] overflow-y-auto">
                          {msg.reasoning}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tool Calls if present */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {msg.toolCalls.map((tc, tIdx) => (
                        <div
                          key={tc.id || tIdx}
                          className="p-2 rounded text-[11px] font-mono border"
                          style={{
                            background: "rgba(2, 132, 199, 0.06)",
                            borderColor: "rgba(2, 132, 199, 0.2)",
                            color: "#38bdf8",
                          }}
                        >
                          <div className="flex items-center gap-1 font-bold">
                            <Wrench size={10} />
                            <span>Tool Call: {tc.name}</span>
                          </div>
                          {tc.args && (
                            <pre className="mt-1 text-[10.5px] opacity-80 whitespace-pre-wrap break-words">
                              {tc.args}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Assistant Text Content */}
                  <div className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed break-words">
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AdminUsagePage() {
  const [events, setEvents] = useState<UpstreamEvent[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [stats, setStats] = useState<UsageStats>({
    totalRequests24h: 0,
    totalPromptTokens24h: 0,
    totalCompletionTokens24h: 0,
    totalTokens24h: 0,
    avgLatencyMs: 0,
    successRate: 100,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  // RTK Token Saver State
  const [rtkActive, setRtkActive] = useState(true);
  const [rtkSaving, setRtkSaving] = useState(false);
  const [totalTokensSaved, setTotalTokensSaved] = useState(0);

  // Filters
  const [providerFilter, setProviderFilter] = useState("ALL");
  const [accountFilter, setAccountFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchModel, setSearchModel] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(searchModel);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchModel);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchModel]);

  const hasActiveFilters =
    providerFilter !== "ALL" ||
    accountFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    debouncedSearch.trim() !== "";

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;
  const hasActiveFiltersRef = useRef(hasActiveFilters);
  hasActiveFiltersRef.current = hasActiveFilters;

  // Dropdown popover states
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Developer Hub Empty State Tabs
  const [codeTab, setCodeTab] = useState<"curl" | "node" | "python">("curl");
  const [copiedCode, setCopiedCode] = useState(false);

  // Inspector Modal
  const [inspectEvent, setInspectEvent] = useState<UpstreamEvent | null>(null);
  const [loadingInspectDetail, setLoadingInspectDetail] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [activeRawTab, setActiveRawTab] = useState<"chat" | "body" | "headers" | "response" | "telemetry">("chat");
  const [copiedTab, setCopiedTab] = useState(false);

  // Dedicated Chat Bubble Popup Modal
  const [chatModalEvent, setChatModalEvent] = useState<UpstreamEvent | null>(null);
  const [loadingChatDetail, setLoadingChatDetail] = useState(false);

  async function openInspect(ev: UpstreamEvent) {
    setInspectEvent(ev);
    const isTruncated = typeof ev.rawBody === "string" && ev.rawBody.includes("[TRUNCATED_IN_MEMORY_CACHE]");
    if (!ev.rawBody || isTruncated || (!ev.rawResponse && !ev.rawBody)) {
      setLoadingInspectDetail(true);
      try {
        const res = await fetch(`/api/admin/usage/history?logId=${ev.id}`);
        const json = await res.json();
        if (json.success && json.data?.log) {
          setInspectEvent((prev) => (prev?.id === ev.id ? { ...prev, ...json.data.log } : prev));
        }
      } catch {}
      setLoadingInspectDetail(false);
    }
  }

  async function openChatModal(ev: UpstreamEvent) {
    setChatModalEvent(ev);
    const isTruncated = typeof ev.rawBody === "string" && ev.rawBody.includes("[TRUNCATED_IN_MEMORY_CACHE]");
    if (!ev.rawBody || isTruncated || (!ev.rawResponse && !ev.rawBody)) {
      setLoadingChatDetail(true);
      try {
        const res = await fetch(`/api/admin/usage/history?logId=${ev.id}`);
        const json = await res.json();
        if (json.success && json.data?.log) {
          setChatModalEvent((prev) => (prev?.id === ev.id ? { ...prev, ...json.data.log } : prev));
          setInspectEvent((prev) => (prev?.id === ev.id ? { ...prev, ...json.data.log } : prev));
        }
      } catch {}
      setLoadingChatDetail(false);
    }
  }

  // Clear Database Telemetry Modal State
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearScope, setClearScope] = useState<"all" | "older_than_24h" | "older_than_7d">("all");
  const [clearing, setClearing] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const eventSourceRef = useRef<EventSource | null>(null);

  // Click outside to close dropdown popovers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        providerDropdownRef.current &&
        !providerDropdownRef.current.contains(event.target as Node)
      ) {
        setProviderDropdownOpen(false);
      }
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(event.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 1. Fetch historical logs & stats with server-side pagination & filtering
  async function fetchHistory(
    page = currentPage,
    size = pageSize,
    provider = providerFilter,
    account = accountFilter,
    status = statusFilter,
    model = debouncedSearch
  ) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(size),
      });
      if (provider !== "ALL") params.set("provider", provider);
      if (account !== "ALL") params.set("connectionId", account);
      if (status !== "ALL") params.set("status", status);
      if (model.trim()) params.set("model", model.trim());

      const res = await fetch(`/api/admin/usage/history?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setEvents(json.data.logs || []);
        setTotalCount(json.data.totalCount ?? 0);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
      }
    } catch {}
    setLoading(false);
  }

  // 2. Clear Telemetry Logs from Database
  async function handleClearLogs() {
    setClearing(true);
    try {
      const res = await fetch(`/api/admin/usage/history?scope=${clearScope}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setClearModalOpen(false);
        setActionMessage(json.message || "Telemetry logs cleared successfully.");
        setTimeout(() => setActionMessage(""), 5000);
        await fetchHistory();
      }
    } catch {}
    setClearing(false);
  }

  // 3. Fetch connected provider accounts
  async function fetchProviders() {
    try {
      const res = await fetch("/api/admin/providers");
      const json = await res.json();
      if (json.connections && Array.isArray(json.connections)) {
        setConnections(json.connections);
      }
    } catch {}
  }

  async function fetchRtkStatus() {
    try {
      const res = await fetch("/api/admin/rtk");
      const json = await res.json();
      if (json.success) {
        setRtkActive(json.active);
        setTotalTokensSaved(json.totalTokensSaved || 0);
      }
    } catch {}
  }

  async function toggleRtk() {
    setRtkSaving(true);
    const newActive = !rtkActive;
    try {
      const res = await fetch("/api/admin/rtk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: newActive }),
      });
      const json = await res.json();
      if (json.success) {
        setRtkActive(Boolean(json.active));
      }
    } catch {}
    setRtkSaving(false);
  }

  useEffect(() => {
    fetchProviders();
    fetchRtkStatus();
  }, []);

  // Reset to page 1 whenever filters change
  const prevFilterState = useRef({ providerFilter, accountFilter, statusFilter, debouncedSearch });
  useEffect(() => {
    const prev = prevFilterState.current;
    if (
      prev.providerFilter !== providerFilter ||
      prev.accountFilter !== accountFilter ||
      prev.statusFilter !== statusFilter ||
      prev.debouncedSearch !== debouncedSearch
    ) {
      prevFilterState.current = { providerFilter, accountFilter, statusFilter, debouncedSearch };
      setCurrentPage(1);
    }
  }, [providerFilter, accountFilter, statusFilter, debouncedSearch]);

  // Fetch when page, size, or filters change
  useEffect(() => {
    fetchHistory(currentPage, pageSize, providerFilter, accountFilter, statusFilter, debouncedSearch);
  }, [currentPage, pageSize, providerFilter, accountFilter, statusFilter, debouncedSearch]);

  // Only display providers that actually have connected accounts!
  const connectedProviders = useMemo(() => {
    const providerMap = new Map<string, { key: string; name: string; slug: string; count: number }>();

    for (const conn of connections) {
      if (!conn.provider) continue;
      const key = conn.provider.toUpperCase();
      if (!providerMap.has(key)) {
        providerMap.set(key, {
          key,
          name: getProviderDisplayName(key),
          slug: getProviderSlug(key),
          count: 0,
        });
      }
      providerMap.get(key)!.count++;
    }

    // Also include providers from recent logs if they had connection or were logged
    for (const ev of events) {
      if (!ev.provider || ev.provider === "DEFAULT") continue;
      const key = ev.provider.toUpperCase();
      if (!providerMap.has(key)) {
        providerMap.set(key, {
          key,
          name: getProviderDisplayName(key),
          slug: getProviderSlug(key),
          count: 1,
        });
      }
    }

    return Array.from(providerMap.values());
  }, [connections, events]);

  const filteredAccounts = useMemo(() => {
    if (providerFilter === "ALL") {
      return connections;
    }
    const normFilter = providerFilter.toUpperCase();
    return connections.filter((c) => {
      const p = (c.provider || "").toUpperCase();
      if (p === normFilter) return true;
      if ((normFilter === "OPENAI_CODEX" || normFilter === "CODEX") && (p === "OPENAI_CODEX" || p === "CODEX")) return true;
      if ((normFilter === "GEMINI" || normFilter === "GEMINI_CLI" || normFilter === "GOOGLE") && (p === "GEMINI" || p === "GEMINI_CLI" || p === "GOOGLE")) return true;
      if ((normFilter === "OLLAMA" || normFilter === "OLLAMA_CLOUD") && (p === "OLLAMA" || p === "OLLAMA_CLOUD")) return true;
      if ((normFilter === "ANTHROPIC" || normFilter === "CLAUDE") && (p === "ANTHROPIC" || p === "CLAUDE")) return true;
      return false;
    });
  }, [connections, providerFilter]);

  const selectedProvider = useMemo(() => {
    if (providerFilter === "ALL") return null;
    return connectedProviders.find((p) => p.key === providerFilter) || {
      key: providerFilter,
      name: getProviderDisplayName(providerFilter),
      slug: getProviderSlug(providerFilter),
    };
  }, [providerFilter, connectedProviders]);

  const selectedAccount = useMemo(() => {
    if (accountFilter === "ALL") return null;
    return connections.find((c) => c.id === accountFilter) || null;
  }, [accountFilter, connections]);

  // 2. Connect to SSE Stream
  useEffect(() => {
    if (isPaused) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const es = new EventSource("/api/admin/usage/stream");
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      setIsConnected(true);
    });

    es.addEventListener("request", (event: MessageEvent) => {
      try {
        const newLog: UpstreamEvent = JSON.parse(event.data);
        setStats((prev) => ({
          ...prev,
          totalRequests24h: prev.totalRequests24h + 1,
          totalPromptTokens24h: prev.totalPromptTokens24h + newLog.promptTokens,
          totalCompletionTokens24h: prev.totalCompletionTokens24h + newLog.completionTokens,
          totalTokens24h: prev.totalTokens24h + newLog.totalTokens,
        }));
        setTotalCount((prev) => prev + 1);

        // Prepend new live event only if currently on page 1 without active search/filters
        if (currentPageRef.current === 1 && !hasActiveFiltersRef.current) {
          setEvents((prev) => {
            if (prev.some((e) => e.id === newLog.id)) return prev;
            return [newLog, ...prev.slice(0, pageSizeRef.current - 1)];
          });
        }
      } catch {}
    });

    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [isPaused]);

  // Events are already filtered and paginated server-side!
  const filteredEvents = events;

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEvents = events;

  // Latency styling helper
  const getLatencyClass = (ms: number) => {
    if (ms <= 600) return "latency-fast";
    if (ms <= 1500) return "latency-medium";
    if (ms <= 3000) return "latency-slow";
    return "latency-critical";
  };

  // Code snippets for developer empty state
  const codeSnippets = {
    curl: `curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer dev_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello AI Gateway!" }
    ]
  }'`,
    node: `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "dev_YOUR_KEY",
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello AI Gateway!" }],
  });
  console.log(completion.choices[0].message.content);
}
main();`,
    python: `from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="dev_YOUR_KEY"
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello AI Gateway!"}]
)
print(response.choices[0].message.content)`,
  };

  function copyCode() {
    navigator.clipboard.writeText(codeSnippets[codeTab]);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function copyEventJson() {
    if (!inspectEvent) return;
    navigator.clipboard.writeText(JSON.stringify(inspectEvent, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }

  return (
    <DashboardShell>
      <div className="content">
        {/* Page Head with Live Stream Capsule and Actions */}
        <PageHead
          title="Realtime Upstream Monitor"
          subtitle="Live Server-Sent Events (SSE) telemetry for upstream AI requests, multi-provider routing, latency, and tokens."
        >
          <div className="monitor-topbar">
            {/* Live SSE Status Capsule */}
            <div
              className={`stream-status-pill ${
                isConnected ? "connected" : isPaused ? "paused" : "reconnecting"
              }`}
            >
              <div className="beacon-wrap">
                <div
                  className={`beacon-ping ${
                    isConnected ? "green" : isPaused ? "amber" : "red"
                  }`}
                />
                <div
                  className={`beacon-core ${
                    isConnected ? "green" : isPaused ? "amber" : "red"
                  }`}
                />
              </div>
              <span>
                {isConnected ? "SSE LIVE STREAM" : isPaused ? "STREAM PAUSED" : "RECONNECTING..."}
              </span>
              <span className="text-[10.5px] opacity-75 font-normal">
                ({events.length}/100 buffer)
              </span>
            </div>

            {/* Pause / Resume Button */}
            <button
              className="control btn-inline text-xs"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Resume Stream" : "Pause Stream"}
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>

            {/* Clear Database Logs Button */}
            <button
              type="button"
              className="control btn-inline text-xs btn-danger-subtle"
              onClick={() => setClearModalOpen(true)}
              title="Clear Telemetry Logs from Database"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Trash2 size={12} strokeWidth={1.75} />
              <span>Clear DB Logs</span>
            </button>

            {/* Refresh History */}
            <button
              className="control btn-icon-only text-xs"
              onClick={() => {
                fetchHistory();
                fetchProviders();
              }}
              title="Reload History and Providers from Database"
              aria-label="Reload History"
            >
              <RefreshCw size={13} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </PageHead>

        {/* Storage Cleaned Alert Banner */}
        {actionMessage && (
          <div className="banner-alert badge-emerald mb-3">
            <CheckCircle2 size={16} style={{ color: "#10b981", flexShrink: 0 }} />
            <div className="banner-text">
              <strong style={{ fontSize: "13px" }}>Database Storage Optimized</strong>
              <p style={{ fontSize: "12px", margin: "2px 0 0" }}>{actionMessage}</p>
            </div>
          </div>
        )}

        {/* RTK Token Saver Master Switch Banner */}
        <article
          className="rtk-banner"
          style={{
            borderLeft: rtkActive ? "4px solid #10b981" : "4px solid #94a3b8",
          }}
        >
          {/* Header Controls */}
          <div className="rtk-banner-header">
            <div className="rtk-banner-brand">
              <div
                className="rtk-banner-icon"
                style={{
                  backgroundColor: rtkActive ? "rgba(16, 185, 129, 0.15)" : "var(--surface-hover)",
                  color: rtkActive ? "#10b981" : "var(--muted)",
                  border: rtkActive ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--line)",
                }}
              >
                <Zap size={16} strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "13.5px", color: "var(--ink)" }}>
                    RTK Token Saver
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "999px",
                      backgroundColor: rtkActive ? "rgba(16, 185, 129, 0.15)" : "var(--surface-hover)",
                      color: rtkActive ? "#10b981" : "var(--muted)",
                      border: rtkActive ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--line)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: rtkActive ? "#10b981" : "#94a3b8",
                        display: "inline-block",
                      }}
                    />
                    {rtkActive ? "Active (20–40% Cost Reduction)" : "Disabled (Raw Passthrough)"}
                  </span>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px" }}>
                  Intelligent context compressor for git diffs, lockfiles, file trees, and terminal execution logs.
                </div>
              </div>
            </div>

            <div className="rtk-banner-actions">
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, color: "var(--muted)", display: "block" }}>
                  Total Saved
                </span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "13px", fontWeight: 700, color: "#059669", display: "block" }}>
                  {totalTokensSaved.toLocaleString()} tokens
                </span>
              </div>
              <button
                type="button"
                disabled={rtkSaving}
                onClick={toggleRtk}
                className="control btn-inline"
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "6px 14px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  minWidth: "110px",
                  justifyContent: "center",
                  backgroundColor: rtkActive ? "#059669" : "var(--card)",
                  color: rtkActive ? "#ffffff" : "var(--ink)",
                  border: rtkActive ? "1px solid #047857" : "1px solid var(--line)",
                  boxShadow: rtkActive ? "0 1px 2px rgba(5, 150, 105, 0.2)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {rtkSaving ? "Updating..." : rtkActive ? "Disable RTK" : "Enable RTK"}
              </button>
            </div>
          </div>

          {/* 4-Column Feature Breakdown (Zero Emojis, Dedicated Icons, Aligned Spacing) */}
          <div className="rtk-grid">
            <div className="rtk-card">
              <div className="rtk-card-icon blue">
                <FileArchive size={14} strokeWidth={2} />
              </div>
              <div className="rtk-card-body">
                <div className="rtk-card-title">Lockfile Compactor</div>
                <div className="rtk-card-desc">
                  Condenses package-lock & yarn.lock to 1 line
                </div>
              </div>
            </div>

            <div className="rtk-card">
              <div className="rtk-card-icon emerald">
                <FolderTree size={14} strokeWidth={2} />
              </div>
              <div className="rtk-card-body">
                <div className="rtk-card-title">Tree Minifier</div>
                <div className="rtk-card-desc">
                  Filters node_modules, .git & build directories
                </div>
              </div>
            </div>

            <div className="rtk-card">
              <div className="rtk-card-icon amber">
                <Terminal size={14} strokeWidth={2} />
              </div>
              <div className="rtk-card-body">
                <div className="rtk-card-title">Terminal Sanitizer</div>
                <div className="rtk-card-desc">
                  Cleans ANSI escape codes & duplicate traces
                </div>
              </div>
            </div>

            <div className="rtk-card">
              <div className="rtk-card-icon purple">
                <SlidersHorizontal size={14} strokeWidth={2} />
              </div>
              <div className="rtk-card-body">
                <div className="rtk-card-title">Client Override</div>
                <div className="rtk-card-desc">
                  Header <code className="rtk-code-tag" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", padding: "1px 4px", borderRadius: "3px" }}>x-rtk-token-saver: false</code>
                </div>
              </div>
            </div>
          </div>
        </article>

        {/* Real-time KPI Metric Cards */}
        <div className="cards">
          {/* Card 1: Total Requests */}
          <article className="card metric">
            <div className="metric-header">
              <label>TOTAL REQUESTS (24H)</label>
              <div className="metric-icon-badge badge-blue">
                <Activity size={16} strokeWidth={2} />
              </div>
            </div>
            <div className="metric-body">
              <strong>{stats.totalRequests24h.toLocaleString()}</strong>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted">
                {events.length} in local memory buffer
              </span>
            </div>
          </article>

          {/* Card 2: Token Throughput */}
          <article className="card metric">
            <div className="metric-header">
              <label>TOKEN THROUGHPUT (24H)</label>
              <div className="metric-icon-badge badge-amber">
                <Zap size={16} strokeWidth={2} />
              </div>
            </div>
            <div className="metric-body">
              <strong>
                {stats.totalTokens24h > 1000000
                  ? (stats.totalTokens24h / 1000000).toFixed(2) + "M"
                  : stats.totalTokens24h.toLocaleString()}
              </strong>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted">
                In: <strong>{stats.totalPromptTokens24h.toLocaleString()}</strong>
              </span>
              <span className="text-xs text-muted">
                Out: <strong>{stats.totalCompletionTokens24h.toLocaleString()}</strong>
              </span>
            </div>
          </article>

          {/* Card 3: Avg Upstream Latency */}
          <article className="card metric">
            <div className="metric-header">
              <label>AVG UPSTREAM LATENCY</label>
              <div className="metric-icon-badge badge-emerald">
                <Clock size={16} strokeWidth={2} />
              </div>
            </div>
            <div className="metric-body">
              <strong
                style={{
                  color:
                    stats.avgLatencyMs === 0
                      ? "var(--ink)"
                      : stats.avgLatencyMs < 1500
                      ? "#059669"
                      : stats.avgLatencyMs < 3000
                      ? "#d97706"
                      : "#dc2626",
                }}
              >
                {stats.avgLatencyMs} ms
              </strong>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-muted">
                {stats.avgLatencyMs < 1500 ? "Healthy response times" : "Higher latency detected"}
              </span>
            </div>
          </article>

          {/* Card 4: Upstream Success Rate */}
          <article className="card metric">
            <div className="metric-header">
              <label>UPSTREAM SUCCESS RATE</label>
              <div className="metric-icon-badge badge-purple">
                <ShieldCheck size={16} strokeWidth={2} />
              </div>
            </div>
            <div className="metric-body">
              <strong
                style={{
                  color:
                    stats.successRate >= 95
                      ? "#059669"
                      : stats.successRate >= 80
                      ? "#d97706"
                      : "#dc2626",
                }}
              >
                {stats.successRate.toFixed(1)}%
              </strong>
            </div>
            <div className="flex items-center gap-1 mt-1">
              {stats.successRate >= 95 ? (
                <CheckCircle2 size={12} className="text-green" />
              ) : (
                <AlertTriangle size={12} className="text-amber" />
              )}
              <span className="text-xs text-muted">HTTP 2xx response ratio</span>
            </div>
          </article>
        </div>

        {/* Elevated Filter Bar */}
        <div className="filter-card">
          {/* Left Controls: Provider & Account Dropdowns (Image 2 style) */}
          <div className="flex items-center gap-2">
            {/* 1. Provider Dropdown Trigger & Popover */}
            <div className="provider-dropdown-container" ref={providerDropdownRef}>
              <button
                type="button"
                className={`provider-dropdown-trigger ${providerDropdownOpen ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProviderDropdownOpen((prev) => !prev);
                  setAccountDropdownOpen(false);
                }}
              >
                {selectedProvider ? (
                  <ProviderAvatar
                    slugOrId={selectedProvider.slug}
                    name={selectedProvider.name}
                    size={18}
                    imgSize={14}
                    className="shrink-0 rounded"
                    style={{ background: "var(--surface-hover)", borderColor: "var(--line)" }}
                  />
                ) : (
                  <DotsNineIcon size={14} style={{ color: "var(--blue, #2563eb)" }} />
                )}
                <span className="trigger-text">
                  {selectedProvider ? selectedProvider.name : "All Providers"}
                </span>
                <ChevronDown
                  size={13}
                  className={`trigger-chevron ${providerDropdownOpen ? "open" : ""}`}
                />
              </button>

              {providerDropdownOpen && (
                <div className="provider-popover-menu">
                  {/* Option: All Providers */}
                  <button
                    type="button"
                    className={`provider-dropdown-item ${providerFilter === "ALL" ? "active" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setProviderFilter("ALL");
                      setAccountFilter("ALL");
                      setProviderDropdownOpen(false);
                    }}
                  >
                    <div className="item-content">
                      <DotsNineIcon
                        size={16}
                        style={{ color: providerFilter === "ALL" ? "var(--blue, #2563eb)" : "var(--muted, #64748b)" }}
                      />
                      <span className="item-title">All providers</span>
                    </div>
                    {providerFilter === "ALL" && (
                      <Check size={15} className="item-check" />
                    )}
                  </button>

                  {/* Connected Providers List */}
                  <div className="provider-dropdown-scroll">
                    {connectedProviders.length === 0 ? (
                      <div className="provider-dropdown-empty">
                        No active provider connections
                      </div>
                    ) : (
                      connectedProviders.map((p) => {
                        const isSelected = providerFilter === p.key;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            className={`provider-dropdown-item ${isSelected ? "active" : ""}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setProviderFilter(p.key);
                              setAccountFilter("ALL");
                              setProviderDropdownOpen(false);
                            }}
                          >
                            <div className="item-content">
                              <ProviderAvatar
                                slugOrId={p.slug}
                                name={p.name}
                                size={22}
                                imgSize={16}
                                className="shrink-0 rounded-md overflow-hidden"
                                style={{
                                  backgroundColor: "var(--surface-hover)",
                                  borderColor: "var(--line)",
                                }}
                              />
                              <span className="item-title">{p.name}</span>
                            </div>
                            {isSelected && (
                              <Check size={15} className="item-check" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Account Dropdown Trigger & Popover */}
            <div className="provider-dropdown-container" ref={accountDropdownRef}>
              <button
                type="button"
                className={`provider-dropdown-trigger ${accountDropdownOpen ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAccountDropdownOpen((prev) => !prev);
                  setProviderDropdownOpen(false);
                }}
              >
                <span className="trigger-text">
                  {selectedAccount ? selectedAccount.name : "All accounts"}
                </span>
                <ChevronDown
                  size={13}
                  className={`trigger-chevron ${accountDropdownOpen ? "open" : ""}`}
                />
              </button>

              {accountDropdownOpen && (
                <div className="provider-popover-menu" style={{ minWidth: "240px" }}>
                  {/* Option: All Accounts */}
                  <button
                    type="button"
                    className={`provider-dropdown-item ${accountFilter === "ALL" ? "active" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAccountFilter("ALL");
                      setAccountDropdownOpen(false);
                    }}
                  >
                    <div className="item-content">
                      <span className="item-title">All accounts</span>
                    </div>
                    {accountFilter === "ALL" && (
                      <Check size={15} className="item-check" />
                    )}
                  </button>

                  {/* Accounts List */}
                  <div className="provider-dropdown-scroll">
                    {filteredAccounts.length === 0 ? (
                      <div className="provider-dropdown-empty">
                        No accounts for selected filter
                      </div>
                    ) : (
                      filteredAccounts.map((acc) => {
                        const isSelected = accountFilter === acc.id;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            className={`provider-dropdown-item ${isSelected ? "active" : ""}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setAccountFilter(acc.id);
                              setAccountDropdownOpen(false);
                            }}
                          >
                            <div className="account-box">
                              <span className="account-title">{acc.name}</span>
                              {acc.accountEmail && (
                                <span className="account-sub mono">
                                  {acc.accountEmail}
                                </span>
                              )}
                            </div>
                            {isSelected && (
                              <Check size={15} className="item-check" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Controls: Segmented Status Filter + Search */}
          <div className="flex items-center gap-2.5">
            <div className="segmented">
              <button
                className={`seg-btn ${statusFilter === "ALL" ? "active" : ""}`}
                onClick={() => setStatusFilter("ALL")}
              >
                All
              </button>
              <button
                className={`seg-btn ${statusFilter === "SUCCESS" ? "active" : ""}`}
                onClick={() => setStatusFilter("SUCCESS")}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                200 OK
              </button>
              <button
                className={`seg-btn ${statusFilter === "429" ? "active" : ""}`}
                onClick={() => setStatusFilter("429")}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1" />
                429 Limited
              </button>
              <button
                className={`seg-btn ${statusFilter === "ERROR" ? "active" : ""}`}
                onClick={() => setStatusFilter("ERROR")}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1" />
                Errors
              </button>
            </div>

            <div className="search-box-wrap">
              <Search size={13} className="text-muted shrink-0" />
              <input
                value={searchModel}
                onChange={(e) => setSearchModel(e.target.value)}
                placeholder="Filter by model..."
              />
              {searchModel && (
                <button
                  onClick={() => setSearchModel("")}
                  className="text-muted hover:text-ink bg-transparent border-0 p-0 cursor-pointer"
                  title="Clear filter"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Stream Table & Rich Empty State */}
        <article className="panel">
          <div className="panel-title">
            <div className="flex items-center gap-2">
              <h2>
                <Activity size={15} strokeWidth={1.75} />
                <span>Live Request Stream</span>
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                {totalCount.toLocaleString()} {totalCount === 1 ? "item" : "items"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  className="link-inline text-xs text-muted hover:text-ink cursor-pointer bg-transparent border-0"
                  onClick={() => {
                    setProviderFilter("ALL");
                    setAccountFilter("ALL");
                    setStatusFilter("ALL");
                    setSearchModel("");
                  }}
                >
                  Clear Filters
                </button>
              )}
              <span className="text-xs text-muted">Auto-updating telemetry</span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted text-xs flex flex-col items-center gap-2">
              <RefreshCw size={18} className="animate-spin text-blue" />
              <span>Connecting to gateway and fetching historical logs...</span>
            </div>
          ) : filteredEvents.length === 0 ? (
            /* Rich Developer Empty State */
            <div className="developer-empty-hub">
              {hasActiveFilters ? (
                /* Empty state due to active filter */
                <div className="py-6 flex flex-col items-center">
                  <Filter size={32} className="text-muted mb-2 opacity-50" />
                  <h3 className="empty-hub-title">No Requests Match Filter</h3>
                  <p className="empty-hub-desc">
                    No requests matched provider <strong>{providerFilter}</strong> or status <strong>{statusFilter}</strong>.
                  </p>
                  <button
                    className="control btn-inline primary text-xs"
                    onClick={() => {
                      setProviderFilter("ALL");
                      setAccountFilter("ALL");
                      setStatusFilter("ALL");
                      setSearchModel("");
                    }}
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                /* Empty state because 0 requests exist */
                <>
                  <div className="radar-sonar-circle">
                    <div className="radar-ring" />
                    <div className="radar-ring" />
                    <div className="radar-ring" />
                    <Radio size={28} className="text-blue z-10" />
                  </div>

                  <h3 className="empty-hub-title">Listening for Upstream AI Gateway Traffic</h3>
                  <p className="empty-hub-desc">
                    Inbound requests sent through the <code className="mono text-xs text-blue">/v1/chat/completions</code> or{" "}
                    <code className="mono text-xs text-blue">/v1/models</code> proxy endpoints will stream into this console in
                    real time with sub-millisecond precision.
                  </p>

                  {/* Terminal Code Snippet Card */}
                  <div className="terminal-card">
                    <div className="terminal-header">
                      <div className="terminal-tabs">
                        <button
                          className={`terminal-tab-btn ${codeTab === "curl" ? "active" : ""}`}
                          onClick={() => setCodeTab("curl")}
                        >
                          cURL
                        </button>
                        <button
                          className={`terminal-tab-btn ${codeTab === "node" ? "active" : ""}`}
                          onClick={() => setCodeTab("node")}
                        >
                          Node.js (OpenAI SDK)
                        </button>
                        <button
                          className={`terminal-tab-btn ${codeTab === "python" ? "active" : ""}`}
                          onClick={() => setCodeTab("python")}
                        >
                          Python
                        </button>
                      </div>

                      <button
                        className="control btn-inline text-xs"
                        style={{ height: "24px", padding: "0 8px", background: "transparent", border: "1px solid #334155", color: "#cbd5e1" }}
                        onClick={copyCode}
                      >
                        {copiedCode ? <Check size={11} className="text-green" /> : <Copy size={11} />}
                        <span>{copiedCode ? "Copied!" : "Copy Snippet"}</span>
                      </button>
                    </div>

                    <pre className="terminal-code">
                      <code>{codeSnippets[codeTab]}</code>
                    </pre>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Live Request Table */
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>PROVIDER</th>
                    <th>ACCOUNT / CONNECTION</th>
                    <th>MODEL</th>
                    <th>TOKENS (IN/OUT)</th>
                    <th>TOTAL</th>
                    <th title="Format: Total Asli / Setelah Kompres / Total Hemat">RTK (ORI/COMP/SAVED)</th>
                    <th>LATENCY</th>
                    <th>STATUS</th>
                    <th style={{ width: "78px", textAlign: "center" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      onClick={() => openInspect(ev)}
                    >
                      {/* Time */}
                      <td className="mono text-xs text-muted" style={{ whiteSpace: "nowrap" }}>
                        {new Date(ev.createdAt).toLocaleTimeString()}
                      </td>

                      {/* Provider */}
                      <td>
                        <span className="flex items-center gap-2">
                          <ProviderAvatar
                            slugOrId={getProviderSlug(ev.provider)}
                            name={getProviderDisplayName(ev.provider)}
                            size={20}
                            imgSize={14}
                            className="shrink-0 rounded"
                            style={{
                              backgroundColor: "var(--surface-hover)",
                              borderColor: "var(--line)",
                            }}
                          />
                          <span className="text-xs font-semibold">
                            {getProviderDisplayName(ev.provider)}
                          </span>
                        </span>
                      </td>

                      {/* Account / Connection & Client Requester */}
                      <td>
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
                              {ev.connection?.name || "Direct Upstream"}
                            </span>
                            {ev.connection?.accountEmail && (
                              <span className="text-muted" style={{ fontSize: "11px" }}>
                                {ev.connection.accountEmail}
                              </span>
                            )}
                          </div>

                          {/* Client Requester Account */}
                          {(ev.clientUser?.email || ev.clientUserEmail) && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span
                                className="px-1.5 py-0.5 rounded text-[10.5px] font-medium mono"
                                style={{
                                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                                  color: "#3b82f6",
                                  border: "1px solid rgba(59, 130, 246, 0.25)",
                                }}
                                title={`Client Requester User: ${ev.clientUser?.email || ev.clientUserEmail} (${ev.clientUser?.tier || "FREE"})`}
                              >
                                👤 {ev.clientUser?.email || ev.clientUserEmail}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Model & Reasoning Effort */}
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ev.model?.includes(" -> ") ? (
                            (() => {
                              const [comboName, originalModel] = ev.model.split(" -> ");
                              return (
                                <div className="flex items-center gap-1.5 mono text-xs font-medium">
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[11px] font-semibold"
                                    style={{
                                      backgroundColor: "rgba(147, 51, 234, 0.1)",
                                      color: "#9333ea",
                                      border: "1px solid rgba(147, 51, 234, 0.25)",
                                    }}
                                    title={`Combo Model: ${comboName}`}
                                  >
                                    {comboName}
                                  </span>
                                  <span className="text-muted text-[11px] font-bold">→</span>
                                  <span
                                    className="text-blue font-medium"
                                    title={`Target Model: ${originalModel}`}
                                  >
                                    {originalModel}
                                  </span>
                                </div>
                              );
                            })()
                          ) : (
                            <span className="mono text-xs font-medium text-blue">
                              {ev.model}
                            </span>
                          )}

                          {/* Reasoning Effort Badge */}
                          {ev.reasoningEffort && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase mono tracking-wider"
                              style={{
                                backgroundColor:
                                  ev.reasoningEffort.toLowerCase() === "high"
                                    ? "rgba(244, 63, 94, 0.15)"
                                    : ev.reasoningEffort.toLowerCase() === "medium"
                                    ? "rgba(245, 158, 11, 0.15)"
                                    : "rgba(56, 189, 248, 0.15)",
                                color:
                                  ev.reasoningEffort.toLowerCase() === "high"
                                    ? "#f43f5e"
                                    : ev.reasoningEffort.toLowerCase() === "medium"
                                    ? "#f59e0b"
                                    : "#38bdf8",
                                border: `1px solid ${
                                  ev.reasoningEffort.toLowerCase() === "high"
                                    ? "rgba(244, 63, 94, 0.3)"
                                    : ev.reasoningEffort.toLowerCase() === "medium"
                                    ? "rgba(245, 158, 11, 0.3)"
                                    : "rgba(56, 189, 248, 0.3)"
                                }`,
                              }}
                              title={`Reasoning Effort: ${ev.reasoningEffort}`}
                            >
                              ⚡ {ev.reasoningEffort}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tokens (In / Out) */}
                      <td className="mono text-xs">
                        <span className="font-semibold" style={{ color: "var(--ink)" }}>
                          {ev.promptTokens.toLocaleString()}
                        </span>
                        <span className="text-muted mx-1">/</span>
                        <span style={{ color: "#059669", fontWeight: 600 }}>
                          {ev.completionTokens.toLocaleString()}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="mono text-xs font-bold" style={{ color: "var(--ink)" }}>
                        {ev.totalTokens.toLocaleString()}
                      </td>

                      {/* RTK (Original / Compressed / Saved) */}
                      <td className="mono text-xs" style={{ whiteSpace: "nowrap" }}>
                        {ev.tokensSavedRtk && ev.tokensSavedRtk > 0 ? (
                          <span
                            title={`Token Asli: ${(ev.totalTokens + ev.tokensSavedRtk).toLocaleString()} | Setelah Kompres: ${ev.totalTokens.toLocaleString()} | Total Hemat: -${ev.tokensSavedRtk.toLocaleString()}`}
                          >
                            <span className="text-muted font-medium">
                              {(ev.totalTokens + ev.tokensSavedRtk).toLocaleString()}
                            </span>
                            <span className="text-muted mx-1">/</span>
                            <span style={{ color: "var(--ink)", fontWeight: 600 }}>
                              {ev.totalTokens.toLocaleString()}
                            </span>
                            <span className="text-muted mx-1">/</span>
                            <span style={{ color: "#059669", fontWeight: 700 }}>
                              -{ev.tokensSavedRtk.toLocaleString()}
                            </span>
                          </span>
                        ) : (
                          <span
                            className="text-muted"
                            style={{ opacity: 0.55 }}
                            title="Tidak ada kompresi RTK pada request ini (0 token hemat)"
                          >
                            {ev.totalTokens ? `${ev.totalTokens.toLocaleString()} / ${ev.totalTokens.toLocaleString()} / 0` : "—"}
                          </span>
                        )}
                      </td>

                      {/* Latency */}
                      <td className="mono text-xs">
                        <span className={`latency-badge ${getLatencyClass(ev.latencyMs)}`}>
                          <Clock size={10} />
                          <span>{ev.latencyMs}ms</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`status-badge ${
                              ev.statusCode === 200
                                ? "status-200"
                                : ev.statusCode === 429
                                ? "status-429"
                                : "status-error"
                            }`}
                          >
                            {ev.statusCode}
                          </span>
                          {ev.isFailover && (
                            <span
                              className="failover-badge"
                              title={ev.failoverReason || "Automatic failover executed"}
                            >
                              <Zap size={9} />
                              <span>Failover</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quick Actions: Chat & Inspect */}
                      <td style={{ textAlign: "center", verticalAlign: "middle", width: "78px" }}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            className="table-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openChatModal(ev);
                            }}
                            title="Buka Conversation Bubble Chat"
                            aria-label="Bubble Chat"
                            style={{
                              color: "#3b82f6",
                              backgroundColor: "rgba(59, 130, 246, 0.12)",
                              borderColor: "rgba(59, 130, 246, 0.3)",
                            }}
                          >
                            <MessageSquare size={13} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className="table-action-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openInspect(ev);
                            }}
                            title="Inspect full telemetry details"
                            aria-label="Inspect telemetry"
                          >
                            <Eye size={13} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {/* Pagination Footer */}
          {!loading && events.length > 0 && (
            <div className="table-footer">
              <div className="table-footer-left">
                <span className="table-footer-text">
                  Showing {totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1} to{" "}
                  {Math.min(safePage * pageSize, totalCount)} of{" "}
                  {totalCount.toLocaleString()} events
                </span>
                <div className="per-page-wrap flex items-center gap-2">
                  <span className="text-muted text-xs">Per page:</span>
                  <CustomDropdown
                    size="sm"
                    value={String(pageSize)}
                    onChange={(val) => {
                      setPageSize(Number(val));
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: "10", label: "10" },
                      { value: "15", label: "15" },
                      { value: "25", label: "25" },
                      { value: "50", label: "50" },
                      { value: "100", label: "100" },
                    ]}
                    minWidth={65}
                    width={65}
                  />
                </div>
              </div>

              <div className="pager">
                <button
                  type="button"
                  className="pager-btn"
                  disabled={safePage <= 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous Page"
                >
                  <ChevronLeft size={11} />
                  <span>Prev</span>
                </button>
                <span className="pager-info">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="pager-btn"
                  disabled={safePage >= totalPages || loading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Next Page"
                >
                  <span>Next</span>
                  <ChevronRight size={11} />
                </button>
              </div>
            </div>
          )}
        </article>

        {/* Telemetry Event Inspector Modal */}
        {inspectEvent && (
          <div className="modal-backdrop" onClick={() => setInspectEvent(null)}>
            <div
              className="inspector-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: activeRawTab === "chat" ? "880px" : "640px",
                width: "100%",
                transition: "max-width 0.2s ease",
              }}
            >
              <div className="inspector-header">
                <div className="inspector-header-left">
                  <Activity size={16} style={{ color: "var(--blue)" }} />
                  <h3 className="inspector-title">Upstream Telemetry Details</h3>
                  <span className="inspector-id-badge">
                    ID: {inspectEvent.id.slice(0, 14)}...
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition"
                    style={{
                      background: "rgba(59, 130, 246, 0.12)",
                      color: "#3b82f6",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                    }}
                    onClick={() => {
                      openChatModal(inspectEvent);
                      setInspectEvent(null);
                    }}
                    title="Buka Chat di Popup Penuh"
                  >
                    <MessageSquare size={13} />
                    <span>Popup Chat</span>
                  </button>
                  <button
                    className="control btn-icon-only text-xs"
                    onClick={() => setInspectEvent(null)}
                    aria-label="Close modal"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="inspector-body">
                {/* Status & Provider Banner */}
                <div className="inspector-status-card">
                  <div className="inspector-provider-group">
                    <span
                      className="inspector-provider-dot"
                      style={{ backgroundColor: PROVIDER_COLORS[inspectEvent.provider] || "#64748b" }}
                    />
                    <span className="inspector-provider-name">{inspectEvent.provider}</span>
                    {inspectEvent.model?.includes(" -> ") ? (
                      (() => {
                        const [comboName, originalModel] = inspectEvent.model.split(" -> ");
                        return (
                          <span className="inspector-model-badge flex items-center gap-1">
                            <span style={{ color: "#9333ea", fontWeight: 700 }}>{comboName}</span>
                            <span style={{ color: "var(--muted)" }}>→</span>
                            <span style={{ color: "var(--blue)" }}>{originalModel}</span>
                          </span>
                        );
                      })()
                    ) : (
                      <span className="inspector-model-badge">
                        {inspectEvent.model}
                      </span>
                    )}
                  </div>

                  <div className="inspector-status-group">
                    <span className={`latency-badge ${getLatencyClass(inspectEvent.latencyMs)}`}>
                      <Clock size={11} />
                      <span>{inspectEvent.latencyMs} ms</span>
                    </span>
                    <span
                      className="inspector-code-badge"
                      style={{
                        backgroundColor:
                          inspectEvent.statusCode >= 200 && inspectEvent.statusCode < 300
                            ? "#dcfce7"
                            : inspectEvent.statusCode === 429
                            ? "#fef3c7"
                            : "#fee2e2",
                        color:
                          inspectEvent.statusCode >= 200 && inspectEvent.statusCode < 300
                            ? "#166534"
                            : inspectEvent.statusCode === 429
                            ? "#92400e"
                            : "#991b1b",
                        border:
                          inspectEvent.statusCode >= 200 && inspectEvent.statusCode < 300
                            ? "1px solid #bbf7d0"
                            : inspectEvent.statusCode === 429
                            ? "1px solid #fde68a"
                            : "1px solid #fecaca",
                      }}
                    >
                      HTTP {inspectEvent.statusCode}
                    </span>
                  </div>
                </div>

                {/* Failover Warning Alert (if applicable) */}
                {inspectEvent.isFailover && (
                  <div className="banner-alert badge-amber" style={{ margin: 0 }}>
                    <Zap size={15} className="text-amber shrink-0" />
                    <div className="banner-text">
                      <strong style={{ fontSize: "12px" }}>Automated Failover Triggered</strong>
                      <p style={{ fontSize: "11.5px", margin: "2px 0 0" }}>
                        {inspectEvent.failoverReason || "Primary connection failed or rate limited; successfully rerouted to secondary."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Key Metrics Grid */}
                <div
                  className="inspector-metrics-grid"
                  style={{
                    gridTemplateColumns:
                      inspectEvent.tokensSavedRtk && inspectEvent.tokensSavedRtk > 0
                        ? "repeat(4, 1fr)"
                        : "repeat(3, 1fr)",
                  }}
                >
                  <div className="inspector-metric-card">
                    <span className="inspector-metric-label">Prompt Tokens</span>
                    <span className="inspector-metric-val">{inspectEvent.promptTokens.toLocaleString()}</span>
                  </div>
                  <div className="inspector-metric-card">
                    <span className="inspector-metric-label">Completion Tokens</span>
                    <span className="inspector-metric-val">{inspectEvent.completionTokens.toLocaleString()}</span>
                  </div>
                  <div className="inspector-metric-card">
                    <span className="inspector-metric-label">Total Tokens</span>
                    <span className="inspector-metric-val" style={{ color: "var(--blue)" }}>
                      {inspectEvent.totalTokens.toLocaleString()}
                    </span>
                  </div>
                  {Boolean(inspectEvent.tokensSavedRtk && inspectEvent.tokensSavedRtk > 0) && (
                    <div className="inspector-metric-card" style={{ borderColor: "rgba(16, 185, 129, 0.3)", background: "rgba(16, 185, 129, 0.1)" }}>
                      <span className="inspector-metric-label" style={{ color: "#10b981" }}>Saved by RTK</span>
                      <span className="inspector-metric-val" style={{ color: "#10b981" }}>
                        -{inspectEvent.tokensSavedRtk?.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* RTK Savings Formula Breakdown */}
                {Boolean(inspectEvent.tokensSavedRtk && inspectEvent.tokensSavedRtk > 0) && (
                  <div
                    className="rtk-formula-box"
                    style={{
                      borderRadius: "6px",
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      flexWrap: "wrap",
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: "#10b981" }}>RTK Formula:</span>
                      <span className="mono text-muted">
                        {(inspectEvent.totalTokens + (inspectEvent.tokensSavedRtk || 0)).toLocaleString()} (Asli)
                      </span>
                      <span className="text-muted">/</span>
                      <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>
                        {inspectEvent.totalTokens.toLocaleString()} (Kompres)
                      </span>
                      <span className="text-muted">/</span>
                      <span className="mono" style={{ fontWeight: 700, color: "#10b981" }}>
                        -{inspectEvent.tokensSavedRtk?.toLocaleString()} (Hemat)
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#047857" }}>
                      {Math.round(((inspectEvent.tokensSavedRtk || 0) / (inspectEvent.totalTokens + (inspectEvent.tokensSavedRtk || 0))) * 100)}% Cost Reduction
                    </span>
                  </div>
                )}

                {/* Connection & Routing Meta */}
                <div className="inspector-meta-box">
                  {/* Client Requester Account Card */}
                  <div className="inspector-meta-item" style={{ gridColumn: "1 / -1", background: "rgba(59, 130, 246, 0.08)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.25)" }}>
                    <div className="flex items-center justify-between w-full flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <User size={15} style={{ color: "#3b82f6" }} />
                        <span style={{ fontWeight: 600, color: "var(--ink)", fontSize: "12.5px" }}>Akun Pengirim (Client Account):</span>
                        <span className="mono font-bold" style={{ color: "#3b82f6", fontSize: "13px" }}>
                          {inspectEvent.clientUser?.email || inspectEvent.clientUserEmail || "Direct Gateway API"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {inspectEvent.clientUser?.tier && (
                          <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold" style={{ background: "rgba(147, 51, 234, 0.15)", color: "#a855f7", border: "1px solid rgba(147, 51, 234, 0.3)" }}>
                            PAKET: {inspectEvent.clientUser.tier}
                          </span>
                        )}
                        {inspectEvent.clientUser?.keyPrefix && (
                          <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold mono" style={{ background: "rgba(100, 116, 139, 0.15)", color: "#94a3b8", border: "1px solid rgba(100, 116, 139, 0.3)" }}>
                            KEY: {inspectEvent.clientUser.keyPrefix}...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="inspector-meta-item">
                    <span className="inspector-meta-label">
                      <Network size={13} style={{ color: "var(--muted)" }} />
                      <span>Target Upstream:</span>
                    </span>
                    <span className="inspector-meta-val">
                      {inspectEvent.connection?.name || "Default Gateway Environment"}
                    </span>
                  </div>
                  {inspectEvent.connection?.accountEmail && (
                    <div className="inspector-meta-item">
                      <span className="inspector-meta-label">
                        <User size={13} style={{ color: "var(--muted)" }} />
                        <span>Upstream Account:</span>
                      </span>
                      <span className="inspector-meta-val">{inspectEvent.connection.accountEmail}</span>
                    </div>
                  )}
                  {inspectEvent.reasoningEffort && (
                    <div className="inspector-meta-item">
                      <span className="inspector-meta-label">
                        <Zap size={13} style={{ color: "#38bdf8" }} />
                        <span>Reasoning Effort:</span>
                      </span>
                      <span className="inspector-meta-val font-bold uppercase mono" style={{ color: "#38bdf8" }}>
                        ⚡ {inspectEvent.reasoningEffort}
                      </span>
                    </div>
                  )}
                  <div className="inspector-meta-item">
                    <span className="inspector-meta-label">
                      <Clock size={13} style={{ color: "var(--muted)" }} />
                      <span>Event Timestamp:</span>
                    </span>
                    <span className="inspector-meta-val">{new Date(inspectEvent.createdAt).toLocaleString()}</span>
                  </div>
                  {inspectEvent.isFailover && (
                    <div className="inspector-meta-item">
                      <span className="inspector-meta-label">
                        <Zap size={13} style={{ color: "#d97706" }} />
                        <span>Failover Status:</span>
                      </span>
                      <span className="inspector-meta-val" style={{ color: "#d97706" }}>
                        Rerouted from rate-limited upstream
                      </span>
                    </div>
                  )}
                </div>

                {/* Raw Telemetry Inspector Tabs */}
                <div style={{ marginTop: "18px" }}>
                  <div className="flex items-center justify-between border-b" style={{ borderColor: "var(--border)", paddingBottom: "10px", gap: "8px", flexWrap: "wrap" }}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setActiveRawTab("chat")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          activeRawTab === "chat"
                            ? "bg-blue text-white shadow-sm"
                            : "text-muted hover:text-ink hover:bg-slate-800/40"
                        }`}
                        style={{
                          background: activeRawTab === "chat" ? "#3b82f6" : "transparent",
                          color: activeRawTab === "chat" ? "#fff" : "var(--muted)",
                        }}
                      >
                        <MessageSquare size={13} />
                        <span>Bubble Chat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRawTab("body")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          activeRawTab === "body"
                            ? "bg-blue text-white shadow-sm"
                            : "text-muted hover:text-ink hover:bg-slate-800/40"
                        }`}
                        style={{
                          background: activeRawTab === "body" ? "#3b82f6" : "transparent",
                          color: activeRawTab === "body" ? "#fff" : "var(--muted)",
                        }}
                      >
                        Request Body
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRawTab("headers")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          activeRawTab === "headers"
                            ? "bg-blue text-white shadow-sm"
                            : "text-muted hover:text-ink hover:bg-slate-800/40"
                        }`}
                        style={{
                          background: activeRawTab === "headers" ? "#3b82f6" : "transparent",
                          color: activeRawTab === "headers" ? "#fff" : "var(--muted)",
                        }}
                      >
                        Request Headers
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRawTab("response")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          activeRawTab === "response"
                            ? "bg-blue text-white shadow-sm"
                            : "text-muted hover:text-ink hover:bg-slate-800/40"
                        }`}
                        style={{
                          background: activeRawTab === "response" ? "#3b82f6" : "transparent",
                          color: activeRawTab === "response" ? "#fff" : "var(--muted)",
                        }}
                      >
                        Raw Response
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRawTab("telemetry")}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          activeRawTab === "telemetry"
                            ? "bg-blue text-white shadow-sm"
                            : "text-muted hover:text-ink hover:bg-slate-800/40"
                        }`}
                        style={{
                          background: activeRawTab === "telemetry" ? "#3b82f6" : "transparent",
                          color: activeRawTab === "telemetry" ? "#fff" : "var(--muted)",
                        }}
                      >
                        Full Telemetry JSON
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          openChatModal(inspectEvent);
                          setInspectEvent(null);
                        }}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5"
                        style={{
                          background: "rgba(59, 130, 246, 0.12)",
                          color: "#3b82f6",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                        }}
                        title="Buka Chat di Popup Terpisah"
                      >
                        <Maximize2 size={12} />
                        <span>Buka Popup Penuh</span>
                      </button>

                      {activeRawTab !== "chat" && (
                        <button
                          className="inspector-copy-btn"
                          onClick={() => {
                            let textToCopy = "";
                            if (activeRawTab === "body") {
                              textToCopy = typeof inspectEvent.rawBody === "string" ? inspectEvent.rawBody : JSON.stringify(inspectEvent.rawBody || {}, null, 2);
                            } else if (activeRawTab === "headers") {
                              textToCopy = typeof inspectEvent.rawHeaders === "string" ? inspectEvent.rawHeaders : JSON.stringify(inspectEvent.rawHeaders || {}, null, 2);
                            } else if (activeRawTab === "response") {
                              textToCopy = typeof inspectEvent.rawResponse === "string" ? inspectEvent.rawResponse : JSON.stringify(inspectEvent.rawResponse || {}, null, 2);
                            } else {
                              textToCopy = JSON.stringify(inspectEvent, null, 2);
                            }
                            navigator.clipboard.writeText(textToCopy);
                            setCopiedTab(true);
                            setTimeout(() => setCopiedTab(false), 2000);
                          }}
                          type="button"
                          style={{ padding: "4px 8px", fontSize: "11.5px" }}
                        >
                          {copiedTab ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                          <span>{copiedTab ? "Copied!" : "Copy"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tab Contents */}
                  {activeRawTab === "chat" ? (
                    <div style={{ marginTop: "12px" }}>
                      <ChatConversationView
                        rawBody={inspectEvent.rawBody}
                        rawResponse={inspectEvent.rawResponse}
                        loading={loadingInspectDetail}
                        maxHeight="440px"
                        onOpenFullModal={() => {
                          openChatModal(inspectEvent);
                          setInspectEvent(null);
                        }}
                        onSwitchToRaw={() => setActiveRawTab("body")}
                      />
                    </div>
                  ) : (
                    <div className="inspector-code-box" style={{ marginTop: "10px" }}>
                      <pre className="inspector-pre" style={{ maxHeight: "400px", overflowY: "auto" }}>
                        <code>
                          {activeRawTab === "body" && (
                            loadingInspectDetail
                              ? "// Sedang memuat full raw body dari database..."
                              : inspectEvent.rawBody
                              ? (typeof inspectEvent.rawBody === "string"
                                  ? (() => { try { return JSON.stringify(JSON.parse(inspectEvent.rawBody), null, 2); } catch { return inspectEvent.rawBody; } })()
                                  : JSON.stringify(inspectEvent.rawBody, null, 2))
                              : "// Tidak ada data raw body yang tersimpan untuk request ini."
                          )}
                          {activeRawTab === "headers" && (
                            loadingInspectDetail
                              ? "// Sedang memuat full raw headers dari database..."
                              : inspectEvent.rawHeaders
                              ? (typeof inspectEvent.rawHeaders === "string"
                                  ? (() => { try { return JSON.stringify(JSON.parse(inspectEvent.rawHeaders), null, 2); } catch { return inspectEvent.rawHeaders; } })()
                                  : JSON.stringify(inspectEvent.rawHeaders, null, 2))
                              : "// Tidak ada data raw headers yang tersimpan untuk request ini."
                          )}
                          {activeRawTab === "response" && (
                            loadingInspectDetail
                              ? "// Sedang memuat full raw response dari database..."
                              : inspectEvent.rawResponse
                              ? (typeof inspectEvent.rawResponse === "string"
                                  ? (() => { try { return JSON.stringify(JSON.parse(inspectEvent.rawResponse), null, 2); } catch { return inspectEvent.rawResponse; } })()
                                  : JSON.stringify(inspectEvent.rawResponse, null, 2))
                              : "// Tidak ada data raw response yang tersimpan untuk request ini."
                          )}
                          {activeRawTab === "telemetry" && (
                            JSON.stringify(inspectEvent, null, 2)
                          )}
                        </code>
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dedicated Standalone Chat Bubbles Modal */}
        {chatModalEvent && (
          <div className="modal-backdrop" onClick={() => setChatModalEvent(null)}>
            <div
              className="inspector-modal"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "920px",
                width: "95%",
                maxHeight: "90vh",
              }}
            >
              {/* Modal Header */}
              <div className="inspector-header">
                <div className="inspector-header-left">
                  <div className="p-1.5 rounded-md flex items-center justify-center" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}>
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="inspector-title" style={{ margin: 0 }}>
                        Conversation Chat Bubbles
                      </h3>
                      <span
                        className={`status-badge ${
                          chatModalEvent.statusCode === 200
                            ? "status-200"
                            : chatModalEvent.statusCode === 429
                            ? "status-429"
                            : "status-error"
                        }`}
                        style={{ fontSize: "10.5px" }}
                      >
                        {chatModalEvent.statusCode}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted mt-1 flex-wrap">
                      <span className="mono font-semibold text-blue">{chatModalEvent.model}</span>
                      <span>•</span>
                      <span>{chatModalEvent.clientUser?.email || chatModalEvent.clientUserEmail || "Direct Gateway API"}</span>
                      <span>•</span>
                      <span>{chatModalEvent.totalTokens.toLocaleString()} tokens</span>
                      <span>•</span>
                      <span>{chatModalEvent.latencyMs}ms</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="control btn-icon-only text-xs"
                    onClick={() => {
                      openInspect(chatModalEvent);
                      setChatModalEvent(null);
                    }}
                    title="Buka Telemetry Inspector Lengkap"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    className="control btn-icon-only text-xs"
                    onClick={() => setChatModalEvent(null)}
                    aria-label="Close modal"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="inspector-body" style={{ padding: "16px" }}>
                <ChatConversationView
                  rawBody={chatModalEvent.rawBody}
                  rawResponse={chatModalEvent.rawResponse}
                  loading={loadingChatDetail}
                  maxHeight="calc(90vh - 160px)"
                  onSwitchToRaw={() => {
                    openInspect(chatModalEvent);
                    setChatModalEvent(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Clear Telemetry Database Modal */}
        {clearModalOpen && (
          <div className="modal-overlay" onClick={() => setClearModalOpen(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="flex items-center gap-2">
                  <div style={{ padding: "6px", borderRadius: "6px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={16} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>Clear Upstream Telemetry</h3>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setClearModalOpen(false)}
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>

              <div style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5, marginBottom: "16px" }}>
                Telemetry logs can accumulate rapidly during continuous AI coding sessions. Clearing logs frees up database storage and keeps query performance snappy.
              </div>

              <div className="form-group">
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", display: "block", marginBottom: "6px" }}>
                  Select Deletion Scope
                </label>
                <CustomDropdown
                  size="md"
                  width="100%"
                  value={clearScope}
                  onChange={(val) => setClearScope(val as any)}
                  options={[
                    {
                      value: "all",
                      label: "All Telemetry Logs (Full Reset)",
                      icon: <Trash2 size={13} className="text-red" />,
                    },
                    {
                      value: "older_than_24h",
                      label: "Logs Older Than 24 Hours",
                      icon: <Clock size={13} className="text-amber-500" />,
                    },
                    {
                      value: "older_than_7d",
                      label: "Logs Older Than 7 Days",
                      icon: <Clock size={13} className="text-blue" />,
                    },
                  ]}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="control btn-inline text-xs"
                  disabled={clearing}
                  onClick={() => setClearModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={clearing}
                  onClick={handleClearLogs}
                  className="control btn-inline text-xs"
                  style={{
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    borderColor: "#b91c1c",
                    fontWeight: 600,
                  }}
                >
                  {clearing ? "Deleting..." : "Delete from Database"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
