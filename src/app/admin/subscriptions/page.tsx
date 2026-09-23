"use client";

import { useEffect, useState, useMemo } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Crown,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Bell,
  ShieldCheck,
  Search,
  RefreshCw,
  Send,
  Save,
  Check,
  Sliders,
  Sparkles,
  Lock,
  Unlock,
  Coins,
  Radio,
  Server,
  Activity,
  Layers,
  Network,
} from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";
import {
  ProviderAvatar,
  getProviderDisplayName,
  getProviderSlug,
} from "@/components/providers/ProviderIcons";

interface TierConfig {
  id: string;
  name: string;
  priceIdr: number;
  monthlyCredits: number;
  rpmLimit: number;
  maxKeys: number;
  routingPriority: string;
  bonusPercentage: number;
  badgeColor: string;
  description?: string;
  allowedModelIds: string[];
  isActive: boolean;
}

interface AiModelItem {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  contextWindow?: string;
  isCombo?: boolean;
  rateInPer1k?: number;
  rateOutPer1k?: number;
}

interface DiscordSettings {
  discordWebhookUrl: string;
  discordAlertMoneyIn: boolean;
  discordAlertProviderDown: boolean;
  discordAlertSupportTicket: boolean;
  discordAlertLowBalance: boolean;
  healthCheckIntervalMinutes: number;
}

interface HealthResult {
  connectionId: string;
  name: string;
  provider: string;
  statusCode: number;
  latencyMs: number;
  status: "NORMAL" | "EXHAUSTED" | "ERROR";
  reason?: string;
  autoDisabled: boolean;
}

