"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Layers,
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Zap,
  Globe,
  EyeOff,
  ArrowDownUp,
  ShieldAlert,
  Clock,
  ArrowUp,
  ArrowDown,
  Info,
  Coins,
} from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";

interface ComboItem {
  id: string;
  comboId: string;
  name: string;
  description: string | null;
  strategy: "FALLBACK" | "ROUND_ROBIN";
  cooldownSeconds: number;
  rateInPer1k?: number;
  rateOutPer1k?: number;
  isActive: boolean;
  isPublic: boolean;
  createdAt: string;
  items: {
    id: string;
    modelId: string;
    priority: number;
    weight: number;
    isActive: boolean;
  }[];
}

interface AvailableModel {
  id: string;
  modelId: string;
  name: string;
  provider: string;
}

const PROVIDER_INFO: Record<string, { label: string; color: string }> = {
  OPENAI_CODEX: { label: "OpenAI Codex", color: "#10a37f" },
  OPENAI: { label: "OpenAI Codex", color: "#10a37f" },
  CODEX: { label: "OpenAI Codex", color: "#10a37f" },
  ANTIGRAVITY: { label: "Antigravity", color: "#4285f4" },
  GOOGLE: { label: "Antigravity", color: "#4285f4" },
  OPENROUTER: { label: "OpenRouter", color: "#8b5cf6" },
  DEEPSEEK: { label: "DeepSeek", color: "#0ea5e9" },
  OLLAMA_CLOUD: { label: "Ollama Cloud", color: "#059669" },
  OLLAMA: { label: "Ollama Cloud", color: "#059669" },
  CLAUDE_CODE: { label: "Claude Code", color: "#d97706" },
  ANTHROPIC: { label: "Claude Code", color: "#d97706" },
  KIMI: { label: "Kimi Moonshot", color: "#6366f1" },
  ALIBABA: { label: "Alibaba Qwen", color: "#f97316" },
  QWEN: { label: "Alibaba Qwen", color: "#f97316" },
  GROQ: { label: "Groq", color: "#f43f5e" },
  MISTRAL: { label: "Mistral AI", color: "#ec4899" },
  TOGETHER: { label: "Together AI", color: "#8b5cf6" },
};

function getCanonicalProvider(provider: string): string {
  const p = (provider || "").toUpperCase().trim();
  if (p === "OPENAI" || p === "CODEX") return "OPENAI_CODEX";
  if (p === "GOOGLE" || p === "GEMINI_API") return "ANTIGRAVITY";
  if (p === "OLLAMA") return "OLLAMA_CLOUD";
  if (p === "ANTHROPIC") return "CLAUDE_CODE";
  if (p === "QWEN" || p === "DASHSCOPE") return "ALIBABA";
  return p;
}

