"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import CustomDropdown from "@/components/CustomDropdown";
import { ProviderAvatar } from "@/components/providers/ProviderIcons";
import {
  Boxes,
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Copy,
  Check,
  Zap,
  Filter,
  Globe,
  Eye,
  EyeOff,
  Layers,
  ExternalLink,
  Network,
} from "lucide-react";

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
  if (p === "OPENAI_CODEX" || p === "CODEX") return "OpenAI Codex";
  if (p === "GEMINI" || p === "GEMINI_CLI") return "Gemini-Cli";
  if (p === "GOOGLE") return "Google Gemini";
  if (p === "DEEPSEEK") return "DeepSeek";
  if (p === "OLLAMA" || p === "OLLAMA_CLOUD") return "Ollama Cloud";
  if (p === "OPENROUTER") return "OpenRouter";
  if (p === "OPENAI") return "OpenAI";
  if (p === "ANTHROPIC" || p === "CLAUDE" || p === "CLAUDE_CODE") return "Claude Code";
  if (p === "KIMI") return "Kimi Moonshot";
  if (p === "ALIBABA" || p === "QWEN") return "Alibaba Qwen";
  if (p === "COMBO") return "Combo (Auto-Rotate)";
  return providerKey.charAt(0).toUpperCase() + providerKey.slice(1).toLowerCase();
}

interface ModelItem {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  contextWindow: string;
  isActive: boolean;
  isPublic?: boolean;
  createdAt: string;
  isCombo?: boolean;
  comboStrategy?: string;
  comboItems?: string[];
  firstCandidate?: string | null;
}

interface PingStatus {
  latencyMs: number;
  status: string;
  loading: boolean;
  connectionName?: string;
  error?: string;
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | "PUBLIC" | "HIDDEN">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [syncingModels, setSyncingModels] = useState(false);

