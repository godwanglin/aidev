"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import CustomDropdown from "@/components/CustomDropdown";
import { ProviderAvatar, getProviderDisplayName } from "@/components/providers/ProviderIcons";
import EditConnectionModal from "@/components/providers/EditConnectionModal";
import {
  Gauge,
  RefreshCw,
  Power,
  PowerOff,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  Clock,
  Search,
  AlertCircle,
  Layers,
  Eye,
  EyeOff,
  Network,
  Boxes,
  PieChart,
  ArrowRight,
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

export interface QuotaBucketItem {
  id: string;
  name: string;
  remainingFraction: number;
  usedAmount: number;
  totalAmount: number;
  percentage: number;
  resetTime?: string;
  resetHuman?: string;
  status: "HEALTHY" | "LOW" | "EMPTY";
}

export interface AccountQuotaCardData {
  id: string;
  name: string;
  provider: string;
  authType: string;
  accountEmail: string | null;
  isActive: boolean;
  syncStatus: string;
  lastSyncedAt: string | null;
  quotas: QuotaBucketItem[];
}

export interface AggregatedBucketItem {
  id: string;
  name: string;
  accountCount: number;
  sumFraction: number;
  avgPercentage: number;
  earliestResetTime?: string;
  earliestResetHuman?: string;
  status: "HEALTHY" | "LOW" | "EMPTY";
}

export interface AggregatedProviderCardData {
  provider: string;
  providerSlug: string;
  displayName: string;
  totalAccounts: number;
  activeAccounts: number;
  healthyAccounts: number;
  lowAccounts: number;
  exhaustedAccounts: number;
  poolStatus: "NORMAL" | "LOW_QUOTA" | "EXHAUSTED";
  accounts: AccountQuotaCardData[];
  buckets: AggregatedBucketItem[];
}

export default function AdminQuotaTrackerPage() {
  const [accounts, setAccounts] = useState<AccountQuotaCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [providerFilter, setProviderFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"expiring" | "least" | "most" | "name">("expiring");
  const [viewMode, setViewMode] = useState<"account" | "provider">("account");

  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Modals state
  const [editingConnection, setEditingConnection] = useState<any | null>(null);
  const [deletingConnection, setDeletingConnection] = useState<AccountQuotaCardData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [revealedEmailIds, setRevealedEmailIds] = useState<Set<string>>(new Set());
  const [loadingQuotaIds, setLoadingQuotaIds] = useState<Set<string>>(new Set());

  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  function maskEmail(email?: string | null): string {
    if (!email) return "No email assigned";
    const atIdx = email.indexOf("@");
    if (atIdx <= 0) return email;
    const username = email.slice(0, atIdx);
    const domain = email.slice(atIdx);
    if (username.length <= 3) {
      return `${username[0]}***${domain}`;
    }
    return `${username.slice(0, 2)}••••••${username.slice(-1)}${domain}`;
  }

  function toggleRevealEmail(id: string) {
    setRevealedEmailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function formatProviderName(provider: string): string {
    return getProviderDisplayName(provider);
  }

  const fetchSingleAccountQuota = useCallback(async (id: string, bypassCache = false) => {
    setLoadingQuotaIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/quota/${id}${bypassCache ? "?bypassCache=true" : ""}`);
      const json = await res.json();
      if (json.success && json.data) {
        setAccounts((prev) =>
          prev.map((acc) => (acc.id === id ? { ...acc, ...json.data } : acc))
        );
      }
    } catch (err) {
      console.error(`Failed to fetch quota for account ${id}:`, err);
    } finally {
      setLoadingQuotaIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const fetchQuotas = useCallback(
    async (bypassCache = false, isSilent = false) => {
      if (!isSilent) setRefreshing(true);
      try {
        // 1. Fetch metadata summary list instantly (<50ms)
        const res = await fetch("/api/admin/quota?mode=summary");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const summaryList: AccountQuotaCardData[] = json.data;

          // Populate accounts immediately, preserving existing quota buckets if already loaded
          setAccounts((prev) => {
            if (prev.length === 0) return summaryList;
            return summaryList.map((acc) => {
              const existing = prev.find((p) => p.id === acc.id);
              return existing && existing.quotas.length > 0
                ? { ...acc, quotas: existing.quotas, syncStatus: existing.syncStatus }
                : acc;
            });
          });
          setLoading(false);

          // 2. Mark all accounts as loading quota
          setLoadingQuotaIds(new Set(summaryList.map((a) => a.id)));

          // 3. Concurrently fetch live quota per account in parallel
          await Promise.allSettled(
            summaryList.map((acc) => fetchSingleAccountQuota(acc.id, bypassCache))
          );
        } else if (json.error) {
          if (!isSilent) setErrorMsg(json.error);
          setLoading(false);
        }
      } catch {
        if (!isSilent) setErrorMsg("Gagal memuat daftar akun dari server.");
        setLoading(false);
      } finally {
        if (!isSilent) setRefreshing(false);
      }
    },
    [fetchSingleAccountQuota]
  );

  useEffect(() => {
    fetchQuotas(false, true);
  }, [fetchQuotas]);

  // Auto-refresh 30s effect (silent in background)
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        fetchQuotas(false, true);
      }, 30000);
    } else if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefresh, fetchQuotas]);

  // Toggle active single account
  async function handleToggleActive(account: AccountQuotaCardData) {
    const nextState = !account.isActive;
    // Optimistic UI update
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === account.id ? { ...acc, isActive: nextState } : acc))
    );
    setTogglingIds((prev) => new Set(prev).add(account.id));

    try {
      const res = await fetch("/api/admin/quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_active",
          id: account.id,
          targetState: nextState,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        // Rollback on error
        setAccounts((prev) =>
          prev.map((acc) => (acc.id === account.id ? { ...acc, isActive: !nextState } : acc))
        );
        setErrorMsg("Gagal mengubah status aktif koneksi.");
      }
    } catch {
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === account.id ? { ...acc, isActive: !nextState } : acc))
      );
      setErrorMsg("Koneksi bermasalah saat memperbarui status.");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(account.id);
        return next;
      });
    }
  }

  // Bulk action: Turn off empty
  async function handleTurnOffEmpty() {
    setRefreshing(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "turn_off_empty" }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Berhasil menonaktifkan ${json.affected} akun yang kuotanya sudah habis.`);
        setTimeout(() => setSuccessMsg(""), 4000);
        if (json.data) setAccounts(json.data);
      } else {
        setErrorMsg(json.error || "Gagal menjalankan aksi.");
      }
    } catch {
      setErrorMsg("Terjadi kesalahan jaringan.");
    } finally {
      setRefreshing(false);
    }
  }

  // Bulk action: Turn on available
  async function handleTurnOnAvailable() {
    setRefreshing(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "turn_on_available" }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Berhasil mengaktifkan ${json.affected} akun dengan kuota tersedia.`);
        setTimeout(() => setSuccessMsg(""), 4000);
        if (json.data) setAccounts(json.data);
      } else {
        setErrorMsg(json.error || "Gagal menjalankan aksi.");
      }
    } catch {
      setErrorMsg("Terjadi kesalahan jaringan.");
    } finally {
      setRefreshing(false);
    }
  }

  // Delete connection handler
  async function handleDeleteConnection() {
    if (!deletingConnection) return;
    setIsDeleting(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/admin/providers/${deletingConnection.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Koneksi "${deletingConnection.name}" berhasil dihapus.`);
        setTimeout(() => setSuccessMsg(""), 4000);
        setAccounts((prev) => prev.filter((a) => a.id !== deletingConnection.id));
        setDeletingConnection(null);
      } else {
        setErrorMsg(json.error || "Gagal menghapus koneksi.");
      }
    } catch {
      setErrorMsg("Terjadi kesalahan jaringan.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Distinct providers list for filter
  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((acc) => set.add(acc.provider));
    return Array.from(set).sort();
  }, [accounts]);

  // Filter & Sort
  const filteredAccounts = useMemo(() => {
    let list = accounts.filter((acc) => {
      if (providerFilter !== "ALL" && acc.provider !== providerFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = acc.name.toLowerCase().includes(q);
        const matchEmail = (acc.accountEmail || "").toLowerCase().includes(q);
        const matchProvider = acc.provider.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchProvider) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "least") {
        const minA = a.quotas.length > 0 ? Math.min(...a.quotas.map((q) => q.percentage)) : 0;
        const minB = b.quotas.length > 0 ? Math.min(...b.quotas.map((q) => q.percentage)) : 0;
        return minA - minB;
      }
      if (sortBy === "most") {
        const maxA = a.quotas.length > 0 ? Math.max(...a.quotas.map((q) => q.percentage)) : 0;
        const maxB = b.quotas.length > 0 ? Math.max(...b.quotas.map((q) => q.percentage)) : 0;
        return maxB - maxA;
      }
      // "expiring" - earliest reset date first
      const timeA =
        a.quotas.find((q) => q.resetTime)?.resetTime || "9999-12-31T23:59:59Z";
      const timeB =
        b.quotas.find((q) => q.resetTime)?.resetTime || "9999-12-31T23:59:59Z";
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });

    return list;
  }, [accounts, providerFilter, searchQuery, sortBy]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => a.isActive).length;
    let healthyCount = 0;
    let lowOrEmptyCount = 0;

    accounts.forEach((a) => {
      if (a.quotas.length === 0) return; // not loaded yet
      if (a.quotas.some((q) => q.status === "EMPTY" || q.percentage <= 25)) {
        lowOrEmptyCount++;
      } else {
        healthyCount++;
      }
    });

    return { total, active, healthyCount, lowOrEmptyCount };
  }, [accounts]);

  // Aggregated Provider Quota Data
  const aggregatedProviders = useMemo(() => {
    const groups = new Map<string, AccountQuotaCardData[]>();
    for (const acc of filteredAccounts) {
      const list = groups.get(acc.provider) || [];
      list.push(acc);
      groups.set(acc.provider, list);
    }

    const result: AggregatedProviderCardData[] = Array.from(groups.entries()).map(([provider, accs]) => {
      const totalAccounts = accs.length;
      const activeAccounts = accs.filter((a) => a.isActive).length;
      const healthyAccounts = accs.filter((a) => a.syncStatus === "NORMAL").length;
      const lowAccounts = accs.filter((a) => a.syncStatus === "LOW_QUOTA").length;
      const exhaustedAccounts = accs.filter((a) => a.syncStatus === "EXHAUSTED").length;

      const bucketGroups = new Map<
        string,
        {
          name: string;
          items: QuotaBucketItem[];
        }
      >();

      for (const acc of accs) {
        for (const q of acc.quotas) {
          const key = q.name.trim();
          if (!bucketGroups.has(key)) {
            bucketGroups.set(key, { name: q.name, items: [] });
          }
          bucketGroups.get(key)!.items.push(q);
        }
      }

      const buckets = Array.from(bucketGroups.entries()).map(([key, group]) => {
        const count = group.items.length;
        const sumFraction = group.items.reduce(
          (sum, item) =>
            sum +
            (typeof item.remainingFraction === "number"
              ? item.remainingFraction
              : (item.percentage || 0) / 100),
          0
        );
        const avgPercentage = count > 0 ? Math.round((sumFraction / count) * 100) : 0;

        let earliestResetTime: string | undefined;
        let earliestResetHuman: string | undefined;
        let minTime = Infinity;

        for (const item of group.items) {
          if (item.resetTime) {
            const time = new Date(item.resetTime).getTime();
            if (!isNaN(time) && time < minTime) {
              minTime = time;
              earliestResetTime = item.resetTime;
              earliestResetHuman = item.resetHuman;
            }
          }
        }

        return {
          id: key,
          name: group.name,
          accountCount: count,
          sumFraction,
          avgPercentage,
          earliestResetTime,
          earliestResetHuman,
          status:
            avgPercentage > 40
              ? ("HEALTHY" as const)
              : avgPercentage > 15
              ? ("LOW" as const)
              : ("EMPTY" as const),
        };
      });

      // Sort buckets consistently (Gemini Weekly, Gemini 5h, Claude/GPT Weekly, Claude/GPT 5h, etc.)
      buckets.sort((a, b) => {
        const order: Record<string, number> = {
          "Gemini (Weekly)": 1,
          "Gemini (5 Hours)": 2,
          "Claude & GPT (Weekly)": 3,
          "Claude & GPT (5 Hours)": 4,
        };
        const ordA = order[a.name] ?? 99;
        const ordB = order[b.name] ?? 99;
        if (ordA !== ordB) return ordA - ordB;
        return a.name.localeCompare(b.name);
      });

      const poolStatus: "NORMAL" | "LOW_QUOTA" | "EXHAUSTED" =
        exhaustedAccounts === totalAccounts && totalAccounts > 0
          ? "EXHAUSTED"
          : lowAccounts > 0 || (buckets.some((b) => b.status === "EMPTY") && buckets.length > 0)
          ? "LOW_QUOTA"
          : "NORMAL";

      return {
        provider,
        providerSlug: getProviderSlug(provider),
        displayName: formatProviderName(provider),
        totalAccounts,
        activeAccounts,
        healthyAccounts,
        lowAccounts,
        exhaustedAccounts,
        poolStatus,
        accounts: accs,
        buckets,
      };
    });

    // Sort providers based on current sortBy
    if (sortBy === "name") {
      result.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (sortBy === "least") {
      result.sort((a, b) => {
        const minA = a.buckets.length > 0 ? Math.min(...a.buckets.map((b) => b.avgPercentage)) : 0;
        const minB = b.buckets.length > 0 ? Math.min(...b.buckets.map((b) => b.avgPercentage)) : 0;
        return minA - minB;
      });
    } else if (sortBy === "most") {
      result.sort((a, b) => {
        const maxA = a.buckets.length > 0 ? Math.max(...a.buckets.map((b) => b.avgPercentage)) : 0;
        const maxB = b.buckets.length > 0 ? Math.max(...b.buckets.map((b) => b.avgPercentage)) : 0;
        return maxB - maxA;
      });
    } else if (sortBy === "expiring") {
      result.sort((a, b) => {
        const timeA = a.buckets.find((b) => b.earliestResetTime)?.earliestResetTime || "9999-12-31T23:59:59Z";
        const timeB = b.buckets.find((b) => b.earliestResetTime)?.earliestResetTime || "9999-12-31T23:59:59Z";
        return new Date(timeA).getTime() - new Date(timeB).getTime();
      });
    }

    return result;
  }, [filteredAccounts, sortBy]);

  function getBarColor(pct: number) {
    if (pct > 40) return "#10b981"; // green
    if (pct > 15) return "#f59e0b"; // amber
    return "#ef4444"; // red
  }

  function getDotColor(pct: number) {
    if (pct > 25) return "#10b981";
    if (pct > 0) return "#f59e0b";
    return "#ef4444";
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Quota Tracker"
          subtitle="Pantau sisa kuota API per akun & provider secara real-time, jadwal reset, dan kontrol otomatisasi."
        >
          <div className="flex items-center gap-3">
            {/* View Switcher: Per Akun vs Akumulasi Provider */}
            <div className="segmented">
              <button
                type="button"
                className={`seg-btn ${viewMode === "account" ? "active" : ""}`}
                onClick={() => setViewMode("account")}
                title="Tampilkan kartu kuota masing-masing akun"
              >
                <Layers size={13} />
                <span>Per Akun</span>
              </button>
              <button
                type="button"
                className={`seg-btn ${viewMode === "provider" ? "active" : ""}`}
                onClick={() => setViewMode("provider")}
                title="Tampilkan akumulasi kuota gabungan per provider"
              >
                <Boxes size={13} />
                <span>Akumulasi Provider</span>
              </button>
            </div>

            <button
              className="control btn-icon-only"
              onClick={() => fetchQuotas(true, false)}
              disabled={refreshing || loadingQuotaIds.size > 0}
              title="Refresh semua kuota akun secara live"
            >
              <RefreshCw
                size={13}
                strokeWidth={1.75}
                className={refreshing || loadingQuotaIds.size > 0 ? "animate-spin text-blue" : ""}
              />
            </button>
          </div>
        </PageHead>

        {/* Success Alert */}
        {successMsg && (
          <div className="banner-alert mb-3">
            <CheckCircle2 size={16} className="text-green" />
            <div className="banner-text">
              <strong>Berhasil!</strong>
              <p>{successMsg}</p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="login-error mb-3 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Summary Metric Ribbon */}
        <div className="quota-stats-strip">
          <div className="quota-stat-pill">
            <Layers size={13} className="text-blue" />
            <span>
              {viewMode === "provider" ? "Total Provider: " : "Total Akun: "}
              <strong>{viewMode === "provider" ? aggregatedProviders.length : metrics.total}</strong>
            </span>
          </div>
          <div className="quota-stat-pill">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>
              {viewMode === "provider" ? "Total Akun: " : "Aktif: "}
              <strong>{viewMode === "provider" ? `${metrics.active}/${metrics.total} Aktif` : metrics.active}</strong>
            </span>
          </div>
          <div className="quota-stat-pill">
            <CheckCircle2 size={13} className="text-green" />
            <span>
              {viewMode === "provider" ? "Pool Normal: " : "Kuota Sehat (>25%): "}
              <strong>
                {viewMode === "provider"
                  ? aggregatedProviders.filter((p) => p.poolStatus === "NORMAL").length
                  : metrics.healthyCount}
              </strong>
            </span>
          </div>
          {(viewMode === "provider"
            ? aggregatedProviders.filter((p) => p.poolStatus !== "NORMAL").length
            : metrics.lowOrEmptyCount) > 0 && (
            <div className="quota-stat-pill">
              <AlertTriangle size={13} className="text-amber" />
              <span>
                {viewMode === "provider" ? "Pool Menipis / Habis: " : "Menipis / Habis: "}
                <strong>
                  {viewMode === "provider"
                    ? aggregatedProviders.filter((p) => p.poolStatus !== "NORMAL").length
                    : metrics.lowOrEmptyCount}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Quota Toolbar / Filters */}
        <div className="quota-toolbar">
          <div className="quota-toolbar-left">
            {/* Search Input */}
            <div className="quota-search-input">
              <Search size={13} />
              <input
                suppressHydrationWarning
                type="text"
                className="control text-xs"
                placeholder="Search accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Provider Filter Dropdown */}
            <CustomDropdown
              size="md"
              value={providerFilter}
              onChange={(val) => setProviderFilter(val)}
              options={[
                {
                  value: "ALL",
                  label: `All Providers (${accounts.length})`,
                  icon: <Network size={14} style={{ color: "var(--blue)" }} />,
                },
                ...providerOptions.map((prov) => {
                  const count = accounts.filter((a) => a.provider === prov).length;
                  return {
                    value: prov,
                    label: `${formatProviderName(prov)} (${count})`,
                    icon: (
                      <ProviderAvatar
                        slugOrId={getProviderSlug(prov)}
                        name={prov}
                        size={18}
                        imgSize={14}
                        className="shrink-0 rounded"
                        style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }}
                      />
                    ),
                  };
                }),
              ]}
              minWidth={175}
              title="Filter by provider"
            />

            {/* Sort Dropdown */}
            <CustomDropdown
              size="md"
              value={sortBy}
              onChange={(val) => setSortBy(val as any)}
              options={[
                {
                  value: "expiring",
                  label: "Expiring first",
                  icon: <Clock size={13} className="text-amber-500" />,
                },
                {
                  value: "least",
                  label: "Least quota first",
                  icon: <AlertTriangle size={13} className="text-red" />,
                },
                {
                  value: "most",
                  label: "Most quota first",
                  icon: <CheckCircle2 size={13} className="text-emerald-500" />,
                },
                {
                  value: "name",
                  label: "Name (A-Z)",
                  icon: <Layers size={13} className="text-blue" />,
                },
              ]}
              minWidth={160}
              title="Sort accounts"
            />
          </div>

          <div className="quota-toolbar-right">
            {/* Turn off Empty Button */}
            <button
              className="control btn-inline text-xs text-red hover:bg-red-50"
              onClick={handleTurnOffEmpty}
              disabled={refreshing}
              title="Matikan koneksi akun yang kuotanya sudah habis 0%"
            >
              <PowerOff size={12} className="text-red" />
              <span>Turn off Empty</span>
            </button>

            {/* Turn on Available Button */}
            <button
              className="control btn-inline text-xs text-emerald-600 hover:bg-emerald-50"
              onClick={handleTurnOnAvailable}
              disabled={refreshing}
              title="Aktifkan koneksi akun yang memiliki sisa kuota"
            >
              <Power size={12} className="text-emerald-600" />
              <span>Turn on Available</span>
            </button>

            {/* Auto-refresh Switch */}
            <label className="switch-label text-xs ml-1 flex items-center gap-2 cursor-pointer select-none">
              <input
                suppressHydrationWarning
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span className="text-xs text-muted font-medium">Auto-refresh (30s)</span>
            </label>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="panel p-8 text-center text-muted">
            <RefreshCw size={20} className="animate-spin text-blue mx-auto mb-2" />
            <p className="text-xs font-medium">Memuat data kuota upstream...</p>
          </div>
        ) : (viewMode === "account" ? filteredAccounts.length === 0 : aggregatedProviders.length === 0) ? (
          /* Empty State */
          <div className="panel p-8 text-center text-muted">
            <Gauge size={28} className="mx-auto mb-2 text-muted-light" />
            <strong className="block text-ink text-sm mb-1">
              Tidak ada {viewMode === "provider" ? "provider" : "akun"} ditemukan
            </strong>
            <p className="text-xs text-muted mb-3">
              {searchQuery || providerFilter !== "ALL"
                ? "Coba sesuaikan kata kunci pencarian atau filter provider."
                : "Belum ada koneksi provider yang ditambahkan ke sistem."}
            </p>
          </div>
        ) : (
          /* 2-Column Cards Grid */
          <div className="quota-cards-grid">
            {viewMode === "account" ? (
              filteredAccounts.map((card) => {
              const isToggling = togglingIds.has(card.id);
              const providerSlug = card.provider.toLowerCase();

              return (
                <article
                  key={card.id}
                  className={`quota-card ${!card.isActive ? "is-inactive" : ""}`}
                >
                  {/* Card Header */}
                  <div className="quota-card-header">
                    <div className="quota-card-account-info">
                      <ProviderAvatar
                        slugOrId={providerSlug}
                        name={card.provider}
                        size={30}
                        imgSize={18}
                      />
                      <div className="quota-card-account-text">
                        <div className="flex items-center gap-1.5">
                          <strong className="quota-account-name">{formatProviderName(card.provider)}</strong>
                          <span className="text-muted text-[11px] font-normal">
                            ({card.name})
                          </span>
                        </div>
                        <div
                          className="quota-email-wrapper"
                          onClick={() => card.accountEmail && toggleRevealEmail(card.id)}
                          title={
                            card.accountEmail
                              ? revealedEmailIds.has(card.id)
                                ? "Klik untuk menyembunyikan email"
                                : "Klik untuk melihat email lengkap"
                              : card.name
                          }
                        >
                          <span className="quota-account-email mono text-[11px]">
                            {revealedEmailIds.has(card.id)
                              ? card.accountEmail
                              : maskEmail(card.accountEmail)}
                          </span>
                          {card.accountEmail && (
                            <button
                              type="button"
                              className="quota-email-reveal-btn"
                              tabIndex={-1}
                              aria-label={
                                revealedEmailIds.has(card.id)
                                  ? "Sembunyikan email"
                                  : "Tampilkan email"
                              }
                            >
                              {revealedEmailIds.has(card.id) ? (
                                <EyeOff size={11} strokeWidth={1.75} />
                              ) : (
                                <Eye size={11} strokeWidth={1.75} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="quota-card-controls">
                      {/* Quotas count pill */}
                      <span className="quota-pill-badge">
                        {loadingQuotaIds.has(card.id) && card.quotas.length === 0 ? (
                          <span className="flex items-center gap-1 text-blue">
                            <RefreshCw size={9} className="animate-spin" />
                            <span>syncing...</span>
                          </span>
                        ) : (
                          `${card.quotas.length} quota${card.quotas.length !== 1 ? "s" : ""}`
                        )}
                      </span>

                      {/* Active Switch */}
                      <label
                        className="switch-label ml-0.5"
                        title={card.isActive ? "Nonaktifkan akun" : "Aktifkan akun"}
                      >
                        <input
                          suppressHydrationWarning
                          type="checkbox"
                          checked={card.isActive}
                          disabled={isToggling}
                          onChange={() => handleToggleActive(card)}
                        />
                        <span />
                      </label>

                      {/* Refresh single */}
                      <button
                        className="control btn-icon-only text-muted hover:text-ink"
                        style={{ width: "24px", height: "24px", padding: 0 }}
                        onClick={() => fetchSingleAccountQuota(card.id, true)}
                        disabled={loadingQuotaIds.has(card.id)}
                        title="Perbarui kuota akun ini"
                      >
                        <RefreshCw
                          size={11}
                          strokeWidth={1.75}
                          className={loadingQuotaIds.has(card.id) ? "animate-spin text-blue" : ""}
                        />
                      </button>

                      {/* Edit button */}
                      <button
                        className="control btn-icon-only text-muted hover:text-ink"
                        style={{ width: "24px", height: "24px", padding: 0 }}
                        onClick={() => setEditingConnection(card)}
                        title="Edit koneksi akun"
                      >
                        <Edit2 size={11} strokeWidth={1.75} />
                      </button>

                      {/* Delete button */}
                      <button
                        className="control btn-icon-only text-muted hover:text-red"
                        style={{ width: "24px", height: "24px", padding: 0 }}
                        onClick={() => setDeletingConnection(card)}
                        title="Hapus akun"
                      >
                        <Trash2 size={11} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>

                  {/* Card Body - Quotas */}
                  <div className="quota-items-list">
                    {loadingQuotaIds.has(card.id) && card.quotas.length === 0 ? (
                      <div className="quota-skeleton-wrap">
                        <div className="quota-skeleton-row">
                          <div className="quota-skeleton-name quota-skeleton-shimmer" />
                          <div className="quota-skeleton-badge quota-skeleton-shimmer" />
                        </div>
                        <div className="quota-skeleton-bar quota-skeleton-shimmer" />
                        <div className="quota-skeleton-row mt-2">
                          <div
                            className="quota-skeleton-name quota-skeleton-shimmer"
                            style={{ width: "45%" }}
                          />
                          <div className="quota-skeleton-badge quota-skeleton-shimmer" />
                        </div>
                        <div className="quota-skeleton-bar quota-skeleton-shimmer" />
                      </div>
                    ) : card.quotas.length === 0 ? (
                      <p className="text-xs text-muted py-2 italic text-center">
                        Tidak ada metrik kuota terdeteksi untuk akun ini.
                      </p>
                    ) : (
                      card.quotas.map((quota) => {
                        const isOllamaFree =
                          quota.id === "ollama-usage" ||
                          quota.name.toLowerCase().includes("free usage");
                        const pct = quota.percentage;
                        const usedPct = quota.usedAmount ?? 0;
                        const barColor = isOllamaFree
                          ? usedPct > 80
                            ? "#ef4444"
                            : usedPct > 50
                            ? "#f59e0b"
                            : "#10b981"
                          : getBarColor(pct);
                        const dotColor = isOllamaFree
                          ? usedPct > 80
                            ? "#ef4444"
                            : usedPct > 50
                            ? "#f59e0b"
                            : "#10b981"
                          : getDotColor(pct);

                        return (
                          <div key={quota.id} className="quota-bucket-item">
                            {/* Top info */}
                            <div className="quota-bucket-top">
                              <div className="quota-bucket-name-wrap">
                                <span
                                  className="quota-bucket-dot"
                                  style={{ backgroundColor: dotColor }}
                                />
                                <span className="quota-bucket-name">{quota.name}</span>
                              </div>
                              <div className="quota-bucket-right">
                                {(() => {
                                  const isGood = isOllamaFree ? usedPct <= 50 : pct > 40;
                                  const isWarn = isOllamaFree ? usedPct <= 80 : pct > 15;
                                  const pctClass = isGood ? "pct-good" : isWarn ? "pct-warn" : "pct-bad";

                                  return (
                                    <span className={`quota-pct-pill mono ${pctClass}`}>
                                      {isOllamaFree ? `${usedPct}% used` : `${pct.toFixed(0)}%`}
                                    </span>
                                  );
                                })()}
                                {quota.resetHuman && (
                                  <span
                                    className="quota-reset-countdown mono"
                                    title={quota.resetTime}
                                  >
                                    <Clock size={10} className="text-muted" />
                                    <span>{quota.resetHuman}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Sleek progress bar track */}
                            <div className="quota-progress-track">
                              <div
                                className="quota-progress-fill"
                                style={{
                                  width: `${
                                    isOllamaFree
                                      ? Math.min(Math.max(usedPct, 0), 100)
                                      : Math.min(Math.max(pct, 0), 100)
                                  }%`,
                                  backgroundColor: barColor,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="quota-card-footer">
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      <Clock size={10} />
                      <span>
                        Last synced:{" "}
                        {card.lastSyncedAt
                          ? new Date(card.lastSyncedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "Never"}
                      </span>
                    </span>

                    <div className="quota-footer-badges">
                      <span
                        className={`text-[10.5px] px-1.5 py-0.5 rounded font-medium ${
                          card.authType === "OAUTH"
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 dark:border dark:border-blue-800/40"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700/50"
                        }`}
                      >
                        {card.authType}
                      </span>
                      <span
                        className={`text-[10.5px] px-1.5 py-0.5 rounded font-medium ${
                          card.isActive
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border dark:border-emerald-800/40"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 dark:border dark:border-slate-700/50"
                        }`}
                      >
                        {card.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            aggregatedProviders.map((pCard) => {
              const isAnySyncing = pCard.accounts.some((a) => loadingQuotaIds.has(a.id));

              return (
                <article
                  key={pCard.provider}
                  className={`quota-card ${pCard.activeAccounts === 0 ? "is-inactive" : ""}`}
                >
                  {/* Provider Card Header */}
                  <div className="quota-card-header">
                    <div className="quota-card-account-info">
                      <ProviderAvatar
                        slugOrId={pCard.providerSlug}
                        name={pCard.displayName}
                        size={32}
                        imgSize={20}
                      />
                      <div className="quota-card-account-text">
                        <div className="flex items-center gap-1.5">
                          <strong className="quota-account-name text-sm">
                            {pCard.displayName}
                          </strong>
                          <span className="text-[11px] text-muted font-normal">
                            ({pCard.totalAccounts} Akun)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                          <span className="flex items-center gap-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full inline-block"
                              style={{
                                backgroundColor:
                                  pCard.activeAccounts === pCard.totalAccounts
                                    ? "#10b981"
                                    : pCard.activeAccounts > 0
                                    ? "#f59e0b"
                                    : "#ef4444",
                              }}
                            />
                            <span>
                              {pCard.activeAccounts} dari {pCard.totalAccounts} Akun Aktif
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Header Controls */}
                    <div className="quota-card-controls">
                      {/* Pool Status Pill */}
                      {pCard.poolStatus === "NORMAL" ? (
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40">
                          Pool Sehat
                        </span>
                      ) : pCard.poolStatus === "LOW_QUOTA" ? (
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40">
                          Pool Menipis
                        </span>
                      ) : (
                        <span className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40">
                          Pool Habis
                        </span>
                      )}

                      {/* Sync all accounts in this provider */}
                      <button
                        type="button"
                        className="control btn-icon-only text-muted hover:text-ink"
                        style={{ width: "24px", height: "24px", padding: 0 }}
                        onClick={() => {
                          pCard.accounts.forEach((a) => fetchSingleAccountQuota(a.id, true));
                        }}
                        disabled={isAnySyncing}
                        title={`Sinkronisasi kuota semua akun ${pCard.displayName}`}
                      >
                        <RefreshCw
                          size={11}
                          strokeWidth={1.75}
                          className={isAnySyncing ? "animate-spin text-blue" : ""}
                        />
                      </button>

                      {/* Switch to detailed per-account view filtered by this provider */}
                      <button
                        type="button"
                        className="control btn-inline text-xs font-medium py-1 px-2.5 ml-0.5"
                        onClick={() => {
                          setProviderFilter(pCard.provider);
                          setViewMode("account");
                        }}
                        title={`Lihat detail kartu masing-masing akun untuk ${pCard.displayName}`}
                      >
                        <Layers size={11} className="text-blue" />
                        <span>Detail Akun</span>
                        <ArrowRight size={11} className="text-muted" />
                      </button>
                    </div>
                  </div>

                  {/* Provider Card Body: Aggregated Quota Buckets */}
                  <div className="quota-items-list">
                    {isAnySyncing && pCard.buckets.length === 0 ? (
                      <div className="quota-skeleton-wrap">
                        <div className="quota-skeleton-row">
                          <div className="quota-skeleton-name quota-skeleton-shimmer" />
                          <div className="quota-skeleton-badge quota-skeleton-shimmer" />
                        </div>
                        <div className="quota-skeleton-bar quota-skeleton-shimmer" />
                      </div>
                    ) : pCard.buckets.length === 0 ? (
                      <p className="text-xs text-muted py-2 italic text-center">
                        Tidak ada metrik kuota terdeteksi untuk provider ini.
                      </p>
                    ) : (
                      pCard.buckets.map((bucket) => {
                        const pct = bucket.avgPercentage;
                        const barColor = getBarColor(pct);
                        const dotColor = getDotColor(pct);
                        const pctClass = pct > 40 ? "pct-good" : pct > 15 ? "pct-warn" : "pct-bad";

                        return (
                          <div key={bucket.id} className="quota-bucket-item">
                            {/* Top info */}
                            <div className="quota-bucket-top">
                              <div className="quota-bucket-name-wrap">
                                <span
                                  className="quota-bucket-dot"
                                  style={{ backgroundColor: dotColor }}
                                />
                                <span className="quota-bucket-name font-medium">
                                  {bucket.name}
                                </span>
                                <span className="text-[10.5px] text-muted mono">
                                  ({bucket.sumFraction.toFixed(1)} / {bucket.accountCount} Akun)
                                </span>
                              </div>
                              <div className="quota-bucket-right">
                                <span className={`quota-pct-pill mono ${pctClass}`}>
                                  {pct}%
                                </span>
                                {bucket.earliestResetHuman && (
                                  <span
                                    className="quota-reset-countdown mono"
                                    title={`Reset terdekat: ${bucket.earliestResetTime || ""}`}
                                  >
                                    <Clock size={10} className="text-muted" />
                                    <span>{bucket.earliestResetHuman}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="quota-progress-track">
                              <div
                                className="quota-progress-fill"
                                style={{
                                  width: `${Math.min(Math.max(pct, 0), 100)}%`,
                                  backgroundColor: barColor,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Provider Card Footer: Account Breakdown Chips */}
                  <div className="quota-card-footer flex-col items-start gap-1.5">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] text-muted font-medium">
                        Akun Terdaftar ({pCard.totalAccounts}):
                      </span>
                      <span className="text-[10.5px] text-muted">
                        {pCard.buckets.length} Kuota Terakumulasi
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 w-full">
                      {pCard.accounts.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          className="quota-account-chip"
                          title={`${acc.name} (${acc.isActive ? "Aktif" : "Nonaktif"}) - Klik untuk filter ke akun ini`}
                          onClick={() => {
                            setSearchQuery(acc.name);
                            setViewMode("account");
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full inline-block"
                            style={{ backgroundColor: acc.isActive ? "#10b981" : "#94a3b8" }}
                          />
                          <span className="font-medium">{acc.name}</span>
                          {acc.quotas.length > 0 && (
                            <span className="text-[10px] text-muted mono">
                              ({Math.round(acc.quotas.reduce((s, q) => s + q.percentage, 0) / acc.quotas.length)}%)
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })
          )}
          </div>
        )}

        {/* Modal: Edit Connection */}
        {editingConnection && (
          <EditConnectionModal
            connection={editingConnection}
            onClose={() => setEditingConnection(null)}
            onSuccess={(msg) => {
              setSuccessMsg(msg);
              setTimeout(() => setSuccessMsg(""), 4000);
              fetchQuotas(false);
            }}
            onError={(err) => {
              setErrorMsg(err);
              setTimeout(() => setErrorMsg(""), 4000);
            }}
          />
        )}

        {/* Modal: Delete Confirmation (Native Light Design) */}
        {deletingConnection && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "440px" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Trash2 size={16} className="text-red shrink-0" />
                  <h3 className="modal-title-text text-red">Hapus Akun Koneksi</h3>
                </div>
                <button
                  className="btn-close"
                  type="button"
                  onClick={() => setDeletingConnection(null)}
                >
                  ✕
                </button>
              </div>

              <div className="p-1">
                <p className="text-xs text-ink mb-2">
                  Apakah Anda yakin ingin menghapus akun ini dari sistem routing?
                </p>
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 mb-4 text-xs">
                  <div className="font-semibold text-ink">{deletingConnection.name}</div>
                  <div className="text-muted text-[11px]">
                    Provider: {formatProviderName(deletingConnection.provider)}
                  </div>
                  {deletingConnection.accountEmail && (
                    <div className="text-muted text-[11px] mono">
                      Email: {maskEmail(deletingConnection.accountEmail)}
                    </div>
                  )}
                </div>

                <div className="modal-actions flex justify-end gap-2">
                  <button
                    type="button"
                    className="control text-xs"
                    onClick={() => setDeletingConnection(null)}
                    disabled={isDeleting}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="primary btn-inline text-xs"
                    style={{ backgroundColor: "#dc2626", borderColor: "#dc2626" }}
                    onClick={handleDeleteConnection}
                    disabled={isDeleting}
                  >
                    <Trash2 size={12} />
                    <span>{isDeleting ? "Menghapus..." : "Hapus Akun"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