export default function SubscriptionsAdminPage() {
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [models, setModels] = useState<AiModelItem[]>([]);
  const [settings, setSettings] = useState<DiscordSettings>({
    discordWebhookUrl: "",
    discordAlertMoneyIn: true,
    discordAlertProviderDown: true,
    discordAlertSupportTicket: true,
    discordAlertLowBalance: true,
    healthCheckIntervalMinutes: 10,
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [runningHealthCheck, setRunningHealthCheck] = useState(false);
  const [healthResults, setHealthResults] = useState<HealthResult[] | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Search & Filter for Model Matrix
  const [searchModel, setSearchModel] = useState("");
  const [providerFilter, setProviderFilter] = useState("ALL");

  // Active Tab
  const [activeTab, setActiveTab] = useState<"matrix" | "health" | "discord" | "tiers">("matrix");

  function showToast(text: string, type: "success" | "error" = "success") {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/subscriptions");
      const json = await res.json();
      if (json.success) {
        setTiers(json.tiers || []);
        setModels(json.models || []);
        if (json.settings) setSettings(json.settings);
      } else {
        showToast(json.error || "Gagal memuat data", "error");
      }
    } catch {
      showToast("Gagal terhubung ke API", "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered models for matrix
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(searchModel.toLowerCase()) ||
        m.modelId.toLowerCase().includes(searchModel.toLowerCase()) ||
        (m.isCombo && "combo auto rotate".includes(searchModel.toLowerCase()));
      const matchProvider =
        providerFilter === "ALL" ||
        m.provider.toUpperCase() === providerFilter.toUpperCase();
      return matchSearch && matchProvider;
    });
  }, [models, searchModel, providerFilter]);

  // Providers list for filter dropdown
  const uniqueProviders = useMemo(() => {
    const hasCombo = models.some((m) => m.provider.toUpperCase() === "COMBO");
    const otherProviders = Array.from(
      new Set(models.filter((m) => m.provider.toUpperCase() !== "COMBO").map((m) => m.provider.toUpperCase()))
    ).sort();
    return ["ALL", ...(hasCombo ? ["COMBO"] : []), ...otherProviders];
  }, [models]);

  // Toggle model in tier matrix
  async function handleToggleModel(tierId: string, modelId: string) {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;

    let updatedList: string[];
    const isCurrentlyAllowed =
      tier.allowedModelIds.includes("*") || tier.allowedModelIds.includes(modelId);

    if (isCurrentlyAllowed) {
      if (tier.allowedModelIds.includes("*")) {
        // If wildcard, unchecking one model expands wildcard to all except this one
        updatedList = models.map((m) => m.modelId).filter((id) => id !== modelId);
      } else {
        updatedList = tier.allowedModelIds.filter((id) => id !== modelId);
      }
    } else {
      updatedList = [...tier.allowedModelIds, modelId];
    }

    // Optimistic UI update
    setTiers((prev) =>
      prev.map((t) => (t.id === tierId ? { ...t, allowedModelIds: updatedList } : t))
    );

    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_tier_models",
          tierId,
          allowedModelIds: updatedList,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`${modelId} ${isCurrentlyAllowed ? "dihapus dari" : "ditambahkan ke"} ${tier.name}`);
      } else {
        showToast(json.error || "Gagal menyimpan perubahan", "error");
        fetchData();
      }
    } catch {
      showToast("Gagal menyimpan ke server", "error");
      fetchData();
    }
  }

  // Save Discord Settings
  async function handleSaveDiscord(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_discord_settings",
          ...settings,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Pengaturan Discord webhook berhasil disimpan!");
      } else {
        showToast(json.error || "Gagal menyimpan pengaturan Discord", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
    setSavingSettings(false);
  }

  // Test Discord Webhook
  async function handleTestDiscord() {
    if (!settings.discordWebhookUrl) {
      showToast("Masukkan URL Discord Webhook terlebih dahulu", "error");
      return;
    }
    setTestingDiscord(true);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_discord_webhook",
          webhookUrl: settings.discordWebhookUrl,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Pesan tes berhasil dikirim ke channel Discord!");
      } else {
        showToast(json.error || "Gagal mengirim webhook", "error");
      }
    } catch {
      showToast("Network error testing webhook", "error");
    }
    setTestingDiscord(false);
  }

  // Run Health Check on-demand
  async function handleRunHealthCheck() {
    setRunningHealthCheck(true);
    try {
      const res = await fetch("/api/cron/health-check", { method: "POST" });
      const json = await res.json();
      if (json.success && json.report) {
        setHealthResults(json.report.results || []);
        showToast(
          `Health check selesai: ${json.report.healthyCount} sehat, ${json.report.disabledCount} dinonaktifkan.`
        );
      } else {
        showToast(json.error || "Gagal menjalankan health check", "error");
      }
    } catch {
      showToast("Network error running health check", "error");
    }
    setRunningHealthCheck(false);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Subscription & Access Master Control"
          subtitle="Kelola paket langganan hybrid, matrix izin akses model AI per tier, automated cron health checker, dan Discord alert bot."
        />

        {/* Global Toast Banner */}
        {toastMsg && (
          <div
            className={`banner-alert mb-4 ${
              toastMsg.type === "error" ? "bg-red-50 border-red-200 text-red-800" : ""
            }`}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            {toastMsg.type === "error" ? (
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
        )}

        {/* Tier KPI Cards Grid (4 Columns on Desktop, 2 on Tablet, 1 on Mobile) */}
        <div className="admin-subs-grid">
          {tiers.map((tier) => {
            const isFree = tier.id === "FREE";
            const isPlus = tier.id === "PLUS";
            const isPro = tier.id === "PRO";
            const isUltra = tier.id === "ULTRA";

            const tierClass = isUltra
              ? "tier-ultra"
              : isPro
              ? "tier-pro"
              : isPlus
              ? "tier-plus"
              : "tier-free";

            const badgeClass = isUltra
              ? "ultra"
              : isPro
              ? "pro"
              : isPlus
              ? "plus"
              : "free";

            return (
              <article key={tier.id} className={`admin-sub-card ${tierClass}`}>
                <div>
                  <div className="admin-sub-header">
                    <div className="admin-sub-title-wrap">
                      <span className="admin-sub-title">{tier.name}</span>
                      <span className={`admin-sub-badge ${badgeClass}`}>
                        {tier.id}
                      </span>
                    </div>
                    {tier.bonusPercentage > 0 && (
                      <span className={`admin-sub-bonus-badge ${badgeClass}`}>
                        +{tier.bonusPercentage}% Bonus
                      </span>
                    )}
                  </div>

                  <div className="admin-sub-price-wrap">
                    <span className="admin-sub-price">
                      {isFree ? "GRATIS" : `Rp ${tier.priceIdr.toLocaleString("id-ID")}`}
                    </span>
                    {!isFree && <span className="admin-sub-duration">/ 30 hr</span>}
                  </div>
                </div>

                <div>
                  <div className="admin-sub-divider" />
                  <div className="admin-sub-features">
                    <div className="admin-sub-feature-row">
                      <span className="admin-sub-feature-label">Kuota Bulanan:</span>
                      <span className="admin-sub-feature-value highlight-credits">
                        {tier.monthlyCredits.toLocaleString()} CR
                      </span>
                    </div>
                    <div className="admin-sub-feature-row">
                      <span className="admin-sub-feature-label">Kecepatan:</span>
                      <span className="admin-sub-feature-value highlight-rpm">
                        {tier.rpmLimit} RPM
                      </span>
                    </div>
                    <div className="admin-sub-feature-row">
                      <span className="admin-sub-feature-label">Batas API Keys:</span>
                      <span className="admin-sub-feature-value highlight-keys">
                        {tier.maxKeys === -1 ? "Unlimited" : `Max ${tier.maxKeys}`}
                      </span>
                    </div>
                    <div className="admin-sub-feature-row">
                      <span className="admin-sub-feature-label">Routing:</span>
                      <span
                        className={`admin-sub-routing-badge ${
                          tier.routingPriority === "DEDICATED"
                            ? "dedicated"
                            : tier.routingPriority === "FAST_LANE"
                            ? "fast"
                            : "reguler"
                        }`}
                      >
                        {tier.routingPriority === "DEDICATED"
                          ? "Dedicated"
                          : tier.routingPriority === "FAST_LANE"
                          ? "Fast Lane"
                          : "Reguler"}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Modern Segmented Navigation Tabs */}
        <div className="admin-tabs-bar">
          <button
            type="button"
            className={`admin-tab-item ${activeTab === "matrix" ? "active" : ""}`}
            onClick={() => setActiveTab("matrix")}
          >
            <Layers size={14} />
            <span>Model Access Matrix</span>
          </button>

          <button
            type="button"
            className={`admin-tab-item ${activeTab === "health" ? "active" : ""}`}
            onClick={() => setActiveTab("health")}
          >
            <Activity size={14} />
            <span>Health Checker Cron</span>
          </button>

          <button
            type="button"
            className={`admin-tab-item ${activeTab === "discord" ? "active" : ""}`}
            onClick={() => setActiveTab("discord")}
          >
            <Bell size={14} />
            <span>Discord Webhook Bot</span>
          </button>
        </div>

        {/* TAB 1: MODEL ACCESS MATRIX */}
        {activeTab === "matrix" && (
          <div className="matrix-panel">
            <div className="matrix-header">
              <div className="matrix-title">
                <ShieldCheck size={18} style={{ color: "var(--blue)" }} />
                <span>Interactive Model Access Matrix per Subscription Tier</span>
              </div>
              <p className="matrix-desc">
                Centang tier yang diizinkan memanggil model. User yang memanggil model di luar tier-nya akan otomatis dicegat HTTP 403.
              </p>
            </div>

            {/* Dedicated Toolbar Row */}
            <div className="matrix-toolbar">
              <div className="matrix-toolbar-left">
                {/* Search Input with Integrated Icon */}
                <div className="matrix-search-wrap">
                  <Search size={14} className="matrix-search-icon" />
                  <input
                    type="text"
                    placeholder="Search model by ID, name, or provider..."
                    className="matrix-search-input"
                    value={searchModel}
                    onChange={(e) => setSearchModel(e.target.value)}
                  />
                </div>

                {/* Provider Filter Custom Dropdown */}
                <CustomDropdown
                  size="md"
                  value={providerFilter}
                  onChange={(val) => setProviderFilter(val)}
                  options={uniqueProviders.map((p) => {
                    if (p === "ALL") {
                      return {
                        value: "ALL",
                        label: `All Providers (${models.length})`,
                        icon: <Network size={13} style={{ color: "var(--blue)" }} />,
                      };
                    }
                    const count = models.filter((m) => m.provider.toUpperCase() === p).length;
                    return {
                      value: p,
                      label: `${getProviderDisplayName(p)} (${count})`,
                      icon: (
                        <ProviderAvatar
                          slugOrId={getProviderSlug(p)}
                          name={p}
                          size={16}
                          imgSize={12}
                          className="shrink-0 rounded"
                          style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }}
                        />
                      ),
                    };
                  })}
                  minWidth={175}
                  title="Filter models by provider"
                />
              </div>

              <div className="matrix-toolbar-right">
                <span className="matrix-count-badge">
                  Showing <strong>{filteredModels.length}</strong> of {models.length} models
                </span>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-muted text-xs">Loading model matrix...</div>
            ) : (
              <div className="matrix-table-wrap">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: "260px" }}>Model Identifier</th>
                      <th style={{ minWidth: "150px" }}>Provider</th>
                      <th className="col-center" style={{ width: "110px" }}>
                        <span className="matrix-tier-th-badge free">FREE</span>
                      </th>
                      <th className="col-center" style={{ width: "110px" }}>
                        <span className="matrix-tier-th-badge plus">PLUS</span>
                      </th>
                      <th className="col-center" style={{ width: "110px" }}>
                        <span className="matrix-tier-th-badge pro">PRO</span>
                      </th>
                      <th className="col-center" style={{ width: "110px" }}>
                        <span className="matrix-tier-th-badge ultra">ULTRA</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModels.map((m) => (
                      <tr key={m.id} className={m.isCombo ? "matrix-combo-row" : ""}>
                        <td>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="matrix-model-id">{m.modelId}</span>
                              {m.isCombo && (
                                <span className="matrix-combo-tag">Combo</span>
                              )}
                              {m.rateInPer1k !== undefined && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                  style={{ background: "#f8fafc", color: "#334155", border: "1px solid #e2e8f0" }}
                                  title="Biaya konsumsi kredit per 1.000 tokens (Input / Output)"
                                >
                                  <Coins size={10} className="text-amber-500 shrink-0" />
                                  <span>{m.rateInPer1k} / {m.rateOutPer1k} CR</span>
                                </span>
                              )}
                            </div>
                            <span className="matrix-model-name">
                              {m.name}
                              {m.contextWindow && (
                                <span className="text-muted font-normal text-[11px] ml-1.5">
                                  ({m.contextWindow})
                                </span>
                              )}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className="matrix-provider-badge">
                            <ProviderAvatar
                              slugOrId={getProviderSlug(m.provider)}
                              name={m.provider}
                              size={16}
                              imgSize={12}
                              className="shrink-0 rounded"
                              style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }}
                            />
                            <span>{getProviderDisplayName(m.provider)}</span>
                          </span>
                        </td>

                        {tiers.map((tier) => {
                          const isAllowed =
                            tier.allowedModelIds.includes("*") ||
                            tier.allowedModelIds.includes(m.modelId);
                          const isUltra = tier.id === "ULTRA";

                          return (
                            <td key={tier.id} style={{ textAlign: "center" }}>
                              <label
                                className="matrix-checkbox-wrap"
                                title={
                                  isUltra
                                    ? "Tier Ultra memiliki akses ke seluruh model (unrestricted)"
                                    : `${isAllowed ? "Cabut" : "Beri"} izin untuk ${tier.name}`
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isAllowed}
                                  disabled={isUltra}
                                  onChange={() => handleToggleModel(tier.id, m.modelId)}
                                  className="matrix-checkbox"
                                />
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {filteredModels.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted text-xs">
                          Tidak ada model yang cocok dengan filter pencarian.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HEALTH CHECKER CRON */}
        {activeTab === "health" && (
          <div className="matrix-panel">
            <div className="matrix-header flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="matrix-title">
                  <Activity size={18} style={{ color: "#059669" }} />
                  <span>Automated Upstream Health Checker (Cron Ping)</span>
                </div>
                <p className="matrix-desc">
                  Mem-ping seluruh akun provider OpenAI, Claude, dan Google secara berkala untuk mendeteksi kuota habis (429) atau token expired (401).
                </p>
              </div>

              <button
                type="button"
                className="control btn-primary text-xs font-semibold"
                onClick={handleRunHealthCheck}
                disabled={runningHealthCheck}
              >
                <RefreshCw size={13} className={runningHealthCheck ? "animate-spin" : ""} />
                <span>{runningHealthCheck ? "Memeriksa Akun..." : "Run Health Check Now"}</span>
              </button>
            </div>

            <div className="p-4 bg-slate-50 border rounded-lg text-xs space-y-2 mb-4" style={{ borderColor: "#e2e8f0" }}>
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck size={15} className="text-emerald-600" />
                <span>Mekanisme Mitigasi Otomatis:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-muted pl-1">
                <li>Akun yang merespons <strong>HTTP 429</strong> (Quota Exhausted) atau <strong>HTTP 401</strong> langsung otomatis dinonaktifkan (<code>isActive = false</code>).</li>
                <li>Router gateway otomatis mengalihkan request user ke akun sehat berikutnya tanpa ada request yang gagal.</li>
                <li>Sistem otomatis mengirim alert peringatan darurat ke channel Discord Admin.</li>
              </ul>
            </div>

            {healthResults && (
              <div className="matrix-table-wrap">
                <table className="matrix-table text-xs">
                  <thead>
                    <tr>
                      <th>KONEKSI</th>
                      <th>PROVIDER</th>
                      <th>LATENCY</th>
                      <th>STATUS PROBE</th>
                      <th>TINDAKAN OTOMATIS</th>
                      <th>KETERANGAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthResults.map((res) => (
                      <tr key={res.connectionId}>
                        <td>
                          <strong>{res.name}</strong>
                        </td>
                        <td>
                          <span className="mono text-muted">{res.provider}</span>
                        </td>
                        <td className="mono">{res.latencyMs} ms</td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              backgroundColor: res.statusCode === 200 ? "#ecfdf5" : "#fef2f2",
                              color: res.statusCode === 200 ? "#065f46" : "#991b1b",
                              borderColor: res.statusCode === 200 ? "#a7f3d0" : "#fecaca",
                            }}
                          >
                            HTTP {res.statusCode} ({res.status})
                          </span>
                        </td>
                        <td>
                          {res.autoDisabled ? (
                            <span className="text-red-600 font-semibold flex items-center gap-1">
                              <AlertTriangle size={12} /> Auto-Disabled
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              <Check size={12} /> Aktif & Siap
                            </span>
                          )}
                        </td>
                        <td className="text-muted text-[11px]">{res.reason || "Koneksi normal."}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DISCORD WEBHOOK CONFIG */}
        {activeTab === "discord" && (
          <form onSubmit={handleSaveDiscord} className="matrix-panel">
            <div className="matrix-header">
              <div className="matrix-title">
                <Bell size={18} style={{ color: "#7c3aed" }} />
                <span>Discord Webhook Realtime Notifier</span>
              </div>
              <p className="matrix-desc">
                Kirim notifikasi otomatis ke channel Discord saat ada pembayaran masuk, provider down, tiket baru, atau saldo menipis.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Discord Webhook URL:</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://discord.com/api/webhooks/..."
                    className="control text-xs flex-1"
                    value={settings.discordWebhookUrl}
                    onChange={(e) => setSettings({ ...settings, discordWebhookUrl: e.target.value })}
                  />
                  <button
                    type="button"
                    className="control btn-inline text-xs font-semibold"
                    onClick={handleTestDiscord}
                    disabled={testingDiscord}
                  >
                    <Send size={12} />
                    <span>{testingDiscord ? "Mengirim..." : "Test Webhook"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted mt-1">
                  Buat Webhook di Channel Discord: Server Settings &rarr; Integrations &rarr; Webhooks &rarr; New Webhook.
                </p>
              </div>

              <div className="border-t pt-3 space-y-3" style={{ borderColor: "#f1f5f9" }}>
                <strong className="text-xs block text-ink">Kategori Notifikasi yang Dikirim:</strong>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertMoneyIn}
                    onChange={(e) => setSettings({ ...settings, discordAlertMoneyIn: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-emerald-700">💰 Uang Masuk (Midtrans Payment Success)</strong>
                    <p className="text-[11px] text-muted">Notifikasi instan setiap kali user top-up ketengan atau berlangganan paket.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertProviderDown}
                    onChange={(e) => setSettings({ ...settings, discordAlertProviderDown: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-red-700">🚨 Akun Provider Down / Quota Exhausted</strong>
                    <p className="text-[11px] text-muted">Peringatan darurat saat akun OpenAI, Claude, atau Google dinonaktifkan otomatis karena 429/401.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertSupportTicket}
                    onChange={(e) => setSettings({ ...settings, discordAlertSupportTicket: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-amber-700">🎫 Tiket Bantuan Baru (Support Ticket)</strong>
                    <p className="text-[11px] text-muted">Pemberitahuan saat ada customer yang mengirim tiket pertanyaan atau komplain.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertLowBalance}
                    onChange={(e) => setSettings({ ...settings, discordAlertLowBalance: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-blue-700">⚠️ Saldo Pengguna Menipis (&lt; 10%)</strong>
                    <p className="text-[11px] text-muted">Pemantauan saat sisa kredit user mendekati habis untuk memicu pengingat perpanjangan.</p>
                  </div>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="control btn-primary text-xs font-semibold"
                  disabled={savingSettings}
                >
                  <Save size={13} />
                  <span>{savingSettings ? "Menyimpan..." : "Simpan Pengaturan Discord"}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