export default function AdminCombosPage() {
  const [combos, setCombos] = useState<ComboItem[]>([]);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [strategyFilter, setStrategyFilter] = useState<"ALL" | "FALLBACK" | "ROUND_ROBIN">("ALL");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboItem | null>(null);
  const [comboId, setComboId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [strategy, setStrategy] = useState<"FALLBACK" | "ROUND_ROBIN">("FALLBACK");
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [isActive, setIsActive] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [rateInPer1k, setRateInPer1k] = useState(25);
  const [rateOutPer1k, setRateOutPer1k] = useState(100);
  const [selectedItems, setSelectedItems] = useState<{ modelId: string; priority: number; weight: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [manualModelInput, setManualModelInput] = useState("");
  const [syncingModels, setSyncingModels] = useState(false);

  // Ping Testing State
  const [pingResults, setPingResults] = useState<Record<string, { latencyMs?: number; status?: number; loading?: boolean; error?: string }>>({});

  async function fetchCombos() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/combos");
      const json = await res.json();
      if (json.success) {
        setCombos(json.combos || []);
        setCooldowns(json.cooldowns || {});
      } else if (json.error) {
        setErrorMsg(json.error);
      }
    } catch {
      setErrorMsg("Failed to connect to Combos API.");
    }
    setLoading(false);
  }

  async function fetchAvailableModels() {
    try {
      const res = await fetch("/api/admin/combos/available-models");
      const json = await res.json();
      if (json.data) {
        setAvailableModels(json.data);
      }
    } catch {}
  }

  async function handleSyncProviderModels() {
    setSyncingModels(true);
    try {
      const res = await fetch("/api/admin/models/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(json.message || "Provider models synced successfully!");
        setTimeout(() => setSuccessMsg(""), 3000);
        await fetchAvailableModels();
      }
    } catch {}
    setSyncingModels(false);
  }

  function handleAddManualModel() {
    if (!manualModelInput.trim()) return;
    const clean = manualModelInput.trim();
    if (selectedItems.some((si) => si.modelId.toLowerCase() === clean.toLowerCase())) {
      alert("Model is already in stack.");
      return;
    }
    setSelectedItems([
      ...selectedItems,
      {
        modelId: clean,
        priority: selectedItems.length + 1,
        weight: 1,
      },
    ]);
    setManualModelInput("");
  }

  useEffect(() => {
    fetchCombos();
    fetchAvailableModels();
  }, []);

  function handleCopyComboId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function openCreateModal() {
    setEditingCombo(null);
    setComboId("");
    setName("");
    setDescription("");
    setStrategy("FALLBACK");
    setCooldownSeconds(60);
    setIsActive(true);
    setIsPublic(true);
    setRateInPer1k(25);
    setRateOutPer1k(100);
    setSelectedItems([]);
    setPickerSearch("");
    setManualModelInput("");
    setModalOpen(true);
  }

  function openEditModal(combo: ComboItem) {
    setEditingCombo(combo);
    setComboId(combo.comboId);
    setName(combo.name);
    setDescription(combo.description || "");
    setStrategy(combo.strategy);
    setCooldownSeconds(combo.cooldownSeconds);
    setIsActive(combo.isActive);
    setIsPublic(combo.isPublic);
    setRateInPer1k(combo.rateInPer1k !== undefined ? combo.rateInPer1k : 25);
    setRateOutPer1k(combo.rateOutPer1k !== undefined ? combo.rateOutPer1k : 100);
    setSelectedItems(
      combo.items.map((it) => ({
        modelId: it.modelId,
        priority: it.priority,
        weight: it.weight,
      }))
    );
    setPickerSearch("");
    setManualModelInput("");
    setModalOpen(true);
  }

  function handleRemoveItem(index: number) {
    const updated = selectedItems.filter((_, idx) => idx !== index).map((it, idx) => ({
      ...it,
      priority: idx + 1,
    }));
    setSelectedItems(updated);
  }

  function handleMoveItem(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === selectedItems.length - 1) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const copy = [...selectedItems];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    const reordered = copy.map((it, idx) => ({ ...it, priority: idx + 1 }));
    setSelectedItems(reordered);
  }

  async function handleToggleActive(combo: ComboItem) {
    const updatedStatus = !combo.isActive;
    setCombos(combos.map((c) => (c.id === combo.id ? { ...c, isActive: updatedStatus } : c)));
    try {
      await fetch(`/api/admin/combos/${combo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: updatedStatus }),
      });
    } catch {
      fetchCombos();
    }
  }

  async function handleTogglePublic(combo: ComboItem) {
    const updatedStatus = !combo.isPublic;
    setCombos(combos.map((c) => (c.id === combo.id ? { ...c, isPublic: updatedStatus } : c)));
    try {
      await fetch(`/api/admin/combos/${combo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: updatedStatus }),
      });
    } catch {
      fetchCombos();
    }
  }

  async function handleDelete(combo: ComboItem) {
    if (!confirm(`Are you sure you want to delete combo '${combo.name}' (${combo.comboId})?`)) return;
    try {
      const res = await fetch(`/api/admin/combos/${combo.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Combo '${combo.name}' deleted successfully.`);
        setTimeout(() => setSuccessMsg(""), 3000);
        fetchCombos();
      } else {
        setErrorMsg(json.error || "Failed to delete combo.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
  }

  async function handlePingModel(modelId: string) {
    setPingResults((prev) => ({ ...prev, [modelId]: { loading: true } }));
    try {
      const res = await fetch("/api/admin/combos/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      const json = await res.json();
      setPingResults((prev) => ({
        ...prev,
        [modelId]: {
          latencyMs: json.latencyMs,
          status: json.status,
          loading: false,
          error: json.error,
        },
      }));
    } catch (err: any) {
      setPingResults((prev) => ({
        ...prev,
        [modelId]: { loading: false, error: err.message },
      }));
    }
  }

  async function handlePingCombo(combo: ComboItem) {
    for (const item of combo.items) {
      handlePingModel(item.modelId);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!comboId.trim()) {
      alert("Combo ID is required.");
      return;
    }
    if (!name.trim()) {
      alert("Display Name is required.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("Please add at least 1 candidate model to this combo.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    const payload = {
      comboId: comboId.trim().toLowerCase(),
      name: name.trim(),
      description: description.trim() || null,
      strategy,
      cooldownSeconds: Number(cooldownSeconds) || 60,
      rateInPer1k: Number(rateInPer1k) >= 0 ? Number(rateInPer1k) : 25,
      rateOutPer1k: Number(rateOutPer1k) >= 0 ? Number(rateOutPer1k) : 100,
      isActive,
      isPublic,
      items: selectedItems,
    };

    try {
      let res: Response;
      if (editingCombo) {
        res = await fetch(`/api/admin/combos/${editingCombo.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/admin/combos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (json.success) {
        setSuccessMsg(editingCombo ? "Combo updated successfully!" : "Combo created successfully!");
        setTimeout(() => setSuccessMsg(""), 3000);
        setModalOpen(false);
        fetchCombos();
      } else {
        setErrorMsg(json.error || "Failed to save combo.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
    setSaving(false);
  }

  // Filter combos
  const filtered = combos.filter((c) => {
    const matchSearch =
      c.comboId.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.items.some((it) => it.modelId.toLowerCase().includes(search.toLowerCase()));

    const matchStrategy = strategyFilter === "ALL" || c.strategy === strategyFilter;
    return matchSearch && matchStrategy;
  });

  const activeCombosCount = combos.filter((c) => c.isActive).length;
  const cooldownKeys = Object.keys(cooldowns);

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Combo Models & Auto-Rotate"
          subtitle="Configure multi-model failover chains (Tier 1 -> Tier 2) and round-robin auto-rotation."
        >
          <div className="flex items-center gap-2">
            <button
              className="control btn-inline"
              onClick={handleSyncProviderModels}
              disabled={syncingModels}
              title="Sync all models from connected providers into database"
            >
              <RefreshCw size={13} strokeWidth={1.5} className={syncingModels ? "animate-spin" : ""} />
              <span>{syncingModels ? "Syncing..." : "Sync Providers"}</span>
            </button>
            <button className="primary btn-inline" onClick={openCreateModal}>
              <Plus size={13} strokeWidth={2} />
              <span>Create Combo</span>
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

        {/* KPI Summary Cards */}
        <div className="cards mb-4">
          <article className="card metric">
            <div className="metric-header">
              <label>TOTAL COMBOS</label>
            </div>
            <div className="metric-body">
              <strong>{combos.length}</strong>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-green font-medium">● {activeCombosCount} Active</span>
              <span className="text-xs text-muted">
                ● {combos.length - activeCombosCount} Inactive
              </span>
            </div>
          </article>

          <article className="card metric">
            <div className="metric-header">
              <label>STRATEGIES</label>
            </div>
            <div className="metric-body">
              <strong>
                {combos.filter((c) => c.strategy === "ROUND_ROBIN").length} RR /{" "}
                {combos.filter((c) => c.strategy === "FALLBACK").length} FB
              </strong>
            </div>
            <div className="text-xs text-muted mt-1">
              Round-Robin rotation & Tiered failover
            </div>
          </article>

          <article className="card metric">
            <div className="metric-header">
              <label>RATE-LIMITED MODELS IN COOLDOWN</label>
            </div>
            <div className="metric-body">
              <strong style={{ color: cooldownKeys.length > 0 ? "#d97706" : "#059669" }}>
                {cooldownKeys.length}
              </strong>
            </div>
            <div className="text-xs text-muted mt-1">
              {cooldownKeys.length > 0
                ? "Auto-cooldown actively shielding throttled models"
                : "All upstream models are healthy"}
            </div>
          </article>

          <article className="card metric">
            <div className="metric-header">
              <label>ROUTING & ALIASES</label>
            </div>
            <div className="metric-body">
              <strong className="mono text-sm text-blue">Smart Gateway</strong>
            </div>
            <div className="text-xs text-muted mt-1">
              Flexible alias or combo/ prefix support
            </div>
          </article>
        </div>

        {/* Cooldown Alert Banner if any model throttled */}
        {cooldownKeys.length > 0 && (
          <div className="banner-alert mb-4" style={{ borderColor: "#f59e0b", backgroundColor: "#fffbeb" }}>
            <ShieldAlert size={16} className="text-amber-600 shrink-0" />
            <div className="banner-text">
              <strong className="text-amber-800">Active Rate-Limit Cooldown in Progress</strong>
              <p className="text-amber-700 text-xs">
                The gateway is currently auto-routing requests away from throttled models:{" "}
                {cooldownKeys.map((k) => `${k} (${cooldowns[k]}s remaining)`).join(", ")}.
              </p>
            </div>
          </div>
        )}

        {/* Toolbar Filter */}
        <div className="toolbar">
          <div className="toolbar-search">
            <Search size={13} strokeWidth={1.5} />
            <input
              suppressHydrationWarning
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by combo ID, name, or candidate model ID..."
            />
          </div>

          <div className="toolbar-filters flex items-center gap-2">
            <CustomDropdown
              size="sm"
              value={strategyFilter}
              onChange={(val) => setStrategyFilter(val as any)}
              options={[
                {
                  value: "ALL",
                  label: "All Strategies",
                  icon: <Layers size={13} style={{ color: "var(--blue)" }} />,
                },
                {
                  value: "FALLBACK",
                  label: "Priority Fallback (Tiered)",
                  icon: <ShieldAlert size={13} className="text-amber-500" />,
                },
                {
                  value: "ROUND_ROBIN",
                  label: "Auto-Rotate (Round-Robin)",
                  icon: <RefreshCw size={13} className="text-blue" />,
                },
              ]}
              minWidth={190}
              title="Filter by routing strategy"
            />
            <button
              type="button"
              className="control btn-icon-only"
              onClick={fetchCombos}
              disabled={loading}
              title="Refresh combo list"
            >
              <RefreshCw size={13} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Main Combos List */}
        <article className="panel logs" style={{ width: "100%", overflow: "hidden" }}>
          <div className="logs-wrap" style={{ overflowX: "auto", width: "100%" }}>
            <table className="table" style={{ width: "100%", minWidth: "980px" }}>
              <thead>
                <tr>
                  <th style={{ width: "220px", minWidth: "200px" }}>Combo Identifier</th>
                  <th style={{ width: "150px", minWidth: "140px" }}>Strategy</th>
                  <th style={{ width: "170px", minWidth: "150px" }}>Credit Cost</th>
                  <th style={{ minWidth: "240px" }}>Candidate Stack & Order</th>
                  <th style={{ width: "90px", minWidth: "85px" }}>Cooldown</th>
                  <th style={{ width: "110px", minWidth: "105px" }}>Public View</th>
                  <th style={{ width: "100px", minWidth: "95px" }}>Status</th>
                  <th style={{ width: "130px", minWidth: "130px", paddingRight: "16px" }} className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted text-xs">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw size={16} className="animate-spin text-muted" />
                        <span>Loading combos and routing state...</span>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8">
                      <Layers size={24} className="mx-auto text-muted mb-2 opacity-50" />
                      <p className="text-xs text-muted mb-2">No combo models configured yet.</p>
                      <button className="primary btn-inline text-xs" onClick={openCreateModal}>
                        <Plus size={12} />
                        <span>Create First Combo</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  filtered.map((combo) => (
                    <tr key={combo.id}>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="mono font-semibold text-xs text-blue">
                              {combo.comboId}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyComboId(combo.comboId)}
                              className={`btn-icon-subtle ${copiedId === combo.comboId ? "text-green" : "text-muted hover:text-ink"}`}
                              title={copiedId === combo.comboId ? "Copied!" : `Copy "${combo.comboId}"`}
                            >
                              {copiedId === combo.comboId ? (
                                <Check size={11} className="text-green" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          </div>
                          <span className="text-xs font-medium text-foreground">
                            {combo.name}
                          </span>
                          {combo.description && (
                            <span className="text-[11px] text-muted line-clamp-1">
                              {combo.description}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        {combo.strategy === "ROUND_ROBIN" ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold"
                            style={{
                              backgroundColor: "#e0f2fe",
                              color: "#0369a1",
                              border: "1px solid #bae6fd",
                            }}
                            title="Rotates sequentially per request to balance load and multiply quota"
                          >
                            <ArrowDownUp size={11} />
                            <span>Round-Robin</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold"
                            style={{
                              backgroundColor: "#fef3c7",
                              color: "#92400e",
                              border: "1px solid #fde68a",
                            }}
                            title="Tries Tier 1 first; only falls back to Tier 2 upon 429/quota exhaustion"
                          >
                            <ShieldAlert size={11} />
                            <span>Priority Fallback</span>
                          </span>
                        )}
                      </td>

                      <td>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#1e293b" }}>
                            <Coins size={12} className="text-amber-500 shrink-0" />
                            <span>{combo.rateInPer1k ?? 25} In / {combo.rateOutPer1k ?? 100} Out</span>
                          </div>
                          <span className="text-[10.5px] text-muted">Credits / 1k tokens</span>
                        </div>
                      </td>

                      <td style={{ whiteSpace: "normal", padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                          {combo.items.map((item, idx) => {
                            const isCooling = Boolean(cooldowns[item.modelId.toLowerCase()]);
                            const remaining = cooldowns[item.modelId.toLowerCase()];
                            const ping = pingResults[item.modelId];

                            return (
                              <div
                                key={item.id || idx}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontFamily: "'JetBrains Mono', monospace",
                                  backgroundColor: isCooling ? "#fef2f2" : "#f8fafc",
                                  border: isCooling ? "1px solid #fca5a5" : "1px solid #e2e8f0",
                                  color: isCooling ? "#991b1b" : "#334155",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 700,
                                    fontSize: "9.5px",
                                    padding: "1px 5px",
                                    borderRadius: "4px",
                                    backgroundColor: combo.strategy === "ROUND_ROBIN" ? "#e2e8f0" : "#dbeafe",
                                    color: combo.strategy === "ROUND_ROBIN" ? "#475569" : "#1d4ed8",
                                  }}
                                >
                                  {combo.strategy === "ROUND_ROBIN" ? `W:${item.weight}` : `T${item.priority}`}
                                </span>
                                <span style={{ fontWeight: 500 }}>{item.modelId}</span>

                                {isCooling && (
                                  <span
                                    className="flex items-center gap-0.5 text-[10px] font-bold text-red ml-1"
                                    title={`Rate limited. Cooldown active for ${remaining}s`}
                                  >
                                    <Clock size={10} />
                                    <span>{remaining}s</span>
                                  </span>
                                )}

                                {ping && !isCooling && (
                                  <span
                                    className={`text-[10px] font-bold ml-1 ${
                                      ping.status === 200 ? "text-emerald-600" : "text-amber-600"
                                    }`}
                                  >
                                    {ping.loading
                                      ? "..."
                                      : ping.latencyMs
                                      ? `${ping.latencyMs}ms`
                                      : "err"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="mono text-xs text-muted">
                        {combo.cooldownSeconds}s
                      </td>

                      <td>
                        <div
                          className="flex items-center gap-1.5 cursor-pointer select-none"
                          onClick={() => handleTogglePublic(combo)}
                          title={
                            combo.isPublic
                              ? "Model ini tampil di publik. Klik untuk sembunyikan."
                              : "Model ini disembunyikan. Klik untuk tampilkan."
                          }
                        >
                          <label
                            className="switch-label pointer-events-none"
                            style={{ transform: "scale(0.82)", transformOrigin: "left center", margin: 0 }}
                          >
                            <input
                              suppressHydrationWarning
                              type="checkbox"
                              checked={combo.isPublic}
                              readOnly
                            />
                            <span />
                          </label>
                          <span
                            className={`text-[11.5px] font-medium flex items-center gap-1 ${
                              combo.isPublic ? "text-emerald-600" : "text-muted"
                            }`}
                          >
                            {combo.isPublic ? (
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
                          onClick={() => handleToggleActive(combo)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 9px",
                            borderRadius: "999px",
                            border: combo.isActive ? "1px solid #d1fae5" : "1px solid #e2e8f0",
                            backgroundColor: combo.isActive ? "#ecfdf5" : "#f8fafc",
                            color: combo.isActive ? "#065f46" : "#64748b",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                          title="Click to toggle status"
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: combo.isActive ? "#10b981" : "#94a3b8",
                            }}
                          />
                          <span>{combo.isActive ? "Active" : "Disabled"}</span>
                        </button>
                      </td>

                      <td className="text-right" style={{ paddingRight: "16px" }}>
                        <div className="action-btn-group" style={{ justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="action-btn zap"
                            onClick={() => handlePingCombo(combo)}
                            title="Ping test all candidate models in this combo"
                          >
                            <Zap size={12} strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            className="action-btn edit"
                            onClick={() => openEditModal(combo)}
                            title="Edit Combo Specifications"
                          >
                            <Edit2 size={12} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={() => handleDelete(combo)}
                            title="Delete Combo Permanently"
                          >
                            <Trash2 size={12} strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        {/* Create / Edit Modal */}
        {modalOpen && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "680px", maxHeight: "90vh", overflowY: "auto" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Layers size={16} className="text-blue" style={{ flexShrink: 0 }} />
                  <h3 className="modal-title-text">
                    {editingCombo ? `Edit Combo: ${editingCombo.name}` : "Create New Combo Model"}
                  </h3>
                </div>
                <button className="btn-close" onClick={() => setModalOpen(false)}>
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Row 1: Combo ID + Display Name */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label>Virtual Model Alias (Combo ID)</label>
                    <input
                      suppressHydrationWarning
                      type="text"
                      className="control w-full mono text-xs"
                      value={comboId}
                      onChange={(e) => setComboId(e.target.value)}
                      placeholder="e.g. gpt-5.5 or free-rotation"
                      required
                    />
                    <p className="text-[11px] text-muted" style={{ marginTop: "4px" }}>
                      Clients call this as model: <code className="mono text-blue font-semibold">{comboId || "alias"}</code> — no prefix needed
                    </p>
                  </div>

                  <div className="form-group">
                    <label>Display Name</label>
                    <input
                      suppressHydrationWarning
                      type="text"
                      className="control w-full text-xs"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. GPT 5.5 Auto-Rotate Stack"
                      required
                    />
                  </div>
                </div>

                {/* Row 2: Description */}
                <div className="form-group">
                  <label>Description (Optional)</label>
                  <input
                    suppressHydrationWarning
                    type="text"
                    className="control w-full text-xs"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description for public catalogue & API callers"
                  />
                </div>

                {/* Row 3: Strategy + Cooldown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label>Routing Strategy</label>
                    <CustomDropdown
                      size="md"
                      value={strategy}
                      onChange={(val) => setStrategy(val as any)}
                      options={[
                        {
                          value: "FALLBACK",
                          label: "Priority Fallback",
                          sublabel: "Tier 1 -> Tier 2 on 429",
                          icon: <ShieldAlert size={14} className="text-amber-500" />,
                        },
                        {
                          value: "ROUND_ROBIN",
                          label: "Auto-Rotate",
                          sublabel: "Round-Robin Load Balance",
                          icon: <RefreshCw size={14} className="text-blue" />,
                        },
                      ]}
                      width="100%"
                    />
                  </div>

                  <div className="form-group">
                    <label>Cooldown on 429 (Seconds)</label>
                    <input
                      suppressHydrationWarning
                      type="number"
                      className="control w-full text-xs"
                      value={cooldownSeconds}
                      onChange={(e) => setCooldownSeconds(Number(e.target.value))}
                      min={10}
                      max={3600}
                    />
                  </div>
                </div>

                {/* Credit Consumption Pricing (Rates per 1k tokens) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "14px" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="flex items-center gap-1.5 font-semibold text-xs" style={{ color: "#1e293b", marginBottom: "6px" }}>
                      <Coins size={12} className="text-amber-500 shrink-0" />
                      <span>Input Rate (Credits / 1k tokens)</span>
                    </label>
                    <input
                      suppressHydrationWarning
                      type="number"
                      className="control w-full text-xs font-semibold"
                      value={rateInPer1k}
                      onChange={(e) => setRateInPer1k(Math.max(0, Number(e.target.value)))}
                      min={0}
                      placeholder="e.g. 25"
                      required
                    />
                    <p className="text-[11px] text-muted" style={{ marginTop: "4px" }}>
                      Biaya kredit per 1.000 token prompt input user.
                    </p>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="flex items-center gap-1.5 font-semibold text-xs" style={{ color: "#1e293b", marginBottom: "6px" }}>
                      <Coins size={12} className="text-amber-500 shrink-0" />
                      <span>Output Rate (Credits / 1k tokens)</span>
                    </label>
                    <input
                      suppressHydrationWarning
                      type="number"
                      className="control w-full text-xs font-semibold"
                      value={rateOutPer1k}
                      onChange={(e) => setRateOutPer1k(Math.max(0, Number(e.target.value)))}
                      min={0}
                      placeholder="e.g. 100"
                      required
                    />
                    <p className="text-[11px] text-muted" style={{ marginTop: "4px" }}>
                      Biaya kredit per 1.000 token completion output LLM.
                    </p>
                  </div>
                </div>

                {/* Row 4: Toggles */}
                <div className="form-group" style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                  <label className="switch-label" style={{ marginBottom: 0 }}>
                    <input
                      suppressHydrationWarning
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span>Active in Gateway</span>
                  </label>

                  <label className="switch-label" style={{ marginBottom: 0 }}>
                    <input
                      suppressHydrationWarning
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    <span>Visible in Public Catalogue</span>
                  </label>
                </div>

                {/* Divider */}
                <div style={{ borderTop: "1px solid var(--line-subtle)", margin: "14px 0 16px" }} />

                {/* Candidate Models Section */}
                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <label style={{ marginBottom: 0, fontSize: "13px" }}>
                      Target Model Stack ({selectedItems.length} selected)
                    </label>
                    <span className="text-[11px] text-muted">
                      {strategy === "FALLBACK"
                        ? "Priority order: Tier 1 tried first, then Tier 2 on 429/5xx"
                        : "Requests auto-rotate sequentially across all models"}
                    </span>
                  </div>

                  {/* Picker Search & Sync Bar */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <input
                        type="text"
                        className="control w-full text-xs"
                        placeholder="Search models by name, ID, or provider (e.g. 5.5, luna, flash, gemini)..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        style={{ paddingLeft: "28px" }}
                      />
                      <Search size={12} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                    </div>

                    <button
                      type="button"
                      className="control btn-inline text-xs"
                      onClick={handleSyncProviderModels}
                      disabled={syncingModels}
                      title="Sync and update models from connected providers"
                    >
                      <RefreshCw size={11} className={syncingModels ? "animate-spin" : ""} />
                      <span>{syncingModels ? "Syncing..." : "Sync Providers"}</span>
                    </button>
                  </div>

                  {/* Grouped Model Picker (Visual Chips by Provider) */}
                  <div
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius-md)",
                      padding: "12px",
                      maxHeight: "260px",
                      overflowY: "auto",
                      backgroundColor: "#f8fafc",
                      marginBottom: "8px",
                    }}
                  >
                    {(() => {
                      // Filter by search
                      const q = pickerSearch.trim().toLowerCase();
                      const filteredList = availableModels.filter((m) => {
                        if (!q) return true;
                        const canonical = getCanonicalProvider(m.provider);
                        const label = PROVIDER_INFO[canonical]?.label || canonical;
                        return (
                          m.name.toLowerCase().includes(q) ||
                          m.modelId.toLowerCase().includes(q) ||
                          m.provider.toLowerCase().includes(q) ||
                          label.toLowerCase().includes(q)
                        );
                      });

                      // Group models by canonical provider
                      const groups: Record<string, AvailableModel[]> = {};
                      for (const m of filteredList) {
                        const prov = getCanonicalProvider(m.provider);
                        if (!groups[prov]) groups[prov] = [];
                        groups[prov].push(m);
                      }

                      const providerKeys = Object.keys(groups).sort();

                      if (providerKeys.length === 0) {
                        return (
                          <div className="text-center" style={{ padding: "20px 0" }}>
                            <p className="text-xs text-muted mb-2">
                              {pickerSearch ? "No models matched your search." : "No models found in system."}
                            </p>
                            <button
                              type="button"
                              className="control btn-inline text-xs"
                              onClick={handleSyncProviderModels}
                              disabled={syncingModels}
                            >
                              <RefreshCw size={11} />
                              <span>Sync Models from Providers</span>
                            </button>
                          </div>
                        );
                      }

                      return providerKeys.map((provKey) => {
                        const provModels = groups[provKey];
                        const info = PROVIDER_INFO[provKey] || { label: provKey, color: "#64748b" };

                        return (
                          <div key={provKey} style={{ marginBottom: "12px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                marginBottom: "6px",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-block",
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  backgroundColor: info.color,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: "11.5px",
                                  fontWeight: 700,
                                  color: "#334155",
                                }}
                              >
                                {info.label}
                              </span>
                              <span
                                style={{
                                  fontSize: "10.5px",
                                  color: "#94a3b8",
                                  fontWeight: 500,
                                }}
                              >
                                ({provModels.length})
                              </span>
                            </div>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {provModels.map((m) => {
                                const isSelected = selectedItems.some(
                                  (si) => si.modelId.toLowerCase() === m.modelId.toLowerCase()
                                );

                                return (
                                  <button
                                    key={m.id || m.modelId}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        const updated = selectedItems
                                          .filter((si) => si.modelId.toLowerCase() !== m.modelId.toLowerCase())
                                          .map((si, idx) => ({ ...si, priority: idx + 1 }));
                                        setSelectedItems(updated);
                                      } else {
                                        setSelectedItems([
                                          ...selectedItems,
                                          {
                                            modelId: m.modelId,
                                            priority: selectedItems.length + 1,
                                            weight: 1,
                                          },
                                        ]);
                                      }
                                    }}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "5px",
                                      padding: "4px 10px",
                                      borderRadius: "6px",
                                      fontSize: "11.5px",
                                      fontWeight: 500,
                                      cursor: "pointer",
                                      border: isSelected
                                        ? "1.5px solid #3b82f6"
                                        : "1px solid #e2e8f0",
                                      background: isSelected
                                        ? "#eff6ff"
                                        : "#ffffff",
                                      color: isSelected ? "#1d4ed8" : "#334155",
                                      transition: "all 0.12s ease",
                                    }}
                                    title={`${m.name} (${m.modelId})`}
                                  >
                                    <span>{m.name}</span>
                                    {isSelected && (
                                      <Check size={11} strokeWidth={2.5} style={{ color: "#3b82f6" }} />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Manual Model ID input bar */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <input
                      type="text"
                      className="control text-xs mono flex-1"
                      placeholder="Or type custom model ID directly (e.g. cx/gpt-5.5, ag/gemini-2.5-flash)..."
                      value={manualModelInput}
                      onChange={(e) => setManualModelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddManualModel();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="control btn-inline text-xs"
                      onClick={handleAddManualModel}
                      disabled={!manualModelInput.trim()}
                    >
                      <Plus size={12} />
                      <span>Add Custom</span>
                    </button>
                  </div>

                  {/* Selected Items Order List */}
                  {selectedItems.length > 0 && (
                    <div
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          backgroundColor: "#f1f5f9",
                          borderBottom: "1px solid var(--line)",
                        }}
                      >
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569" }}>
                          {strategy === "FALLBACK" ? "PRIORITY ORDER (Tier 1 → Tier N)" : "ROTATION ORDER"}
                        </span>
                        <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                          Drag order determines {strategy === "FALLBACK" ? "priority" : "rotation sequence"}
                        </span>
                      </div>

                      {selectedItems.map((it, idx) => (
                        <div
                          key={it.modelId}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderBottom: idx < selectedItems.length - 1 ? "1px solid #f1f5f9" : "none",
                            backgroundColor: "#ffffff",
                            fontSize: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontWeight: 700,
                                backgroundColor: strategy === "ROUND_ROBIN" ? "#e2e8f0" : "#dbeafe",
                                color: strategy === "ROUND_ROBIN" ? "#475569" : "#1d4ed8",
                                minWidth: "42px",
                                textAlign: "center",
                              }}
                            >
                              {strategy === "ROUND_ROBIN" ? `W:${it.weight}` : `Tier ${it.priority}`}
                            </span>
                            <span className="mono" style={{ fontWeight: 500, color: "#334155" }}>
                              {it.modelId}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            {strategy === "ROUND_ROBIN" && (
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginRight: "8px" }}>
                                <span style={{ fontSize: "10px", color: "#94a3b8" }}>Weight:</span>
                                <input
                                  suppressHydrationWarning
                                  type="number"
                                  className="control text-xs"
                                  style={{ width: "48px", height: "24px", textAlign: "center" }}
                                  value={it.weight}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value));
                                    setSelectedItems(
                                      selectedItems.map((item, i) =>
                                        i === idx ? { ...item, weight: val } : item
                                      )
                                    );
                                  }}
                                  min={1}
                                  max={100}
                                />
                              </div>
                            )}

                            <button
                              type="button"
                              className="action-btn"
                              disabled={idx === 0}
                              onClick={() => handleMoveItem(idx, "up")}
                              title="Move Up"
                            >
                              <ArrowUp size={11} />
                            </button>
                            <button
                              type="button"
                              className="action-btn"
                              disabled={idx === selectedItems.length - 1}
                              onClick={() => handleMoveItem(idx, "down")}
                              title="Move Down"
                            >
                              <ArrowDown size={11} />
                            </button>
                            <button
                              type="button"
                              className="action-btn delete"
                              onClick={() => handleRemoveItem(idx)}
                              title="Remove"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedItems.length === 0 && (
                    <p className="text-xs text-muted text-center" style={{ padding: "8px 0", margin: 0 }}>
                      Click models above to add them to this combo stack.
                    </p>
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="control"
                    onClick={() => setModalOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary btn-inline" disabled={saving}>
                    <Layers size={13} />
                    <span>{saving ? "Saving..." : editingCombo ? "Update Combo" : "Create Combo"}</span>
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
