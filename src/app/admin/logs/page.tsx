"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Copy,
  Check,
  Download,
  ArrowDown,
  Search,
  X,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Layers,
  Cpu,
} from "lucide-react";

interface AdminLogItem {
  id: string;
  timestamp: string;
  fullTime: string;
  scope: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  details?: Record<string, any>;
}

const SCOPES = [
  { id: "ALL", label: "All Logs" },
  { id: "CLIENT_REQUEST", label: "Client Request" },
  { id: "POST", label: "Upstream Post" },
  { id: "DONE", label: "Done 🟢" },
  { id: "FALLBACK", label: "Fallback ⚠️" },
  { id: "AUTH_REFRESH", label: "Auth Refresh" },
  { id: "BG_TOKEN_REFRESH", label: "BG Token" },
  { id: "ERROR", label: "Errors 🔴" },
];

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeScope, setActiveScope] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AdminLogItem | null>(null);
  const [wrapLines, setWrapLines] = useState(false);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE Stream
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    function connect() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource("/api/admin/logs/stream");
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.addEventListener("history", (e: MessageEvent) => {
        try {
          const historyItems = JSON.parse(e.data);
          if (Array.isArray(historyItems)) {
            console.log(`[AdminLogs] Loaded ${historyItems.length} history items`);
            setLogs(historyItems);
          }
        } catch (err) {
          console.error("Failed to parse logs history", err);
        }
      });

      es.addEventListener("log", (e: MessageEvent) => {
        if (isPaused) return;
        try {
          const newLog = JSON.parse(e.data);
          console.log(`[AdminLogs] [${newLog.scope}]`, newLog.message, newLog);
          setLogs((prev) => {
            const next = [...prev, newLog];
            return next.length > 1000 ? next.slice(-1000) : next;
          });
        } catch (err) {
          console.error("Failed to parse log chunk", err);
        }
      });

      es.addEventListener("clear", () => {
        setLogs([]);
      });

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [isPaused]);

  // Handle auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Filter logs by scope and search query
  const filteredLogs = useMemo(() => {
    let result = logs;

    if (activeScope !== "ALL") {
      result = result.filter((l) => l.scope === activeScope);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          l.scope.toLowerCase().includes(q) ||
          l.timestamp.toLowerCase().includes(q) ||
          (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
      );
    }

    return result;
  }, [logs, activeScope, searchQuery]);

  // Scope counters for badges
  const scopeCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: logs.length };
    for (const log of logs) {
      counts[log.scope] = (counts[log.scope] || 0) + 1;
    }
    return counts;
  }, [logs]);

  // Clear buffer
  const handleClearLogs = async () => {
    try {
      await fetch("/api/admin/logs", { method: "DELETE" });
      setLogs([]);
    } catch (err) {
      console.error("Failed to clear logs", err);
    }
  };

  // Copy all visible logs
  const handleCopyAll = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.scope}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Copy single log line
  const handleCopyLine = (log: AdminLogItem) => {
    const line = `[${log.timestamp}] [${log.scope}] ${log.message}`;
    navigator.clipboard.writeText(line);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Export logs to txt file
  const handleExport = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.scope}] ${l.message}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gateway-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getBadgeClass = (scope: string) => {
    switch (scope) {
      case "CLIENT_REQUEST":
        return "badge-client-request";
      case "POST":
        return "badge-post";
      case "DONE":
        return "badge-done";
      case "FALLBACK":
        return "badge-fallback";
      case "AUTH_REFRESH":
        return "badge-auth-refresh";
      case "BG_TOKEN_REFRESH":
        return "badge-bg-token-refresh";
      case "ERROR":
        return "badge-error";
      default:
        return "";
    }
  };

  const getContentClass = (log: AdminLogItem) => {
    if (log.scope === "DONE" || log.message.startsWith("🟢")) return "done";
    if (log.scope === "ERROR" || log.message.startsWith("🔴")) return "error";
    if (log.scope === "FALLBACK") return "fallback";
    if (log.scope === "CLIENT_REQUEST") return "client-request";
    if (log.scope === "POST") return "post";
    return "";
  };

  // Formatter for rich inline highlighted log message
  const renderLogMessage = (message: string, scope: string) => {
    if (scope === "DONE" || message.startsWith("🟢")) {
      // e.g. 🟢 DONE 1110ms · TTFT 1092ms · IN 17 · OUT 9
      const parts = message.split(" · ");
      return (
        <span>
          <span style={{ color: "#34d399", fontWeight: 700 }}>{parts[0]}</span>
          {parts.slice(1).map((p, i) => {
            let color = "#94a3b8";
            if (p.startsWith("TTFT")) color = "#a3e635";
            else if (p.startsWith("IN")) color = "#38bdf8";
            else if (p.startsWith("OUT")) color = "#4ade80";
            else if (p.startsWith("RTK")) color = "#c084fc";
            return (
              <span key={i}>
                <span style={{ color: "#475569", margin: "0 6px" }}>·</span>
                <span style={{ color, fontWeight: 600 }}>{p}</span>
              </span>
            );
          })}
        </span>
      );
    }

    if (scope === "POST") {
      // e.g. gpt-6-astra → gemini-2.5-flash · FMT: openai→gemini · STREAM · 1 MSG · 0 TOOL · ACCOUNT:agpertama658@gmail.com
      const parts = message.split(" · ");
      const modelPart = parts[0];
      const [fromModel, toModel] = modelPart.split(" → ");

      return (
        <span>
          <span style={{ color: "#f8fafc", fontWeight: 600 }}>{fromModel}</span>
          {toModel && (
            <>
              <span style={{ color: "#38bdf8", fontWeight: 700, margin: "0 6px" }}>→</span>
              <span style={{ color: "#818cf8", fontWeight: 600 }}>{toModel}</span>
            </>
          )}
          {parts.slice(1).map((p, i) => {
            let color = "#94a3b8";
            let bg = "transparent";
            let border = "none";
            let padding = "0";

            if (p.startsWith("FMT:")) {
              color = "#c084fc";
            } else if (p === "STREAM" || p === "SYNC") {
              color = p === "STREAM" ? "#38bdf8" : "#94a3b8";
              bg = p === "STREAM" ? "rgba(56, 189, 248, 0.12)" : "rgba(148, 163, 184, 0.1)";
              border = "1px solid rgba(56, 189, 248, 0.25)";
              padding = "1px 6px";
            } else if (p.endsWith("MSG") || p.endsWith("TOOL")) {
              color = "#cbd5e1";
            } else if (p.startsWith("ACCOUNT:")) {
              color = "#fcd34d";
            }

            return (
              <span key={i}>
                <span style={{ color: "#475569", margin: "0 6px" }}>·</span>
                <span
                  style={{
                    color,
                    background: bg,
                    border,
                    borderRadius: "4px",
                    padding,
                    fontWeight: 500,
                  }}
                >
                  {p}
                </span>
              </span>
            );
          })}
        </span>
      );
    }

    if (scope === "CLIENT_REQUEST") {
      // e.g. ACCOUNT: Test Codex Stream Key (Admin) · BALANCE: 8.439.308 CR (ULTRA) · REQ: /v1/chat/completions (gpt-6-astra)
      const parts = message.split(" · ");
      return (
        <span>
          {parts.map((p, i) => {
            let color = "#7dd3fc";
            if (p.startsWith("BALANCE:")) color = "#fef08a";
            else if (p.startsWith("REQ:")) color = "#e2e8f0";

            return (
              <span key={i}>
                {i > 0 && <span style={{ color: "#475569", margin: "0 6px" }}>·</span>}
                <span style={{ color, fontWeight: 500 }}>{p}</span>
              </span>
            );
          })}
        </span>
      );
    }

    if (scope === "FALLBACK") {
      return <span style={{ color: "#fbbf24", fontWeight: 500 }}>{message}</span>;
    }

    if (scope === "AUTH_REFRESH" || scope === "BG_TOKEN_REFRESH") {
      const parts = message.split(" · ");
      const isError = message.includes("❌") || message.includes("failed");
      const isSuccess = message.includes("✅");
      const headColor = isError ? "#fb7185" : isSuccess ? "#34d399" : "#c084fc";

      return (
        <span>
          <span style={{ color: headColor, fontWeight: 600 }}>{parts[0]}</span>
          {parts.slice(1).map((p, i) => (
            <span key={i}>
              <span style={{ color: "#475569", margin: "0 6px" }}>·</span>
              <span style={{ color: "#94a3b8", fontWeight: 500 }}>{p}</span>
            </span>
          ))}
        </span>
      );
    }

    if (scope === "ERROR" || message.startsWith("🔴")) {
      return <span style={{ color: "#fb7185", fontWeight: 600 }}>{message}</span>;
    }

    return <span>{message}</span>;
  };

  return (
    <DashboardShell>
      <div className="content">
        {/* Page Head with Live SSE Beacon and Toolbar */}
        <PageHead
          title="Live Console Logs"
          subtitle="Real-time AI Gateway request pipeline stream, protocol translations, token telemetry, and upstream failovers."
        >
          <div className="admin-console-top-controls">
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
              <span style={{ fontSize: "11px", opacity: 0.75 }}>
                ({logs.length}/1000)
              </span>
            </div>

            {/* Pause / Resume Button */}
            <button
              className={`admin-console-btn ${isPaused ? "active" : ""}`}
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Resume live logs" : "Pause live stream"}
            >
              {isPaused ? <Play size={13} /> : <Pause size={13} />}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>

            {/* Auto-Scroll Toggle */}
            <button
              className={`admin-console-btn ${autoScroll ? "active" : ""}`}
              onClick={() => setAutoScroll(!autoScroll)}
              title="Toggle auto-scroll to newest logs"
            >
              <ArrowDown size={13} />
              <span>Auto-scroll</span>
            </button>

            {/* Copy Visible Logs */}
            <button
              className="admin-console-btn"
              onClick={handleCopyAll}
              title="Copy all visible logs to clipboard"
            >
              {copiedAll ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
              <span>{copiedAll ? "Copied!" : "Copy"}</span>
            </button>

            {/* Export Log File */}
            <button
              className="admin-console-btn"
              onClick={handleExport}
              title="Download visible logs as .txt file"
            >
              <Download size={13} />
              <span>Export</span>
            </button>

            {/* Clear Buffer */}
            <button
              className="admin-console-btn danger"
              onClick={handleClearLogs}
              title="Clear all logs from memory buffer"
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          </div>
        </PageHead>

        <div className="admin-console-wrap">
          {/* Filter Bar with Scope Pills and Search Input */}
          <div className="admin-console-filter-bar">
            {/* Scope Pills */}
            <div className="admin-console-pills">
              {SCOPES.map((s) => {
                const count = scopeCounts[s.id] || 0;
                const isSelected = activeScope === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveScope(s.id)}
                    className={`admin-console-pill ${isSelected ? "active" : ""}`}
                  >
                    <span>{s.label}</span>
                    <span className="admin-console-pill-count">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Input & Wrap Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="admin-console-search">
                <Search size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Filter logs (model, account, scope...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "#94a3b8",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                className={`admin-console-btn ${wrapLines ? "active" : ""}`}
                onClick={() => setWrapLines(!wrapLines)}
                style={{ height: "32px", padding: "0 10px", fontSize: "11.5px" }}
                title="Toggle line wrapping"
              >
                Wrap: {wrapLines ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {/* Terminal Dark Window */}
          <div className="admin-terminal-window">
            {/* Terminal Window Header Bar */}
            <div className="admin-terminal-header">
              <div style={{ display: "flex", alignItems: "center" }}>
                <div className="admin-terminal-dots">
                  <span className="admin-terminal-dot red" />
                  <span className="admin-terminal-dot amber" />
                  <span className="admin-terminal-dot green" />
                </div>
                <span className="admin-terminal-title">
                  aidev-gateway@server: /var/log/live-gateway.log
                </span>
              </div>

              <div className="admin-terminal-meta">
                <span>Buffer: {logs.length}/1000</span>
                <span>Filtered: {filteredLogs.length}</span>
              </div>
            </div>

            {/* Terminal Logs Display Area */}
            <div ref={logsContainerRef} className="admin-terminal-body">
              {filteredLogs.length === 0 ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    color: "#64748b",
                    padding: "40px 20px",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: "rgba(255, 255, 255, 0.04)",
                      border: "1px solid #1e293b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#94a3b8",
                    }}
                  >
                    <Terminal size={24} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#e2e8f0" }}>
                      Belum ada log aktivitas gateway
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b", maxWidth: "420px" }}>
                      Kirim request API dari client (Codex Desktop, Antigravity, Claude, atau Chat completions) untuk memantau aktivitas live gateway.
                    </p>
                  </div>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isSelected = selectedLog?.id === log.id;

                  return (
                    <div
                      key={log.id}
                      className={`admin-log-row ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedLog(log)}
                    >
                      {/* Timestamp */}
                      <span className="admin-log-timestamp">[{log.timestamp}]</span>

                      {/* Scope Badge */}
                      <span className={`admin-log-badge ${getBadgeClass(log.scope)}`}>
                        {log.scope}
                      </span>

                      {/* Formatted Content */}
                      <div
                        className={`admin-log-content ${getContentClass(log)}`}
                        style={{
                          whiteSpace: wrapLines ? "normal" : "nowrap",
                          overflowX: wrapLines ? "visible" : "hidden",
                          textOverflow: wrapLines ? "clip" : "ellipsis",
                        }}
                      >
                        {renderLogMessage(log.message, log.scope)}
                      </div>

                      {/* Hover Action Buttons */}
                      <div className="admin-log-row-actions">
                        <button
                          className="admin-log-action-btn"
                          title="Copy log line"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLine(log);
                          }}
                        >
                          {copiedId === log.id ? (
                            <Check size={12} style={{ color: "#10b981" }} />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                        {log.details && (
                          <button
                            className="admin-log-action-btn"
                            title="Inspect JSON metadata"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                          >
                            <Eye size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Structured Log Inspector Modal */}
        {selectedLog && (
          <div className="admin-log-modal-backdrop" onClick={() => setSelectedLog(null)}>
            <div className="admin-log-modal" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="admin-log-modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#38bdf8",
                    }}
                  >
                    <Terminal size={16} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#f8fafc" }}>
                      Log Entry Inspector
                    </h3>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      {selectedLog.fullTime}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedLog(null)}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "6px",
                    borderRadius: "6px",
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="admin-log-modal-body">
                {/* Meta Grid */}
                <div className="admin-log-meta-grid">
                  <div className="admin-log-meta-card">
                    <span className="admin-log-meta-label">Scope</span>
                    <span className="admin-log-meta-value">{selectedLog.scope}</span>
                  </div>
                  <div className="admin-log-meta-card">
                    <span className="admin-log-meta-label">Level</span>
                    <span className="admin-log-meta-value" style={{ textTransform: "uppercase" }}>
                      {selectedLog.level}
                    </span>
                  </div>
                  <div className="admin-log-meta-card">
                    <span className="admin-log-meta-label">Timestamp</span>
                    <span className="admin-log-meta-value">{selectedLog.timestamp}</span>
                  </div>
                </div>

                {/* Formatted Message */}
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#94a3b8",
                      display: "block",
                      marginBottom: "6px",
                    }}
                  >
                    Message String
                  </span>
                  <div
                    style={{
                      background: "#090d16",
                      border: "1px solid #1e293b",
                      borderRadius: "8px",
                      padding: "12px",
                      fontSize: "12px",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#f1f5f9",
                      lineHeight: "1.6",
                      wordBreak: "break-word",
                    }}
                  >
                    {selectedLog.message}
                  </div>
                </div>

                {/* Structured JSON Details */}
                {selectedLog.details && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8" }}>
                        Payload Metadata (JSON)
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(selectedLog.details, null, 2));
                        }}
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "#38bdf8",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Copy size={12} />
                        <span>Copy JSON</span>
                      </button>
                    </div>

                    <pre className="admin-log-json-block">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="admin-log-modal-footer">
                <button
                  className="admin-console-btn"
                  onClick={() => handleCopyLine(selectedLog)}
                >
                  <Copy size={13} />
                  <span>Copy Line</span>
                </button>
                <button
                  className="admin-console-btn active"
                  onClick={() => setSelectedLog(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
