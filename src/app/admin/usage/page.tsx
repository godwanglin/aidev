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
  const [copiedJson, setCopiedJson] = useState(false);

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

  // 1. Fetch initial historical logs & stats
  async function fetchHistory() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usage/history?limit=100");
      const json = await res.json();
      if (json.success) {
        setEvents(json.data.logs || []);
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
    fetchHistory();
    fetchProviders();
    fetchRtkStatus();
  }, []);

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
        setEvents((prev) => {
          // Avoid duplicate events
          if (prev.some((e) => e.id === newLog.id)) return prev;
          return [newLog, ...prev.slice(0, 199)]; // Keep last 200
        });
        setStats((prev) => ({
          ...prev,
          totalRequests24h: prev.totalRequests24h + 1,
          totalPromptTokens24h: prev.totalPromptTokens24h + newLog.promptTokens,
          totalCompletionTokens24h: prev.totalCompletionTokens24h + newLog.completionTokens,
          totalTokens24h: prev.totalTokens24h + newLog.totalTokens,
        }));
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

  // Filter events
  const filteredEvents = events.filter((ev) => {
    // 1. Provider filter
    if (providerFilter !== "ALL") {
      const normEv = (ev.provider || "").toUpperCase();
      const normFilter = providerFilter.toUpperCase();
      let match = normEv === normFilter;
      if (!match) {
        if ((normFilter === "OPENAI_CODEX" || normFilter === "CODEX") && (normEv === "OPENAI_CODEX" || normEv === "CODEX")) {
          match = true;
        } else if ((normFilter === "GEMINI" || normFilter === "GEMINI_CLI" || normFilter === "GOOGLE") && (normEv === "GEMINI" || normEv === "GEMINI_CLI" || normEv === "GOOGLE")) {
          match = true;
        } else if ((normFilter === "OLLAMA" || normFilter === "OLLAMA_CLOUD") && (normEv === "OLLAMA" || normEv === "OLLAMA_CLOUD")) {
          match = true;
        } else if ((normFilter === "ANTHROPIC" || normFilter === "CLAUDE") && (normEv === "ANTHROPIC" || normEv === "CLAUDE")) {
          match = true;
        }
      }
      if (!match) return false;
    }

    // 2. Account filter
    if (accountFilter !== "ALL") {
      const targetConn = connections.find((c) => c.id === accountFilter);
      if (targetConn) {
        const matchConn =
          (ev as any).connectionId === targetConn.id ||
          ev.connection?.name === targetConn.name ||
          (targetConn.accountEmail && ev.connection?.accountEmail === targetConn.accountEmail);
        if (!matchConn) return false;
      }
    }

    // 3. Search model
    if (searchModel.trim() && !ev.model.toLowerCase().includes(searchModel.toLowerCase().trim())) return false;

    // 4. Status filter
    if (statusFilter === "SUCCESS" && (ev.statusCode < 200 || ev.statusCode >= 300)) return false;
    if (statusFilter === "429" && ev.statusCode !== 429) return false;
    if (statusFilter === "ERROR" && ev.statusCode < 400) return false;

    return true;
  });

  const hasActiveFilters =
    providerFilter !== "ALL" ||
    accountFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    searchModel.trim() !== "";

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [providerFilter, accountFilter, statusFilter, searchModel]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedEvents = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return filteredEvents.slice(startIndex, startIndex + pageSize);
  }, [filteredEvents, safePage, pageSize]);

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
              className="control btn-inline text-xs"
              onClick={() => setClearModalOpen(true)}
              title="Clear Telemetry Logs from Database"
              style={{
                color: "#dc2626",
                borderColor: "#fecaca",
                backgroundColor: "#fef2f2",
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
          <div className="banner-alert mb-3" style={{ background: "#ecfdf5", borderColor: "#a7f3d0" }}>
            <CheckCircle2 size={16} style={{ color: "#059669", flexShrink: 0 }} />
            <div className="banner-text">
              <strong style={{ color: "#047857", fontSize: "13px" }}>Database Storage Optimized</strong>
              <p style={{ color: "#065f46", fontSize: "12px", margin: "2px 0 0" }}>{actionMessage}</p>
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
                  backgroundColor: rtkActive ? "#ecfdf5" : "#f1f5f9",
                  color: rtkActive ? "#059669" : "#64748b",
                  border: rtkActive ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
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
                      backgroundColor: rtkActive ? "#ecfdf5" : "#f1f5f9",
                      color: rtkActive ? "#047857" : "#64748b",
                      border: rtkActive ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
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
                  backgroundColor: rtkActive ? "#059669" : "#f1f5f9",
                  color: rtkActive ? "#ffffff" : "var(--ink)",
                  border: rtkActive ? "1px solid #047857" : "1px solid #cbd5e1",
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
              <div
                className="rtk-card-icon"
                style={{ background: "#eff6ff", border: "1px solid #dbeafe", color: "#2563eb" }}
              >
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
              <div
                className="rtk-card-icon"
                style={{ background: "#ecfdf5", border: "1px solid #d1fae5", color: "#059669" }}
              >
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
              <div
                className="rtk-card-icon"
                style={{ background: "#fffbeb", border: "1px solid #fef3c7", color: "#d97706" }}
              >
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
              <div
                className="rtk-card-icon"
                style={{ background: "#f5f3ff", border: "1px solid #ede9fe", color: "#7c3aed" }}
              >
                <SlidersHorizontal size={14} strokeWidth={2} />
              </div>
              <div className="rtk-card-body">
                <div className="rtk-card-title">Client Override</div>
                <div className="rtk-card-desc">
                  Header <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", background: "#f1f5f9", border: "1px solid #e2e8f0", padding: "1px 4px", borderRadius: "3px", color: "var(--ink)" }}>x-rtk-token-saver: false</code>
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
                    style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }}
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
                                  backgroundColor: "#f8fafc",
                                  borderColor: "#e2e8f0",
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] font-medium">
                {filteredEvents.length} {filteredEvents.length === 1 ? "item" : "items"}
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
                    <th style={{ width: "56px", textAlign: "center" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      className="cursor-pointer transition hover:bg-[#f8fafc]"
                      onClick={() => setInspectEvent(ev)}
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
                              backgroundColor: "#f1f5f9",
                              borderColor: "#e2e8f0",
                            }}
                          />
                          <span className="text-xs font-semibold">
                            {getProviderDisplayName(ev.provider)}
                          </span>
                        </span>
                      </td>

                      {/* Account / Connection */}
                      <td>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium" style={{ color: "var(--ink)" }}>
                            {ev.connection?.name || "Direct Upstream"}
                          </span>
                          {ev.connection?.accountEmail && (
                            <span className="text-muted" style={{ fontSize: "11px" }}>
                              {ev.connection.accountEmail}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Model */}
                      <td>
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
                            className="status-badge"
                            style={{
                              backgroundColor: ev.statusCode === 200 ? "#ecfdf5" : ev.statusCode === 429 ? "#fffbeb" : "#fef2f2",
                              color: ev.statusCode === 200 ? "#065f46" : ev.statusCode === 429 ? "#92400e" : "#991b1b",
                              borderColor: ev.statusCode === 200 ? "#a7f3d0" : ev.statusCode === 429 ? "#fde68a" : "#fecaca",
                            }}
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

                      {/* Quick Inspect Action */}
                      <td style={{ textAlign: "center", verticalAlign: "middle", width: "56px" }}>
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectEvent(ev);
                          }}
                          title="Inspect full telemetry details"
                          aria-label="Inspect telemetry"
                        >
                          <Eye size={13} strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {!loading && filteredEvents.length > 0 && (
            <div className="table-footer">
              <div className="table-footer-left">
                <span className="table-footer-text">
                  Showing {(safePage - 1) * pageSize + 1} to{" "}
                  {Math.min(safePage * pageSize, filteredEvents.length)} of{" "}
                  {filteredEvents.length.toLocaleString()} events
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
                  disabled={safePage <= 1}
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
                  disabled={safePage >= totalPages}
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
            <div className="inspector-modal" onClick={(e) => e.stopPropagation()}>
              <div className="inspector-header">
                <div className="inspector-header-left">
                  <Activity size={16} style={{ color: "var(--blue)" }} />
                  <h3 className="inspector-title">Upstream Telemetry Details</h3>
                  <span className="inspector-id-badge">
                    ID: {inspectEvent.id.slice(0, 14)}...
                  </span>
                </div>
                <button
                  className="control btn-icon-only text-xs"
                  onClick={() => setInspectEvent(null)}
                  aria-label="Close modal"
                >
                  <X size={14} />
                </button>
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
                  <div className="banner-alert" style={{ background: "#fffbeb", borderColor: "#fde68a", margin: 0 }}>
                    <Zap size={15} className="text-amber shrink-0" />
                    <div className="banner-text">
                      <strong style={{ fontSize: "12px", color: "#92400e" }}>Automated Failover Triggered</strong>
                      <p style={{ fontSize: "11.5px", color: "#b45309", margin: "2px 0 0" }}>
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
                    <div className="inspector-metric-card" style={{ borderColor: "#a7f3d0", background: "#f0fdf4" }}>
                      <span className="inspector-metric-label" style={{ color: "#047857" }}>Saved by RTK</span>
                      <span className="inspector-metric-val" style={{ color: "#059669" }}>
                        -{inspectEvent.tokensSavedRtk?.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* RTK Savings Formula Breakdown */}
                {Boolean(inspectEvent.tokensSavedRtk && inspectEvent.tokensSavedRtk > 0) && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
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
                      <span style={{ fontWeight: 600, color: "#065f46" }}>RTK Formula:</span>
                      <span className="mono text-muted">
                        {(inspectEvent.totalTokens + (inspectEvent.tokensSavedRtk || 0)).toLocaleString()} (Asli)
                      </span>
                      <span className="text-muted">/</span>
                      <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>
                        {inspectEvent.totalTokens.toLocaleString()} (Kompres)
                      </span>
                      <span className="text-muted">/</span>
                      <span className="mono" style={{ fontWeight: 700, color: "#059669" }}>
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
                  <div className="inspector-meta-item">
                    <span className="inspector-meta-label">
                      <Network size={13} style={{ color: "var(--muted)" }} />
                      <span>Connection Name:</span>
                    </span>
                    <span className="inspector-meta-val">
                      {inspectEvent.connection?.name || "Default Gateway Environment"}
                    </span>
                  </div>
                  {inspectEvent.connection?.accountEmail && (
                    <div className="inspector-meta-item">
                      <span className="inspector-meta-label">
                        <User size={13} style={{ color: "var(--muted)" }} />
                        <span>Account Email:</span>
                      </span>
                      <span className="inspector-meta-val">{inspectEvent.connection.accountEmail}</span>
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

                {/* Raw JSON Telemetry */}
                <div className="inspector-code-box">
                  <div className="inspector-code-header">
                    <span className="inspector-code-header-title">
                      <Code2 size={13} />
                      <span>Raw Event Telemetry JSON</span>
                    </span>
                    <button
                      className="inspector-copy-btn"
                      onClick={copyEventJson}
                      type="button"
                    >
                      {copiedJson ? <Check size={11} className="text-green" /> : <Copy size={11} />}
                      <span>{copiedJson ? "Copied" : "Copy JSON"}</span>
                    </button>
                  </div>
                  <pre className="inspector-pre">
                    <code>{JSON.stringify(inspectEvent, null, 2)}</code>
                  </pre>
                </div>
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
                  <div style={{ padding: "6px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
