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
  Plus,
  Trash2,
  Edit3,
  X,
  Tag,
  Calculator,
  HelpCircle,
} from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";
import {
  ProviderAvatar,
  getProviderDisplayName,
  getProviderSlug,
} from "@/components/providers/ProviderIcons";
import { IDR_PER_USD, idrToUsd, formatUsd } from "@/lib/billing-config";

interface TierConfig {
  id: string;
  name: string;
  priceIdr: number;
  monthlyBalanceUsd: number;
  rpmLimit: number;
  maxKeys: number;
  routingPriority: string;
  bonusPercentage: number;
  badgeColor: string;
  description?: string;
  features?: string[];
  allowedModelIds: string[];
  isActive: boolean;
}

interface TopupPackageItem {
  id: string;
  name: string;
  priceIdr: number;
  balanceUsd?: number;
  bonusPercentage: number;
  tag?: string;
  badgeColor?: string;
  sortOrder: number;
  isActive: boolean;
}

interface AiModelItem {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  contextWindow?: string;
  isCombo?: boolean;
  rateInUsdPer1k?: number;
  rateOutUsdPer1k?: number;
  rateInUsdPer1m?: number;
  rateOutUsdPer1m?: number;
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
  const [topupPackages, setTopupPackages] = useState<TopupPackageItem[]>([]);
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
  const [activeTab, setActiveTab] = useState<"tiers" | "packages" | "matrix" | "health" | "discord">("tiers");

  // Tier Modal State
  const [editingTier, setEditingTier] = useState<TierConfig | null>(null);
  const [isNewTier, setIsNewTier] = useState(false);
  const [tierFeaturesText, setTierFeaturesText] = useState("");
  const [savingTier, setSavingTier] = useState(false);