  async function handleSyncProviderModels() {
    setSyncingModels(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/models/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || `Synced ${data.synced} models from providers.`);
        fetchModels();
      } else {
        setErrorMsg(data.error || "Failed to sync provider models.");
      }
    } catch {
      setErrorMsg("Network error while syncing models.");
    }
    setSyncingModels(false);
  }

  // Ping statuses
  const [pingStatuses, setPingStatuses] = useState<Record<string, PingStatus>>({});

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [modelId, setModelId] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("ANTIGRAVITY");
  const [contextWindow, setContextWindow] = useState("128k");
  const [isActive, setIsActive] = useState(true);
  const [isPublic, setIsPublic] = useState(true);

  async function fetchModels() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/models");
      const json = await res.json();
      if (json.data) {
        setModels(json.data);
      } else if (json.error) {
        setErrorMsg(json.error);
      }
    } catch {
      setErrorMsg("Failed to connect to admin models API.");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchModels();
  }, []);

  function handleCopyModelId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handlePingModel(m: ModelItem) {
    setPingStatuses((prev) => ({
      ...prev,
      [m.modelId]: { latencyMs: 0, status: "PINGING", loading: true },
    }));

    try {
      if (m.isCombo) {
        const pingTarget = m.firstCandidate || m.modelId;
        const res = await fetch("/api/admin/combos/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId: pingTarget }),
        });
        const json = await res.json();
        setPingStatuses((prev) => ({
          ...prev,
          [m.modelId]: {
            latencyMs: json.latencyMs || 0,
            status: json.status === 200 ? "HEALTHY" : json.status === 429 ? "RATE_LIMITED" : "ERROR",
            loading: false,
            connectionName: `Combo (${m.comboStrategy || "Auto"})`,
            error: json.error,
          },
        }));
        return;
      }

      const res = await fetch("/api/admin/models/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: m.modelId, provider: m.provider }),
      });
      const json = await res.json();
      setPingStatuses((prev) => ({
        ...prev,
        [m.modelId]: {
          latencyMs: json.latencyMs || 0,
          status: json.status || "ERROR",
          loading: false,
          connectionName: json.connectionName,
          error: json.error,
        },
      }));
    } catch {
      setPingStatuses((prev) => ({
        ...prev,
        [m.modelId]: { latencyMs: 0, status: "ERROR", loading: false, error: "Network error" },
      }));
    }
  }

  async function handleToggleActive(m: ModelItem) {
    const nextState = !m.isActive;
    // Optimistic UI update
    setModels((prev) =>
      prev.map((item) => (item.id === m.id ? { ...item, isActive: nextState } : item))
    );

    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isActive: nextState }),
      });
      const json = await res.json();
      if (!json.success) {
        // Revert on error
        setModels((prev) =>
          prev.map((item) => (item.id === m.id ? { ...item, isActive: !nextState } : item))
        );
        setErrorMsg("Failed to update status.");
      }
    } catch {
      setModels((prev) =>
        prev.map((item) => (item.id === m.id ? { ...item, isActive: !nextState } : item))
      );
      setErrorMsg("Network error.");
    }
  }

  async function handleTogglePublic(m: ModelItem) {
    const nextState = !(m.isPublic !== false);
    // Optimistic UI update
    setModels((prev) =>
      prev.map((item) => (item.id === m.id ? { ...item, isPublic: nextState } : item))
    );

    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isPublic: nextState }),
      });
      const json = await res.json();
      if (!json.success) {
        // Revert on error
        setModels((prev) =>
          prev.map((item) => (item.id === m.id ? { ...item, isPublic: !nextState } : item))
        );
        setErrorMsg("Failed to update public visibility.");
      }
    } catch {
      setModels((prev) =>
        prev.map((item) => (item.id === m.id ? { ...item, isPublic: !nextState } : item))
      );
      setErrorMsg("Network error.");
    }
  }

  function openCreateModal() {
    setEditingModel(null);
    setModelId("");
    setName("");
    setProvider("ANTIGRAVITY");
    setContextWindow("128k");
    setIsActive(true);
    setIsPublic(true);
    setErrorMsg("");
    setModalOpen(true);
  }

  function openEditModal(m: ModelItem) {
    setEditingModel(m);
    setModelId(m.modelId);
    setName(m.name);
    setProvider(m.provider);
    setContextWindow(m.contextWindow || "128k");
    setIsActive(m.isActive);
    setIsPublic(m.isPublic !== false);
    setErrorMsg("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    const payload = {
      id: editingModel?.id,
      modelId,
      name,
      provider,
      contextWindow,
      isActive,
      isPublic,
    };

    try {
      const res = await fetch("/api/admin/models", {
        method: editingModel ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Model '${modelId}' saved successfully.`);
        setModalOpen(false);
        setTimeout(() => setSuccessMsg(""), 3000);
        fetchModels();
      } else {
        setErrorMsg(json.error || "Failed to save model.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
    setSubmitting(false);
  }

  async function handleDelete(m: ModelItem) {
    if (!confirm(`Are you sure you want to delete model "${m.modelId}"?`)) return;

    try {
      const res = await fetch(`/api/admin/models?id=${m.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Model '${m.modelId}' deleted.`);
        setTimeout(() => setSuccessMsg(""), 3000);
        fetchModels();
      } else {
        setErrorMsg(json.error || "Failed to delete model.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
  }

  const filtered = models.filter((m) => {
    if (providerFilter !== "ALL" && m.provider.toUpperCase() !== providerFilter.toUpperCase()) {
      return false;
    }
    if (visibilityFilter === "PUBLIC" && m.isPublic === false) {
      return false;
    }
    if (visibilityFilter === "HIDDEN" && m.isPublic !== false) {
      return false;
    }
    return `${m.modelId} ${m.name} ${m.provider}`.toLowerCase().includes(search.toLowerCase());
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const availableProviders = ["ALL", ...Array.from(new Set(models.map((m) => m.provider.toUpperCase())))];

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Admin Model Management"
          subtitle="Add, edit, test latency, and map LLMs to upstream multi-provider connections."
        >
          <div className="flex items-center gap-2">
            <button
              className="control btn-inline"
              onClick={handleSyncProviderModels}
              disabled={syncingModels}
              title="Sync and pull latest models from connected providers"
            >
              <RefreshCw size={13} strokeWidth={1.5} className={syncingModels ? "animate-spin" : ""} />
              <span>{syncingModels ? "Syncing..." : "Sync Providers"}</span>
            </button>
            <button className="primary btn-inline" onClick={openCreateModal}>
              <Plus size={13} />
              <span>Add New Model</span>
            </button>
          </div>
        </PageHead>

        {successMsg && (
          <div className="banner-alert mb-3">
            <CheckCircle2 size={16} className="text-green" />
            <div className="banner-text">
              <strong>Success!</strong>
              <p>{successMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="login-error mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Toolbar with Provider Filter, Visibility Filter, and Search */}
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: "14px", position: "relative", zIndex: 50 }}>
          <div className="flex items-center gap-2.5">
            <CustomDropdown
              size="md"
              value={providerFilter}
              onChange={(val) => {
                setProviderFilter(val);
                setPage(1);
              }}
              options={[
                {
                  value: "ALL",
                  label: "All Providers",
                  icon: <Network size={14} style={{ color: "var(--blue)" }} />,
                },
                ...availableProviders
                  .filter((p) => p !== "ALL")
                  .map((p) => ({
                    value: p,
                    label: getProviderDisplayName(p),
                    icon: (
                      <ProviderAvatar
                        slugOrId={getProviderSlug(p)}
                        name={p}
                        size={18}
                        imgSize={14}
                        className="shrink-0 rounded"
                        style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }}
                      />
                    ),
                  })),
              ]}
              minWidth={175}
              title="Filter models by upstream provider"
            />

            <CustomDropdown
              size="md"
              value={visibilityFilter}
              onChange={(val) => {
                setVisibilityFilter(val as any);
                setPage(1);
              }}
              options={[
                { value: "ALL", label: "Semua Visibilitas", icon: <Filter size={13} className="text-muted" /> },
                { value: "PUBLIC", label: "Publik Saja", icon: <Globe size={13} className="text-emerald-500" /> },
                { value: "HIDDEN", label: "Hidden Saja", icon: <EyeOff size={13} className="text-muted" /> },
              ]}
              minWidth={165}
              title="Filter visibilitas publik"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="toolbar-search" style={{ maxWidth: "260px" }}>
              <Search size={13} strokeWidth={1.5} />
              <input
                suppressHydrationWarning
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search Model ID or Name..."
              />
            </div>
            <button className="control btn-icon-only" onClick={fetchModels} title="Refresh Models">
              <RefreshCw size={13} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <article className="panel logs">
          <div className="logs-wrap">
            <table className="table" style={{ minWidth: "1150px" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: "220px" }}>Model ID</th>
                  <th style={{ minWidth: "180px" }}>Display Name</th>
                  <th style={{ minWidth: "120px" }}>Target Provider</th>
                  <th style={{ minWidth: "90px" }}>Context Window</th>
                  <th style={{ minWidth: "130px" }}>Upstream Latency</th>
                  <th style={{ minWidth: "110px" }}>Public View</th>
                  <th style={{ minWidth: "110px" }}>Gateway Status</th>
                  <th style={{ minWidth: "110px" }} className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted text-xs">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw size={16} className="animate-spin text-muted" />
                        <span>Loading models from database...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted text-xs">
                      <div className="flex flex-col items-center gap-2">
                        <Boxes size={20} className="text-muted" style={{ opacity: 0.4 }} />
                        <span>No models found matching criteria.</span>
                        <button className="primary btn-inline text-xs mt-1" onClick={openCreateModal}>
                          <Plus size={12} />
                          <span>Add Your First Model</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((m) => {
                    const isCopied = copiedId === m.modelId;
                    const ping = pingStatuses[m.modelId];

                    return (
                      <tr key={m.id}>
                        <td className="cell-project">
                          <div className="flex items-center gap-2">
                            <span className="project-icon">
                              {m.isCombo ? (
                                <Layers size={13} strokeWidth={1.75} className="text-blue" />
                              ) : (
                                <Boxes size={13} strokeWidth={1.5} />
                              )}
                            </span>
                            <span className="mono text-blue font-semibold">{m.modelId}</span>
                            <button
                              className={`btn-icon-subtle ${isCopied ? "text-green" : "text-muted hover:text-ink"}`}
                              style={{
                                padding: "2px",
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              onClick={() => handleCopyModelId(m.modelId)}
                              title={isCopied ? "Copied Model ID!" : `Copy "${m.modelId}"`}
                            >
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>
                        <td className="cell-strong">{m.name}</td>
                        <td>
                          {m.isCombo ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                border: "1px solid #bfdbfe",
                              }}
                              title={`Combo Model with ${m.comboItems?.length || 0} targets (${m.comboStrategy})`}
                            >
                              <Layers size={11} strokeWidth={2} />
                              <span>COMBO</span>
                            </span>
                          ) : (
                            <span
                              className={`env ${
                                m.provider.toLowerCase().includes("openai")
                                  ? "env-production"
                                  : m.provider.toLowerCase().includes("anthropic")
                                  ? "env-staging"
                                  : "env-preview"
                              }`}
                            >
                              {m.provider}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="mono text-xs font-medium" style={{ color: "#475569" }}>
                            {m.contextWindow}
                          </span>
                        </td>
                        <td>
                          {ping ? (
                            ping.loading ? (
                              <span className="text-xs text-muted flex items-center gap-1.5">
                                <RefreshCw size={10} className="animate-spin" />
                                <span>Pinging...</span>
                              </span>
                            ) : ping.status === "HEALTHY" ? (
                              <span
                                className="mono text-xs font-semibold flex items-center gap-1.5"
                                style={{ color: "#059669" }}
                                title={`Pinged via ${ping.connectionName || "Upstream"}`}
                              >
                                <Zap size={11} />
                                <span>{ping.latencyMs} ms</span>
                              </span>
                            ) : ping.status === "RATE_LIMITED" ? (
                              <span className="mono text-xs text-amber-600 font-semibold flex items-center gap-1">
                                <AlertCircle size={11} />
                                <span>429 Limited</span>
                              </span>
                            ) : ping.status === "INVALID_MODEL" ? (
                              <span
                                className="mono text-xs text-red font-semibold flex items-center gap-1"
                                title={ping.error || "Model tidak dikenali oleh provider"}
                              >
                                <AlertCircle size={11} />
                                <span>Invalid Model</span>
                              </span>
                            ) : ping.status === "NO_CONNECTION" ? (
                              <span
                                className="mono text-xs text-amber-600 font-semibold flex items-center gap-1"
                                title={ping.error || "Tidak ada akun koneksi aktif"}
                              >
                                <AlertCircle size={11} />
                                <span>No Connection</span>
                              </span>
                            ) : (
                              <span
                                className="mono text-xs text-red font-semibold flex items-center gap-1"
                                title={ping.error || "Offline"}
                              >
                                <AlertCircle size={11} />
                                <span>{ping.latencyMs > 0 ? `${ping.latencyMs} ms (Err)` : "Offline"}</span>
                              </span>
                            )
                          ) : (
                            <button
                              className="control text-xs flex items-center gap-1.5 text-muted hover:text-blue"
                              style={{ height: "26px", padding: "0 8px" }}
                              onClick={() => handlePingModel(m)}
                              title="Test live upstream latency"
                            >
                              <Zap size={10} />
                              <span>Test Ping</span>
                            </button>
                          )}
                        </td>
                        <td>
                          <div
                            className="flex items-center gap-1.5 cursor-pointer select-none"
                            onClick={() => handleTogglePublic(m)}
                            title={
                              m.isPublic !== false
                                ? "Model ini tampil di katalog publik (/models & /v1/models). Klik untuk sembunyikan."
                                : "Model ini disembunyikan dari publik. Klik untuk tampilkan."
                            }
                          >
                            <label
                              className="switch-label pointer-events-none"
                              style={{ transform: "scale(0.85)", transformOrigin: "left center" }}
                            >
                              <input
                                suppressHydrationWarning
                                type="checkbox"
                                checked={m.isPublic !== false}
                                readOnly
                              />
                              <span />
                            </label>
                            <span
                              className={`text-[11.5px] font-medium flex items-center gap-1 ${
                                m.isPublic !== false ? "text-emerald-600" : "text-muted"
                              }`}
                            >
                              {m.isPublic !== false ? (
                                <>
                                  <Globe size={11} strokeWidth={1.75} />
                                  <span>Public</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff size={11} strokeWidth={1.75} />
                                  <span>Hidden</span>
                                </>
                              )}
                            </span>
                          </div>
                        </td>
                        <td>
                          <button
                            onClick={() => handleToggleActive(m)}
                            className={`status-dot ${m.isActive ? "online" : "idle"}`}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              padding: 0,
                            }}
                            title="Click to toggle active status"
                          >
                            {m.isActive ? "Active" : "Disabled"}
                          </button>
                        </td>
                        <td className="text-right">
                          <div className="action-btn-group">
                            <button
                              className="action-btn"
                              onClick={() => handlePingModel(m)}
                              title={m.isCombo ? "Test live latency on primary candidate" : "Test live latency"}
                            >
                              <Zap size={12} strokeWidth={1.5} />
                            </button>
                            {m.isCombo && (
                              <a
                                href="/admin/combos"
                                className="action-btn"
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                title="Manage combo candidates & strategy in Combos Hub"
                              >
                                <ExternalLink size={12} strokeWidth={1.75} />
                              </a>
                            )}
                            <button
                              className="action-btn edit"
                              onClick={() => openEditModal(m)}
                              title="Edit Model Specifications"
                            >
                              <Edit2 size={13} strokeWidth={1.75} />
                            </button>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDelete(m)}
                              title={m.isCombo ? "Delete Combo Permanently" : "Delete Model Permanently"}
                            >
                              <Trash2 size={13} strokeWidth={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <div className="table-footer-left">
              <span className="table-footer-text">
                Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, filtered.length)} of {filtered.length} models
              </span>
              <div className="per-page-wrap flex items-center gap-2">
                <span className="text-muted text-xs">Per page:</span>
                <CustomDropdown
                  size="sm"
                  value={String(pageSize)}
                  onChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                  options={[
                    { value: "5", label: "5" },
                    { value: "10", label: "10" },
                    { value: "25", label: "25" },
                    { value: "50", label: "50" },
                  ]}
                  minWidth={72}
                  align="right"
                />
              </div>
            </div>

            <div className="pager">
              <button
                className="pager-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={11} />
                <span>Prev</span>
              </button>
              <span className="pager-info">
                {page}/{totalPages}
              </span>
              <button
                className="pager-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                <span>Next</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </article>

        {/* Modal Popup */}
        {modalOpen && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "480px" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Boxes size={15} className="text-blue" style={{ flexShrink: 0 }} />
                  <h3 className="modal-title-text">
                    {editingModel ? `Edit Model: ${editingModel.modelId}` : "Add New AI Model"}
                  </h3>
                </div>
                <button className="btn-close" onClick={() => setModalOpen(false)}>
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {editingModel?.isCombo && (
                  <div className="banner-alert mb-3">
                    <Layers size={14} className="text-blue shrink-0" />
                    <div className="banner-text">
                      <strong>Combo Model Virtual Configuration</strong>
                      <p className="text-xs">
                        This is a Combo Model ({editingModel.contextWindow}). Target candidates and failover/rotate strategy can be configured in the{" "}
                        <a href="/admin/combos" className="text-blue font-semibold underline">
                          Combo Models Hub →
                        </a>
                      </p>
                    </div>
                  </div>
                )}

                {!editingModel?.isCombo && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-semibold text-ink block mb-1">Target Provider</label>
                      <CustomDropdown
                        size="md"
                        width="100%"
                        value={provider}
                        onChange={(newProv) => {
                          setProvider(newProv);
                          const pUpper = newProv.toUpperCase();
                          let prefix = "";
                          if (pUpper === "ANTIGRAVITY" || pUpper === "GOOGLE") prefix = "ag/";
                          else if (pUpper === "OPENAI_CODEX" || pUpper === "OPENAI" || pUpper === "CODEX") prefix = "cx/";
                          else if (pUpper === "CLAUDE_CODE" || pUpper === "ANTHROPIC") prefix = "cc/";
                          else if (pUpper === "GEMINI") prefix = "gem/";
                          else if (pUpper === "OPENROUTER") prefix = "or/";
                          else if (pUpper === "DEEPSEEK") prefix = "deepseek/";
                          else if (pUpper === "ALIBABA" || pUpper === "QWEN") prefix = "qwen/";
                          else if (pUpper === "OLLAMA_CLOUD" || pUpper === "OLLAMA") prefix = "ollama/";
                          else if (pUpper === "GROQ") prefix = "groq/";
                          else if (pUpper === "MISTRAL") prefix = "mistral/";
                          else if (pUpper === "TOGETHER") prefix = "together/";
                          else if (pUpper === "KIMI") prefix = "kimi/";

                          if (prefix && (!modelId || !modelId.includes("/"))) {
                            setModelId(`${prefix}${modelId.replace(/^[a-z0-9_-]+\//i, "")}`);
                          }
                        }}
                        options={[
                          { value: "ANTIGRAVITY", label: "Antigravity (ag/)", icon: <ProviderAvatar slugOrId="antigravity" name="Antigravity" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "GEMINI", label: "Google Gemini (gem/)", icon: <ProviderAvatar slugOrId="gemini-cli" name="Gemini" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "OPENAI_CODEX", label: "OpenAI Codex (cx/)", icon: <ProviderAvatar slugOrId="codex" name="Codex" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "CLAUDE_CODE", label: "Claude Code (cc/)", icon: <ProviderAvatar slugOrId="claude" name="Claude" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "DEEPSEEK", label: "DeepSeek (deepseek/)", icon: <ProviderAvatar slugOrId="deepseek" name="DeepSeek" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "ALIBABA", label: "Alibaba Qwen (qwen/)", icon: <ProviderAvatar slugOrId="alibaba" name="Alibaba" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "OLLAMA_CLOUD", label: "Ollama Cloud (ollama/)", icon: <ProviderAvatar slugOrId="ollama" name="Ollama" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "GROQ", label: "Groq (groq/)", icon: <ProviderAvatar slugOrId="groq" name="Groq" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "MISTRAL", label: "Mistral (mistral/)", icon: <ProviderAvatar slugOrId="mistral" name="Mistral" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "TOGETHER", label: "Together AI (together/)", icon: <ProviderAvatar slugOrId="together" name="Together" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "OPENROUTER", label: "OpenRouter (or/)", icon: <ProviderAvatar slugOrId="openrouter" name="OpenRouter" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "KIMI", label: "Kimi Moonshot (kimi/)", icon: <ProviderAvatar slugOrId="kimi" name="Kimi" size={18} imgSize={14} className="shrink-0 rounded" style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }} /> },
                          { value: "CUSTOM", label: "Custom Provider", icon: <Network size={14} className="text-muted" /> },
                        ]}
                      />
                    </div>
                    <div>
                      <label>Context Window</label>
                      <input
                        suppressHydrationWarning
                        type="text"
                        className="control w-full"
                        value={contextWindow}
                        onChange={(e) => setContextWindow(e.target.value)}
                        placeholder="128k, 256k, 1M"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="form-group mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label>1. Model ID (API Route Identifier)</label>
                    <span className="text-[11px] text-muted mono">
                      Prefix:{" "}
                      <strong className="text-blue">
                        {provider === "ANTIGRAVITY"
                          ? "ag/"
                          : provider === "OPENAI_CODEX"
                          ? "cx/"
                          : provider === "CLAUDE_CODE"
                          ? "cc/"
                          : provider === "GEMINI"
                          ? "gem/"
                          : provider === "DEEPSEEK"
                          ? "deepseek/"
                          : provider === "ALIBABA"
                          ? "qwen/"
                          : provider === "OLLAMA_CLOUD"
                          ? "ollama/"
                          : provider === "GROQ"
                          ? "groq/"
                          : provider === "MISTRAL"
                          ? "mistral/"
                          : provider === "TOGETHER"
                          ? "together/"
                          : provider === "OPENROUTER"
                          ? "or/"
                          : provider === "KIMI"
                          ? "kimi/"
                          : ""}
                      </strong>
                    </span>
                  </div>
                  <input
                    suppressHydrationWarning
                    type="text"
                    className="control w-full mono text-xs"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder={
                      provider === "ANTIGRAVITY"
                        ? "e.g. ag/gemini-2.5-flash"
                        : provider === "OPENAI_CODEX"
                        ? "e.g. cx/gpt-4o"
                        : "e.g. prefix/model-name"
                    }
                    required
                  />
                  <p className="text-[11px] text-muted mt-1">
                    Gunakan prefix standar provider agar perutean gateway upstream otomatis dan akurat.
                  </p>
                </div>

                <div className="form-group mb-3">
                  <label>2. Display Name</label>
                  <input
                    suppressHydrationWarning
                    type="text"
                    className="control w-full text-xs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Gemini 2.5 Flash"
                    required
                  />
                </div>

                <div className="form-group mt-3">
                  <label className="switch-label">
                    <input
                      suppressHydrationWarning
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span>Active & Available for AI Gateway Routing</span>
                  </label>
                </div>

                <div className="form-group mt-2">
                  <label className="switch-label">
                    <input
                      suppressHydrationWarning
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    <span>Tampilkan ke Publik (Visible in /models & /v1/models)</span>
                  </label>
                </div>

                <div className="modal-actions">
                  <button type="button" className="control" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary btn-inline" disabled={submitting}>
                    <Sparkles size={13} />
                    <span>{submitting ? "Saving..." : editingModel ? "Update Model" : "Create Model"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
