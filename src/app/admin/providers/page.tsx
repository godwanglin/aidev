"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Network,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
  Bot,
  Layers,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { FULL_PROVIDER_CATALOG, CatalogProviderItem } from "@/lib/oauth/config";
import { renderProviderIcon, ProviderAvatar } from "@/components/providers/ProviderIcons";
import CustomProviderModal from "@/components/providers/CustomProviderModal";
import { ConnectionItem } from "@/components/providers/EditConnectionModal";

interface CustomProviderItem {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  apiType: string;
  baseUrl: string;
  compatibility: string;
  connectionsCount: number;
  healthyCount: number;
  activeCount: number;
}

export default function ProvidersCatalogPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [customProviders, setCustomProviders] = useState<CustomProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Category filter
  const [filterView, setFilterView] = useState<"ALL" | "CUSTOM" | "OAUTH" | "FREE_TIER">("ALL");

  // Custom Provider Modal
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customCompatibility, setCustomCompatibility] = useState<"OPENAI" | "ANTHROPIC">("OPENAI");

  // Test All states
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [isRefreshingTokens, setIsRefreshingTokens] = useState(false);

  // Fetch connections and custom providers
  async function fetchAll() {
    setLoading(true);
    try {
      const [connRes, cpRes] = await Promise.all([
        fetch("/api/admin/providers"),
        fetch("/api/admin/providers/custom"),
      ]);
      const [connJson, cpJson] = await Promise.all([
        connRes.json(),
        cpRes.json(),
      ]);

      if (connJson.connections) {
        setConnections(connJson.connections);
      }
      if (cpJson.customProviders) {
        setCustomProviders(cpJson.customProviders);
      }
    } catch {
      setError("Gagal menghubungi endpoint providers API.");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, []);

  // Map connections by provider ID / key
  const connectionsByProvider = useMemo(() => {
    const map = new Map<string, ConnectionItem[]>();
    for (const c of connections) {
      const key = c.provider.toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [connections]);

  // Distinct Custom providers from database
  const customConnections = useMemo(() => {
    const defaultKeys = new Set([
      ...FULL_PROVIDER_CATALOG.map((p) => p.id),
      "OPENAI",
      "ANTHROPIC",
      "GOOGLE",
    ]);
    return connections.filter(
      (c) => c.provider === "CUSTOM" || !defaultKeys.has(c.provider.toUpperCase())
    );
  }, [connections]);

  // Partition Catalog Items
  const oauthItems = useMemo(
    () => FULL_PROVIDER_CATALOG.filter((item) => item.category === "OAUTH"),
    []
  );

  const freeTierItems = useMemo(
    () => FULL_PROVIDER_CATALOG.filter((item) => item.category === "FREE_TIER"),
    []
  );

  const apiKeyItems = useMemo(
    () => FULL_PROVIDER_CATALOG.filter((item) => item.category === "API_KEY"),
    []
  );

  // Handle Test All
  async function handleTestAll(category: "OAUTH" | "FREE_TIER") {
    setIsTestingAll(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/providers/test-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(
          `Pengujian ${category} selesai: ${json.summary.healthy}/${json.summary.total} koneksi teruji sehat.`
        );
        setTimeout(() => setSuccess(""), 4000);
        fetchAll();
      } else {
        setError(json.error || "Gagal menjalankan pengujian semua provider.");
      }
    } catch {
      setError("Gagal menghubungi server untuk pengujian koneksi.");
    }
    setIsTestingAll(false);
  }

  async function handleRunCronRefresh() {
    setIsRefreshingTokens(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/providers/cron/refresh", {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(
          `Token refresh selesai: ${json.refreshed} diperbarui, ${json.skipped} masih fresh, ${json.failed} gagal.`
        );
        setTimeout(() => setSuccess(""), 5000);
        fetchAll();
      } else {
        setError(json.error || "Gagal menjalankan refresh token.");
      }
    } catch {
      setError("Gagal menghubungi endpoint cron refresh.");
    }
    setIsRefreshingTokens(false);
  }

  function openAddCustom(comp: "OPENAI" | "ANTHROPIC") {
    setCustomCompatibility(comp);
    setShowCustomModal(true);
  }

  function navigateToProvider(slug: string) {
    router.push(`/admin/providers/${slug}`);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Provider Hub"
          subtitle="Katalog multi-provider AI Gateway (9Router Style) dengan failover cerdas & multi-account."
        >
          <div className="flex items-center gap-2">
            <button
              className="control btn-inline text-xs flex items-center gap-1.5"
              onClick={handleRunCronRefresh}
              disabled={isRefreshingTokens}
              title="Periksa dan perbarui access token OAuth yang akan expired"
            >
              <RefreshCw
                size={12}
                className={isRefreshingTokens ? "animate-spin text-blue" : ""}
              />
              <span>{isRefreshingTokens ? "Refreshing Tokens..." : "Refresh OAuth Tokens"}</span>
            </button>
            <button
              className="control btn-icon-only"
              aria-label="Refresh"
              onClick={fetchAll}
              title="Refresh Katalog"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} strokeWidth={1.5} />
            </button>
          </div>
        </PageHead>

        {/* Global Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-[var(--line)] pb-4">
          <div className="segmented-nav">
            <button
              className={`segmented-nav-btn ${filterView === "ALL" ? "active" : ""}`}
              onClick={() => setFilterView("ALL")}
            >
              <Layers size={13} strokeWidth={1.75} />
              <span>All Providers</span>
            </button>
            <button
              className={`segmented-nav-btn ${filterView === "CUSTOM" ? "active" : ""}`}
              onClick={() => setFilterView("CUSTOM")}
            >
              <Bot size={13} strokeWidth={1.75} />
              <span>Custom Providers</span>
              {customProviders.length > 0 && (
                <span className="segmented-nav-badge">{customProviders.length}</span>
              )}
            </button>
            <button
              className={`segmented-nav-btn ${filterView === "OAUTH" ? "active" : ""}`}
              onClick={() => setFilterView("OAUTH")}
            >
              <KeyRound size={13} strokeWidth={1.75} />
              <span>OAuth Providers</span>
              <span className="segmented-nav-badge">{oauthItems.length}</span>
            </button>
            <button
              className={`segmented-nav-btn ${filterView === "FREE_TIER" ? "active" : ""}`}
              onClick={() => setFilterView("FREE_TIER")}
            >
              <Sparkles size={13} strokeWidth={1.75} />
              <span>Free Tier</span>
              <span className="segmented-nav-badge">{freeTierItems.length}</span>
            </button>
          </div>

          <div className="text-xs text-muted flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {connections.filter((c) => c.isActive).length} Aktif
            </span>
            <span className="font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              Total {connections.length} Akun
            </span>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="login-error mb-4 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="banner-alert mb-4 flex items-center gap-2">
            <CheckCircle2 size={15} className="shrink-0 text-green" />
            <span className="banner-text text-xs">{success}</span>
          </div>
        )}

        <div className="providers-hub-container">
          {/* ===================================================================
              CATEGORY 1: Custom Providers
              =================================================================== */}
          {(filterView === "ALL" || filterView === "CUSTOM") && (
            <section className="hub-category-section">
              <div className="hub-category-header">
                <h3 className="hub-category-title">
                  Custom Providers (OpenAI/Anthropic Compatible)
                </h3>
                <div className="hub-category-actions">
                  <button
                    className="btn-add-anthropic"
                    onClick={() => openAddCustom("ANTHROPIC")}
                  >
                    <Plus size={12} />
                    <span>Add Anthropic Compatible</span>
                  </button>
                  <button
                    className="btn-add-openai"
                    onClick={() => openAddCustom("OPENAI")}
                  >
                    <Plus size={12} />
                    <span>Add OpenAI Compatible</span>
                  </button>
                </div>
              </div>

              <div className="catalog-cards-grid">
                {customProviders.length === 0 ? (
                  <div className="col-span-full p-8 text-center border border-dashed border-[#cbd5e1] rounded-xl bg-white/60">
                    <Bot size={28} className="mx-auto text-muted mb-2 opacity-50" />
                    <p className="text-xs font-semibold text-[var(--ink)]">Belum ada Custom Provider</p>
                    <p className="text-[11px] text-muted mt-1 max-w-sm mx-auto">
                      Klik &quot;Add OpenAI Compatible&quot; atau &quot;Add Anthropic Compatible&quot; di atas untuk menghubungkan provider mandiri.
                    </p>
                  </div>
                ) : (
                  customProviders.map((cp) => {
                    const hasConn = cp.connectionsCount > 0;
                    return (
                      <div
                        key={cp.id}
                        className={`provider-catalog-card cursor-pointer ${
                          hasConn ? "has-connections" : ""
                        }`}
                        onClick={() => navigateToProvider(cp.slug)}
                      >
                        <div className="card-left-info">
                          <ProviderAvatar
                            slugOrId={cp.compatibility === "ANTHROPIC" ? "anthropic" : "openai"}
                            name={cp.name}
                            iconName="Bot"
                            brandColor={cp.compatibility === "ANTHROPIC" ? "#d97706" : "#10a37f"}
                            size={32}
                            imgSize={20}
                          />
                          <div className="provider-card-text">
                            <span className="provider-card-name">{cp.name}</span>
                            {hasConn ? (
                              <span className="provider-card-status connected">
                                <span className="status-dot-indicator" />
                                <span>{cp.connectionsCount} Connected</span>
                              </span>
                            ) : (
                              <span className="provider-card-status none">
                                No connections
                              </span>
                            )}
                          </div>
                        </div>
                        {hasConn ? (
                          <span className="text-muted text-[10.5px] font-semibold">
                            Manage
                          </span>
                        ) : (
                          <span className="text-blue text-[10.5px] font-semibold">
                            + Connect
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* ===================================================================
              CATEGORY 2: OAuth Providers (15 Providers)
              =================================================================== */}
          {(filterView === "ALL" || filterView === "OAUTH") && (
            <section className="hub-category-section">
              <div className="hub-category-header">
                <h3 className="hub-category-title">OAuth Providers</h3>
                <div className="hub-category-actions">
                  <button
                    className="btn-test-all"
                    onClick={() => handleTestAll("OAUTH")}
                    disabled={isTestingAll}
                  >
                    <Play size={11} />
                    <span>{isTestingAll ? "Testing..." : "Test All"}</span>
                  </button>
                </div>
              </div>

              <div className="catalog-cards-grid">
                {oauthItems.map((item) => {
                  const conns =
                    connectionsByProvider.get(item.id) ||
                    (item.id === "OPENAI_CODEX" ? connectionsByProvider.get("OPENAI") : []) ||
                    [];
                  const count = conns.length;

                  return (
                    <div
                      key={item.id}
                      className={`provider-catalog-card cursor-pointer ${
                        count > 0 ? "has-connections" : ""
                      }`}
                      onClick={() => navigateToProvider(item.slug)}
                    >
                      <div className="card-left-info">
                        <ProviderAvatar
                          slugOrId={item.slug}
                          name={item.name}
                          iconName={item.iconName}
                          brandColor={item.color}
                          size={32}
                          imgSize={20}
                        />
                        <div className="provider-card-text">
                          <span className="provider-card-name">{item.name}</span>
                          {count > 0 ? (
                            <span className="provider-card-status connected">
                              <span className="status-dot-indicator" />
                              <span>{count} Connected</span>
                            </span>
                          ) : (
                            <span className="provider-card-status none">
                              No connections
                            </span>
                          )}
                        </div>
                      </div>

                      {count > 0 ? (
                        <span className="text-muted text-[10.5px] font-semibold">
                          Manage
                        </span>
                      ) : (
                        <span className="text-blue text-[10.5px] font-semibold">
                          + Connect
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ===================================================================
              CATEGORY 3: API Key Providers (Pre-mapped Endpoints)
              =================================================================== */}
          {(filterView === "ALL" || (filterView as string) === "API_KEY") && (
            <section className="hub-category-section">
              <div className="hub-category-header">
                <h3 className="hub-category-title">API Key Providers</h3>
              </div>

              <div className="catalog-cards-grid">
                {apiKeyItems.map((item) => {
                  const conns = connectionsByProvider.get(item.id) || [];
                  const count = conns.length;

                  return (
                    <div
                      key={item.id}
                      className={`provider-catalog-card cursor-pointer ${
                        count > 0 ? "has-connections" : ""
                      }`}
                      onClick={() => navigateToProvider(item.slug)}
                    >
                      <div className="card-left-info">
                        <ProviderAvatar
                          slugOrId={item.slug}
                          name={item.name}
                          iconName={item.iconName}
                          brandColor={item.color}
                          size={32}
                          imgSize={20}
                        />
                        <div className="provider-card-text">
                          <span className="provider-card-name">{item.name}</span>
                          {count > 0 ? (
                            <span className="provider-card-status connected">
                              <span className="status-dot-indicator" />
                              <span>{count} Connected</span>
                            </span>
                          ) : (
                            <span className="provider-card-status none">
                              No connections
                            </span>
                          )}
                        </div>
                      </div>

                      {count > 0 ? (
                        <span className="text-muted text-[10.5px] font-semibold">
                          Manage
                        </span>
                      ) : (
                        <span className="text-blue text-[10.5px] font-semibold">
                          + Connect
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Modal for adding custom provider */}
        {showCustomModal && (
          <CustomProviderModal
            initialCompatibility={customCompatibility}
            onClose={() => setShowCustomModal(false)}
            onSuccess={(msg) => {
              setSuccess(msg);
              setTimeout(() => setSuccess(""), 4000);
              fetchAll();
            }}
            onError={(msg) => {
              setError(msg);
              setTimeout(() => setError(""), 4000);
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
}