  // Top-Up Package Modal State
  const [editingPackage, setEditingPackage] = useState<TopupPackageItem | null>(null);
  const [isNewPackage, setIsNewPackage] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);

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
        setTopupPackages(json.topupPackages || []);
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

  // --- TIER ACTIONS ---
  function handleOpenEditTier(tier: TierConfig) {
    setEditingTier({ ...tier });
    setIsNewTier(false);
    setTierFeaturesText(Array.isArray(tier.features) ? tier.features.join("\n") : "");
  }

  function handleOpenCreateTier() {
    setEditingTier({
      id: "",
      name: "",
      priceIdr: 50000,
      monthlyBalanceUsd: Number((50000 / IDR_PER_USD).toFixed(2)),
      rpmLimit: 30,
      maxKeys: 5,
      routingPriority: "REGULAR",
      bonusPercentage: 0,
      badgeColor: "blue",
      description: "",
      features: [],
      allowedModelIds: [],
      isActive: true,
    });
    setIsNewTier(true);
    setTierFeaturesText("");
  }

  async function handleSaveTier(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTier) return;
    if (!editingTier.id.trim()) {
      showToast("ID Tier tidak boleh kosong", "error");
      return;
    }

    setSavingTier(true);
    const parsedFeatures = tierFeaturesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isNewTier ? "create_tier" : "update_tier_config",
          tierId: editingTier.id.trim().toUpperCase(),
          id: editingTier.id.trim().toUpperCase(),
          name: editingTier.name,
          priceIdr: Number(editingTier.priceIdr),
          monthlyBalanceUsd: Number(editingTier.monthlyBalanceUsd),
          rpmLimit: Number(editingTier.rpmLimit),
          maxKeys: Number(editingTier.maxKeys),
          routingPriority: editingTier.routingPriority,
          bonusPercentage: Number(editingTier.bonusPercentage),
          badgeColor: editingTier.badgeColor,
          description: editingTier.description,
          features: parsedFeatures,
          isActive: editingTier.isActive,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Konfigurasi tier berhasil disimpan!");
        setEditingTier(null);
        fetchData();
      } else {
        showToast(json.error || "Gagal menyimpan tier", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan", "error");
    }
    setSavingTier(false);
  }

  async function handleDeleteTier(tierId: string) {
    if (!window.confirm(`Yakin ingin menghapus tier ${tierId}?`)) return;
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_tier", tierId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Tier berhasil dihapus");
        fetchData();
      } else {
        showToast(json.error || "Gagal menghapus tier", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan", "error");
    }
  }

  // --- TOPUP PACKAGE ACTIONS ---
  function handleOpenEditPackage(pkg: TopupPackageItem) {
    setEditingPackage({
      ...pkg,
      balanceUsd: pkg.balanceUsd !== undefined ? Number(pkg.balanceUsd) : 1,
    });
    setIsNewPackage(false);
  }

  function handleOpenCreatePackage() {
    setEditingPackage({
      id: "",
      name: "",
      priceIdr: 25000,
      balanceUsd: 1.5,
      bonusPercentage: 0,
      tag: "",
      badgeColor: "blue",
      sortOrder: topupPackages.length + 1,
      isActive: true,
    });
    setIsNewPackage(true);
  }

  async function handleSavePackage(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPackage) return;
    if (!editingPackage.name.trim() || !editingPackage.priceIdr) {
      showToast("Nama dan harga paket wajib diisi", "error");
      return;
    }

    setSavingPackage(true);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isNewPackage ? "create_topup_package" : "update_topup_package",
          id: editingPackage.id,
          name: editingPackage.name,
          priceIdr: Number(editingPackage.priceIdr),
          balanceUsd: Number(editingPackage.balanceUsd ?? 1),
          bonusPercentage: Number(editingPackage.bonusPercentage),
          tag: editingPackage.tag,
          badgeColor: editingPackage.badgeColor,
          sortOrder: Number(editingPackage.sortOrder),
          isActive: editingPackage.isActive,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Paket ketengan berhasil disimpan!");
        setEditingPackage(null);
        fetchData();
      } else {
        showToast(json.error || "Gagal menyimpan paket ketengan", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan", "error");
    }
    setSavingPackage(false);
  }

  async function handleDeletePackage(id: string) {
    if (!window.confirm("Yakin ingin menghapus paket ketengan ini?")) return;
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_topup_package", id }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Paket ketengan berhasil dihapus");
        fetchData();
      } else {
        showToast(json.error || "Gagal menghapus paket", "error");
      }
    } catch {
      showToast("Terjadi kesalahan jaringan", "error");
    }
  }

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

        {/* Header & Quick Action for Tiers */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Crown size={16} className="text-amber-500" />
              <span>Paket Langganan Bulanan (Tier Subscriptions)</span>
            </h2>
            <p className="text-xs text-muted">
              Harga IDR, kuota saldo USD bulanan, batas RPM, kuota API key, dan prioritas routing.
            </p>
          </div>
          <button
            type="button"
            className="control btn-primary text-xs font-semibold flex items-center gap-1.5"
            onClick={handleOpenCreateTier}
          >
            <Plus size={13} />
            <span>Tambah Tier Baru</span>
          </button>
        </div>

        {/* Tier KPI Cards Grid (4 Columns on Desktop, 2 on Tablet, 1 on Mobile) */}
        <div className="admin-subs-grid mb-6">
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
                      <span className="admin-sub-feature-value highlight-balance">
                        ${Number(tier.monthlyBalanceUsd || 0).toFixed(2)}
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

                  <div style={{ marginTop: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="control btn-secondary text-xs flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => handleOpenEditTier(tier)}
                      style={{ padding: "6px 10px" }}
                    >
                      <Sliders size={12} />
                      <span>Edit Config</span>
                    </button>
                    {!["FREE", "PLUS", "PRO", "ULTRA"].includes(tier.id) && (
                      <button
                        type="button"
                        className="control btn-inline text-xs text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteTier(tier.id)}
                        style={{ padding: "6px" }}
                        title="Hapus Tier"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
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
            className={`admin-tab-item ${activeTab === "tiers" ? "active" : ""}`}
            onClick={() => setActiveTab("tiers")}
          >
            <Crown size={14} />
            <span>Paket Langganan ({tiers.length})</span>
          </button>

          <button
            type="button"
            className={`admin-tab-item ${activeTab === "packages" ? "active" : ""}`}
            onClick={() => setActiveTab("packages")}
          >
            <Zap size={14} />
            <span>Paket Top-Up Ketengan ({topupPackages.length})</span>
          </button>

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

        {/* TAB 1: SUBSCRIPTION TIERS LIST & CONFIG */}
        {activeTab === "tiers" && (
          <div className="matrix-panel">
            <div className="matrix-header flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="matrix-title">
                  <Crown size={18} style={{ color: "#f59e0b" }} />
                  <span>Daftar Konfigurasi Tier Langganan</span>
                </div>
                <p className="matrix-desc">
                  Kelola nama paket, harga langganan IDR, jatah saldo USD, batas RPM, kuota API key, dan poin fitur.
                </p>
              </div>
              <button
                type="button"
                className="control btn-primary text-xs font-semibold flex items-center gap-1.5"
                onClick={handleOpenCreateTier}
              >
                <Plus size={13} />
                <span>Tambah Tier</span>
              </button>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Harga Bulanan</th>
                    <th>Saldo Bulanan</th>
                    <th>Kecepatan (RPM)</th>
                    <th>Max Keys</th>
                    <th>Priority</th>
                    <th>Bonus Rescue</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.id}>
                      <td className="cell-strong">
                        <div className="flex items-center gap-1.5">
                          <Crown size={12} className={t.badgeColor === "amber" ? "text-amber-500" : "text-blue-500"} />
                          <span>{t.name}</span>
                          <span className="mono text-[10px] text-muted font-normal">({t.id})</span>
                        </div>
                      </td>
                      <td className="mono text-xs">
                        {t.priceIdr === 0 ? "Gratis" : `Rp ${t.priceIdr.toLocaleString("id-ID")}`}
                      </td>
                      <td className="mono text-emerald-600 font-semibold text-xs whitespace-nowrap">
                        +${Number(t.monthlyBalanceUsd || 0).toFixed(2)}
                      </td>
                      <td className="mono text-xs">{t.rpmLimit} RPM</td>
                      <td className="mono text-xs">{t.maxKeys === -1 ? "Unlimited" : t.maxKeys}</td>
                      <td>
                        <span className={`admin-sub-routing-badge ${t.routingPriority === "DEDICATED" ? "dedicated" : t.routingPriority === "FAST_LANE" ? "fast" : "reguler"}`}>
                          {t.routingPriority}
                        </span>
                      </td>
                      <td className="mono text-xs">
                        {t.bonusPercentage > 0 ? `+${t.bonusPercentage}%` : "-"}
                      </td>
                      <td>
                        <span className={`badge-status ${t.isActive ? "online" : "offline"}`}>
                          {t.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="control btn-secondary text-xs flex items-center gap-1"
                            onClick={() => handleOpenEditTier(t)}
                            style={{ padding: "4px 8px" }}
                          >
                            <Sliders size={11} />
                            <span>Edit</span>
                          </button>
                          {!["FREE", "PLUS", "PRO", "ULTRA"].includes(t.id) && (
                            <button
                              type="button"
                              className="control btn-inline text-xs text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteTier(t.id)}
                              style={{ padding: "4px" }}
                              title="Hapus Tier"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PACKAGES (PAKET KETENGAN) */}
        {activeTab === "packages" && (
          <div className="matrix-panel">
            <div className="matrix-header flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="matrix-title">
                  <Zap size={18} style={{ color: "#3b82f6" }} />
                  <span>Daftar Paket Top-Up Ketengan</span>
                </div>
                <p className="matrix-desc">
                  Konfigurasi pilihan nominal top-up saldo USD mandiri yang dapat dipilih customer di halaman /billing.
                </p>
              </div>
              <button
                type="button"
                className="control btn-primary text-xs font-semibold flex items-center gap-1.5"
                onClick={handleOpenCreatePackage}
              >
                <Plus size={13} />
                <span>Tambah Paket Ketengan</span>
              </button>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Urutan</th>
                    <th>Nama Paket</th>
                    <th>Nominal Bayar (Rp)</th>
                    <th>Bonus Ekstra (%)</th>
                    <th>Estimasi Saldo Diterima</th>
                    <th>Tag / Label</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {topupPackages.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-6 text-muted text-xs">
                        Belum ada paket ketengan yang dikonfigurasi. Klik &quot;Tambah Paket Ketengan&quot; untuk menambahkan.
                      </td>
                    </tr>
                  ) : (
                    topupPackages.map((pkg) => {
                      const totalUsd =
                        pkg.balanceUsd !== undefined && pkg.balanceUsd !== null
                          ? Number(pkg.balanceUsd).toFixed(2)
                          : (
                              idrToUsd(pkg.priceIdr) *
                              (1 + (Number(pkg.bonusPercentage) || 0) / 100)
                            ).toFixed(2);

                      return (
                        <tr key={pkg.id}>
                          <td className="mono text-xs font-semibold text-muted">#{pkg.sortOrder}</td>
                          <td className="cell-strong">
                            <div className="flex items-center gap-1.5">
                              <Zap size={12} className="text-blue-500" />
                              <span>{pkg.name}</span>
                            </div>
                          </td>
                          <td className="mono text-xs font-bold">
                            Rp {Number(pkg.priceIdr || 0).toLocaleString("id-ID")}
                          </td>
                          <td className="mono text-xs">
                            {pkg.bonusPercentage > 0 ? (
                              <span className="text-purple-600 font-semibold">+{pkg.bonusPercentage}%</span>
                            ) : (
                              <span className="text-muted">0%</span>
                            )}
                          </td>
                          <td className="mono text-emerald-600 font-semibold text-xs whitespace-nowrap">
                            +${totalUsd}
                          </td>
                          <td>
                            {pkg.tag ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                {pkg.tag}
                              </span>
                            ) : (
                              <span className="text-muted text-[11px]">-</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge-status ${pkg.isActive ? "online" : "offline"}`}>
                              {pkg.isActive ? "Aktif" : "Nonaktif"}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="control btn-secondary text-xs flex items-center gap-1"
                                onClick={() => handleOpenEditPackage(pkg)}
                                style={{ padding: "4px 8px" }}
                              >
                                <Edit3 size={11} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="control btn-inline text-xs text-red-600 hover:text-red-700"
                                onClick={() => handleDeletePackage(pkg.id)}
                                style={{ padding: "4px" }}
                                title="Hapus Paket"
                              >
                                <Trash2 size={12} />
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
          </div>
        )}

        {/* TAB 3: MODEL ACCESS MATRIX */}
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
                          style={{ background: "var(--surface-hover)", borderColor: "var(--line)" }}
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
                              {(m.rateInUsdPer1m !== undefined || m.rateInUsdPer1k !== undefined) && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60"
                                  title="Biaya konsumsi saldo per 1.000.000 tokens (Input / Output)"
                                >
                                  <Coins size={10} className="text-amber-500 shrink-0" />
                                  <span>
                                    ${m.rateInUsdPer1m !== undefined && m.rateInUsdPer1m !== null
                                      ? Number(m.rateInUsdPer1m)
                                      : m.rateInUsdPer1k ? (Number(m.rateInUsdPer1k) * 1000) : 0.15} / ${m.rateOutUsdPer1m !== undefined && m.rateOutUsdPer1m !== null
                                      ? Number(m.rateOutUsdPer1m)
                                      : m.rateOutUsdPer1k ? (Number(m.rateOutUsdPer1k) * 1000) : 0.60} / 1M
                                  </span>
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
                              style={{ background: "var(--surface-hover)", borderColor: "var(--line)" }}
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

        {/* TAB 2: HEALTH CHECKER USDON */}
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

              <div className="border-t pt-3 space-y-3" style={{ borderColor: "var(--line)" }}>
                <strong className="text-xs block text-ink">Kategori Notifikasi yang Dikirim:</strong>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertMoneyIn}
                    onChange={(e) => setSettings({ ...settings, discordAlertMoneyIn: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-emerald-700 dark:text-emerald-400">💰 Uang Masuk (Midtrans Payment Success)</strong>
                    <p className="text-[11px] text-muted">Notifikasi instan setiap kali user top-up ketengan atau berlangganan paket.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertProviderDown}
                    onChange={(e) => setSettings({ ...settings, discordAlertProviderDown: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-red-700 dark:text-red-400">🚨 Akun Provider Down / Quota Exhausted</strong>
                    <p className="text-[11px] text-muted">Peringatan darurat saat akun OpenAI, Claude, atau Google dinonaktifkan otomatis karena 429/401.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertSupportTicket}
                    onChange={(e) => setSettings({ ...settings, discordAlertSupportTicket: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-amber-700 dark:text-amber-400">🎫 Tiket Bantuan Baru (Support Ticket)</strong>
                    <p className="text-[11px] text-muted">Pemberitahuan saat ada customer yang mengirim tiket pertanyaan atau komplain.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                  <input
                    type="checkbox"
                    checked={settings.discordAlertLowBalance}
                    onChange={(e) => setSettings({ ...settings, discordAlertLowBalance: e.target.checked })}
                    className="matrix-checkbox mt-0.5"
                  />
                  <div>
                    <strong className="text-xs block text-blue-700 dark:text-blue-400">⚠️ Saldo Pengguna Menipis (&lt; 10%)</strong>
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

        {/* MODAL 1: EDIT / CREATE SUBSCRIPTION TIER */}
        {editingTier && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--overlay-backdrop)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
          >
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                width: "100%",
                maxWidth: "580px",
                padding: "24px",
                borderRadius: "12px",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                    <Crown size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">
                      {isNewTier ? "Tambah Tier Langganan Baru" : `Edit Tier: ${editingTier.name}`}
                    </h3>
                    <p className="text-xs text-muted">
                      ID: <span className="mono font-semibold">{editingTier.id || "BARU"}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTier(null)}
                  className="p-1 rounded-md text-muted hover:text-ink cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveTier} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">ID Tier (Kode Unik):</label>
                    <input
                      type="text"
                      className="control text-xs w-full uppercase"
                      disabled={!isNewTier}
                      placeholder="e.g. VIP, TEAM"
                      value={editingTier.id}
                      onChange={(e) => setEditingTier({ ...editingTier, id: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Nama Tampilan:</label>
                    <input
                      type="text"
                      className="control text-xs w-full"
                      placeholder="e.g. VIP Enterprise"
                      value={editingTier.name}
                      onChange={(e) => setEditingTier({ ...editingTier, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Harga Bulanan (Rp / IDR):</label>
                    <input
                      type="number"
                      className="control text-xs w-full"
                      min={0}
                      step={1000}
                      value={editingTier.priceIdr}
                      onChange={(e) => {
                        const newPrice = Number(e.target.value);
                        setEditingTier({
                          ...editingTier,
                          priceIdr: newPrice,
                        });
                      }}
                      required
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold">Alokasi Saldo ($):</label>
                      <button
                        type="button"
                        className="text-[10px] text-[var(--blue)] hover:underline flex items-center gap-0.5"
                        onClick={() => {
                          const autoUsd = Number(idrToUsd(editingTier.priceIdr).toFixed(2));
                          setEditingTier({ ...editingTier, monthlyBalanceUsd: autoUsd });
                        }}
                        title="Hitung otomatis: Harga IDR / Kurs"
                      >
                        <Calculator size={10} />
                        <span>Hitung dr Kurs</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        className="control text-xs w-full"
                        step="0.01"
                        min={0}
                        value={editingTier.monthlyBalanceUsd}
                        onChange={(e) => setEditingTier({ ...editingTier, monthlyBalanceUsd: Number(e.target.value) })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Batas RPM:</label>
                    <input
                      type="number"
                      className="control text-xs w-full"
                      min={1}
                      value={editingTier.rpmLimit}
                      onChange={(e) => setEditingTier({ ...editingTier, rpmLimit: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Maks API Keys:</label>
                    <input
                      type="number"
                      className="control text-xs w-full"
                      value={editingTier.maxKeys}
                      onChange={(e) => setEditingTier({ ...editingTier, maxKeys: Number(e.target.value) })}
                      required
                    />
                    <span className="text-[10px] text-muted">-1 = Unlimited</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Rescue Bonus (%):</label>
                    <input
                      type="number"
                      className="control text-xs w-full"
                      min={0}
                      max={100}
                      value={editingTier.bonusPercentage}
                      onChange={(e) => setEditingTier({ ...editingTier, bonusPercentage: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Jalur Routing:</label>
                    <select
                      className="control text-xs w-full"
                      value={editingTier.routingPriority}
                      onChange={(e) => setEditingTier({ ...editingTier, routingPriority: e.target.value })}
                    >
                      <option value="REGULAR">REGULAR</option>
                      <option value="FAST_LANE">FAST_LANE</option>
                      <option value="DEDICATED">DEDICATED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Warna Badge:</label>
                    <select
                      className="control text-xs w-full"
                      value={editingTier.badgeColor || "blue"}
                      onChange={(e) => setEditingTier({ ...editingTier, badgeColor: e.target.value })}
                    >
                      <option value="gray">Gray (Default)</option>
                      <option value="blue">Blue</option>
                      <option value="purple">Purple</option>
                      <option value="amber">Amber / Gold</option>
                      <option value="emerald">Emerald / Green</option>
                      <option value="rose">Rose / Red</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Deskripsi Singkat:</label>
                  <input
                    type="text"
                    className="control text-xs w-full"
                    placeholder="Deskripsi singkat paket..."
                    value={editingTier.description || ""}
                    onChange={(e) => setEditingTier({ ...editingTier, description: e.target.value })}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold">Poin-poin Fitur (Satu fitur per baris):</label>
                    <span className="text-[10px] text-muted">Muncul sebagai bullet list di /billing</span>
                  </div>
                  <textarea
                    rows={4}
                    className="control text-xs w-full font-mono"
                    placeholder={"Saldo $6.19 per bulan\nBatas 60 Request Per Menit (RPM)\nMaksimal 10 API Keys\nJalur Fast Lane Priority"}
                    value={tierFeaturesText}
                    onChange={(e) => setTierFeaturesText(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--line)" }}>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={editingTier.isActive}
                      onChange={(e) => setEditingTier({ ...editingTier, isActive: e.target.checked })}
                      className="matrix-checkbox"
                    />
                    <span>Tier Aktif & Ditampilkan ke Pengguna</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="control btn-inline text-xs"
                      onClick={() => setEditingTier(null)}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="control btn-primary text-xs font-semibold flex items-center gap-1.5"
                      disabled={savingTier}
                    >
                      <Save size={13} />
                      <span>{savingTier ? "Menyimpan..." : "Simpan Perubahan"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: EDIT / CREATE TOP-UP PACKAGE (KETENGAN) */}
        {editingPackage && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--overlay-backdrop)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
          >
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                width: "100%",
                maxWidth: "520px",
                padding: "24px",
                borderRadius: "12px",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "var(--shadow-xl)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Zap size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">
                      {isNewPackage ? "Tambah Paket Top-Up Baru" : `Edit Paket: ${editingPackage.name}`}
                    </h3>
                    <p className="text-xs text-muted">
                      Konfigurasi paket top-up saldo ketengan
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPackage(null)}
                  className="p-1 rounded-md text-muted hover:text-ink cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSavePackage} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Nama Paket:</label>
                    <input
                      type="text"
                      className="control text-xs w-full"
                      placeholder="e.g. Starter, Popular"
                      value={editingPackage.name}
                      onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Tag / Label Badge:</label>
                    <input
                      type="text"
                      className="control text-xs w-full"
                      placeholder="e.g. Best Value, Hemat +5%"
                      value={editingPackage.tag || ""}
                      onChange={(e) => setEditingPackage({ ...editingPackage, tag: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Nominal Bayar (Rp / IDR):</label>
                    <input
                      type="number"
                      className="control text-xs w-full"
                      min={1000}
                      step={1000}
                      value={editingPackage.priceIdr}
                      onChange={(e) => setEditingPackage({ ...editingPackage, priceIdr: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Saldo Diterima ($):</label>
                    <input
                      type="number"
                      className="control text-xs w-full font-mono font-bold text-emerald-600"
                      min={0.01}
                      step={0.01}
                      value={editingPackage.balanceUsd ?? 1}
                      onChange={(e) => setEditingPackage({ ...editingPackage, balanceUsd: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Bonus Label (%):</label>
                    <input
                      type="number"
                      className="control text-xs w-full"
                      min={0}
                      max={100}
                      value={editingPackage.bonusPercentage}
                      onChange={(e) => setEditingPackage({ ...editingPackage, bonusPercentage: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Urutan Tampilan (#):</label>
                    <input
                      type="number"
                      className="control text-xs w-full"
                      min={1}
                      value={editingPackage.sortOrder}
                      onChange={(e) => setEditingPackage({ ...editingPackage, sortOrder: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Warna Badge:</label>
                    <select
                      className="control text-xs w-full"
                      value={editingPackage.badgeColor || "blue"}
                      onChange={(e) => setEditingPackage({ ...editingPackage, badgeColor: e.target.value })}
                    >
                      <option value="gray">Gray</option>
                      <option value="blue">Blue</option>
                      <option value="purple">Purple</option>
                      <option value="amber">Amber</option>
                      <option value="emerald">Emerald</option>
                    </select>
                  </div>
                </div>

                {/* Live Preview Box */}
                <div
                  style={{
                    background: "var(--line-subtle, #f8fafc)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    fontSize: "12px",
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted">Saldo Diterima Customer:</span>
                    <strong className="text-emerald-600 font-mono text-sm">
                      +${Number(editingPackage.balanceUsd ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="text-[11px] text-muted">
                    Customer membayar <strong>Rp {Number(editingPackage.priceIdr || 0).toLocaleString("id-ID")}</strong>
                    {Number(editingPackage.bonusPercentage) > 0 && ` (Badge promo: +${editingPackage.bonusPercentage}%)`}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--line)" }}>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={editingPackage.isActive}
                      onChange={(e) => setEditingPackage({ ...editingPackage, isActive: e.target.checked })}
                      className="matrix-checkbox"
                    />
                    <span>Paket Aktif & Tampil di /billing</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="control btn-inline text-xs"
                      onClick={() => setEditingPackage(null)}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="control btn-primary text-xs font-semibold flex items-center gap-1.5"
                      disabled={savingPackage}
                    >
                      <Save size={13} />
                      <span>{savingPackage ? "Menyimpan..." : "Simpan Paket"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
