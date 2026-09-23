"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import CustomDropdown from "@/components/CustomDropdown";
import {
  Users,
  Crown,
  Coins,
  ShieldCheck,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Plus,
  ArrowUpDown,
  Clock,
  Sparkles,
  Zap,
  Tag,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  Shield,
  User,
  X,
  CreditCard,
  Layers,
} from "lucide-react";

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  creditBalance: number;
  purchasedCredits: number;
  monthlyCreditsAllocated: number;
  monthlyCreditsRemaining: number;
  tokenBalance: number;
  subscriptionTier: string;
  subscriptionStartedAt: string | null;
  subscriptionExpiresAt: string | null;
  isSubscriptionExpired: boolean;
  bonusRescueClaimed: boolean;
  createdAt: string;
  apiKeysCount: number;
  ordersCount: number;
}

interface TierConfigItem {
  id: string;
  name: string;
  priceIdr: number;
  monthlyCredits: number;
  rpmLimit: number;
  maxKeys: number;
  routingPriority: string;
  badgeColor: string;
  description?: string;
}

interface UserStats {
  totalUsers: number;
  activeSubscribers: number;
  totalCreditsInCirculation: number;
  totalAdmins: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [tiers, setTiers] = useState<TierConfigItem[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalUsers: 0,
    activeSubscribers: 0,
    totalCreditsInCirculation: 0,
    totalAdmins: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Feedback states
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal 1: Ubah Tier
  const [tierModalUser, setTierModalUser] = useState<UserItem | null>(null);
  const [selectedTierId, setSelectedTierId] = useState("FREE");
  const [autoAddCredits, setAutoAddCredits] = useState(true);
  const [isUpdatingTier, setIsUpdatingTier] = useState(false);

  // Modal 2: Injeksi Kredit
  const [injectModalUser, setInjectModalUser] = useState<UserItem | null>(null);
  const [injectAmount, setInjectAmount] = useState<string>("50000");
  const [injectType, setInjectType] = useState<"PERMANENT" | "MONTHLY">("PERMANENT");
  const [injectReason, setInjectReason] = useState("");
  const [isInjectingCredits, setIsInjectingCredits] = useState(false);

  // Modal 3: Role Change Confirm
  const [roleModalUser, setRoleModalUser] = useState<UserItem | null>(null);
  const [targetRole, setTargetRole] = useState<"USER" | "ADMIN">("USER");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const fetchUsers = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMsg("");

      try {
        const queryParams = new URLSearchParams({
          q: searchQuery,
          tier: tierFilter,
          role: roleFilter,
          page: String(page),
          limit: "20",
          sortBy,
          sortOrder,
        });

        const res = await fetch(`/api/admin/users?${queryParams.toString()}`);
        const data = await res.json();

        if (data.success) {
          setUsers(data.users || []);
          setTiers(data.tiers || []);
          if (data.stats) setStats(data.stats);
          setTotalPages(data.totalPages || 1);
          setTotalCount(data.total || 0);
        } else {
          setErrorMsg(data.error || "Gagal memuat daftar pengguna");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Gagal terhubung ke API pengguna");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery, tierFilter, roleFilter, page, sortBy, sortOrder]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function handleCopy(text: string, id: string) {
    if (typeof window !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  }

  // Action: Open Ubah Tier Modal
  function openChangeTierModal(u: UserItem) {
    setTierModalUser(u);
    setSelectedTierId(u.subscriptionTier || "FREE");
    setAutoAddCredits(true);
  }

  // Submit Ubah Tier
  async function handleSubmitChangeTier(e: React.FormEvent) {
    e.preventDefault();
    if (!tierModalUser) return;

    setIsUpdatingTier(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: tierModalUser.id,
          action: "CHANGE_TIER",
          tierId: selectedTierId,
          addCredits: autoAddCredits,
        }),
      });

      const data = await res.json();

      if (data.success) {
        showSuccess(data.message || `Tier berhasil diubah ke ${selectedTierId}`);
        setTierModalUser(null);
        fetchUsers(true);
      } else {
        setErrorMsg(data.error || "Gagal mengubah subscription tier");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengirim permintaan ubah tier");
    } finally {
      setIsUpdatingTier(false);
    }
  }

  // Action: Open Injeksi Kredit Modal
  function openInjectCreditsModal(u: UserItem) {
    setInjectModalUser(u);
    setInjectAmount("50000");
    setInjectType("PERMANENT");
    setInjectReason("");
  }

  // Submit Injeksi Kredit
  async function handleSubmitInjectCredits(e: React.FormEvent) {
    e.preventDefault();
    if (!injectModalUser) return;

    const numAmount = parseInt(injectAmount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg("Nominal kredit harus berupa angka positif!");
      return;
    }

    setIsInjectingCredits(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: injectModalUser.id,
          action: "INJECT_CREDITS",
          amount: numAmount,
          creditType: injectType,
          reason: injectReason.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        showSuccess(data.message || `Berhasil menginjeksikan +${numAmount.toLocaleString()} CR`);
        setInjectModalUser(null);
        fetchUsers(true);
      } else {
        setErrorMsg(data.error || "Gagal menginjeksikan saldo kredit");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengirim permintaan injeksi kredit");
    } finally {
      setIsInjectingCredits(false);
    }
  }

  // Action: Open Role Modal
  function openChangeRoleModal(u: UserItem) {
    setRoleModalUser(u);
    setTargetRole(u.role === "ADMIN" ? "USER" : "ADMIN");
  }

  // Submit Role Change
  async function handleSubmitChangeRole() {
    if (!roleModalUser) return;

    setIsUpdatingRole(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: roleModalUser.id,
          action: "CHANGE_ROLE",
          role: targetRole,
        }),
      });

      const data = await res.json();

      if (data.success) {
        showSuccess(data.message || `Role berhasil diubah menjadi ${targetRole}`);
        setRoleModalUser(null);
        fetchUsers(true);
      } else {
        setErrorMsg(data.error || "Gagal mengubah role pengguna");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengirim permintaan ubah role");
    } finally {
      setIsUpdatingRole(false);
    }
  }

  const selectedTierConfig = useMemo(() => {
    return tiers.find((t) => t.id === selectedTierId);
  }, [tiers, selectedTierId]);

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Daftar Pengguna & Kelola Tier"
          subtitle="Pantau akun pengguna, ubah paket subscription tier (aktivasi otomatis 30 hari + alokasi kredit), serta injeksikan saldo kredit langsung."
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="control btn-inline flex items-center gap-1.5 cursor-pointer"
              onClick={() => fetchUsers(true)}
              disabled={refreshing}
              title="Perbarui data pengguna"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin text-blue" : "text-muted"} />
              <span>{refreshing ? "Memperbarui..." : "Refresh"}</span>
            </button>
          </div>
        </PageHead>

        {successMsg && (
          <div className="banner-alert mb-4">
            <CheckCircle2 size={16} className="text-green shrink-0" />
            <div className="banner-text">
              <strong>Berhasil!</strong>
              <p>{successMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="login-error mb-4 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Top Metric Stats Cards */}
        <div className="admin-stats-grid">
          {/* Card 1: Total Users */}
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="flex items-center justify-between text-muted" style={{ marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 500 }}>Total Pengguna</span>
              <Users size={16} style={{ color: "var(--blue)" }} className="shrink-0" />
            </div>
            <div className="stat-value" style={{ fontSize: "22px", fontWeight: 700, color: "var(--ink)" }}>
              {stats.totalUsers.toLocaleString("id-ID")}
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
              Akun terdaftar di database
            </div>
          </div>

          {/* Card 2: Active Subscribers */}
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="flex items-center justify-between text-muted" style={{ marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 500 }}>Pelanggan Berbayar</span>
              <Crown size={16} style={{ color: "#8b5cf6" }} className="shrink-0" />
            </div>
            <div className="stat-value" style={{ fontSize: "22px", fontWeight: 700, color: "#8b5cf6" }}>
              {stats.activeSubscribers.toLocaleString("id-ID")}
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
              Tier Plus, Pro, & Ultra aktif
            </div>
          </div>

          {/* Card 3: Total Credits in Circulation */}
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="flex items-center justify-between text-muted" style={{ marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 500 }}>Total Kredit Beredar</span>
              <Coins size={16} style={{ color: "var(--green)" }} className="shrink-0" />
            </div>
            <div className="stat-value" style={{ fontSize: "22px", fontWeight: 700, color: "var(--green)" }}>
              {(stats.totalCreditsInCirculation / 1_000_000).toFixed(2)}M CR
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
              {stats.totalCreditsInCirculation.toLocaleString("id-ID")} CR di dompet user
            </div>
          </div>

          {/* Card 4: Total Admins */}
          <div className="card" style={{ padding: "14px 16px" }}>
            <div className="flex items-center justify-between text-muted" style={{ marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 500 }}>Administrator</span>
              <ShieldCheck size={16} style={{ color: "var(--amber)" }} className="shrink-0" />
            </div>
            <div className="stat-value" style={{ fontSize: "22px", fontWeight: 700, color: "var(--amber)" }}>
              {stats.totalAdmins}
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
              Akses kontrol penuh
            </div>
          </div>
        </div>

        {/* Toolbar Filter & Search */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "16px",
            position: "relative",
            zIndex: 30,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "10px",
              flex: "1 1 300px",
            }}
          >
            {/* Search Input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--card)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-md)",
                padding: "6px 10px",
                flex: "1 1 200px",
                minWidth: "180px",
                maxWidth: "100%",
                gap: "8px",
              }}
            >

              <Search size={14} className="text-muted shrink-0" />
              <input
                type="text"
                placeholder="Cari nama, email, ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: "12.5px",
                  color: "var(--ink)",
                  width: "100%",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                  className="text-muted hover:text-ink"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Tier */}
            <CustomDropdown
              size="md"
              value={tierFilter}
              onChange={(val) => {
                setTierFilter(val);
                setPage(1);
              }}
              options={[
                { value: "ALL", label: "Semua Tier", icon: <Layers size={13} className="text-blue" /> },
                { value: "FREE", label: "Tier Free", icon: <User size={13} className="text-muted" /> },
                { value: "PLUS", label: "Tier Plus", icon: <Crown size={13} style={{ color: "#3b82f6" }} /> },
                { value: "PRO", label: "Tier Pro", icon: <Crown size={13} style={{ color: "#a855f7" }} /> },
                { value: "ULTRA", label: "Tier Ultra", icon: <Crown size={13} style={{ color: "#f59e0b" }} /> },
              ]}
              minWidth={150}
              title="Filter berdasarkan paket langganan"
            />

            {/* Filter Role */}
            <CustomDropdown
              size="md"
              value={roleFilter}
              onChange={(val) => {
                setRoleFilter(val);
                setPage(1);
              }}
              options={[
                { value: "ALL", label: "Semua Role", icon: <Shield size={13} className="text-blue" /> },
                { value: "USER", label: "Role User", icon: <User size={13} className="text-muted" /> },
                { value: "ADMIN", label: "Role Admin", icon: <ShieldCheck size={13} className="text-amber" /> },
              ]}
              minWidth={140}
              title="Filter berdasarkan peran pengguna"
            />
          </div>

          {/* Sort By Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CustomDropdown
              size="md"
              value={sortBy}
              onChange={(val) => {
                setSortBy(val);
                setPage(1);
              }}
              options={[
                { value: "createdAt", label: "Waktu Daftar", icon: <Clock size={13} className="text-muted" /> },
                { value: "creditBalance", label: "Saldo Terbanyak", icon: <Coins size={13} className="text-green" /> },
                { value: "name", label: "Nama Alfabetis", icon: <ArrowUpDown size={13} className="text-muted" /> },
                { value: "email", label: "Email Alfabetis", icon: <ArrowUpDown size={13} className="text-muted" /> },
              ]}
              minWidth={160}
              title="Urutan data"
            />

            <button
              type="button"
              className="control btn-icon-only cursor-pointer"
              onClick={() => {
                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
                setPage(1);
              }}
              title={sortOrder === "asc" ? "Urutan Menaik (A-Z)" : "Urutan Menurun (Z-A)"}
            >
              <ArrowUpDown size={13} className="text-muted" />
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            width: "100%",
            background: "#ffffff",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            className="table-wrap"
            style={{
              width: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              display: "block",
            }}
          >
            <table
              className="table"
              style={{
                width: "100%",
                minWidth: "1080px",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      minWidth: "240px",
                      padding: "11px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    Pengguna & Identitas
                  </th>
                  <th
                    style={{
                      minWidth: "100px",
                      padding: "11px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    Role
                  </th>
                  <th
                    style={{
                      minWidth: "160px",
                      padding: "11px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    Subscription Tier
                  </th>
                  <th
                    style={{
                      minWidth: "180px",
                      padding: "11px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    Saldo Kredit
                  </th>
                  <th
                    style={{
                      minWidth: "90px",
                      padding: "11px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    API Keys
                  </th>
                  <th
                    style={{
                      minWidth: "120px",
                      padding: "11px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    Terdaftar
                  </th>
                  <th
                    style={{
                      minWidth: "190px",
                      padding: "11px 14px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                      textAlign: "right",
                    }}
                  >
                    Aksi Admin
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted text-xs">
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw size={18} className="animate-spin text-blue" />
                        <span>Memuat data pengguna dari database...</span>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted text-xs">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={24} className="text-muted" style={{ opacity: 0.4 }} />
                        <span>Tidak ada pengguna yang cocok dengan kriteria pencarian.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isCopied = copiedId === u.id;
                    const tier = u.subscriptionTier || "FREE";

                    // Badge colors per tier
                    const isUltra = tier === "ULTRA";
                    const isPro = tier === "PRO";
                    const isPlus = tier === "PLUS";
                    const isFree = tier === "FREE";

                    const tierBg = isUltra
                      ? "#fef3c7"
                      : isPro
                      ? "#f3e8ff"
                      : isPlus
                      ? "#eff6ff"
                      : "#f1f5f9";
                    const tierFg = isUltra
                      ? "#b45309"
                      : isPro
                      ? "#7e22ce"
                      : isPlus
                      ? "#1d4ed8"
                      : "#475569";
                    const tierBorder = isUltra
                      ? "#fde68a"
                      : isPro
                      ? "#e9d5ff"
                      : isPlus
                      ? "#bfdbfe"
                      : "#cbd5e1";

                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid var(--line-subtle)" }}>
                        {/* 1. Pengguna & Identitas */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div className="flex items-center gap-2.5">
                            {/* Avatar */}
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "999px",
                                background: isUltra
                                  ? "linear-gradient(135deg, #f59e0b, #d97706)"
                                  : isPro
                                  ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                                  : isPlus
                                  ? "linear-gradient(135deg, #3b82f6, #1d4ed8)"
                                  : "#e2e8f0",
                                color: isFree ? "#475569" : "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "13px",
                                flexShrink: 0,
                              }}
                            >
                              {(u.name || u.email || "U").charAt(0).toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: "13px",
                                  color: "var(--ink)",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <span className="truncate">{u.name}</span>
                              </div>
                              <div
                                style={{ fontSize: "11.5px", color: "var(--muted)" }}
                                className="truncate"
                              >
                                {u.email}
                              </div>
                              <div className="flex items-center gap-1.5" style={{ marginTop: "2px" }}>
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: "10.5px",
                                    color: "var(--muted-light)",
                                    background: "var(--line-subtle)",
                                    padding: "1px 4px",
                                    borderRadius: "3px",
                                  }}
                                >
                                  {u.id.slice(0, 10)}...
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(u.id, u.id)}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                  className={isCopied ? "text-green" : "text-muted hover:text-ink"}
                                  title="Salin User ID Lengkap"
                                >
                                  {isCopied ? <Check size={11} /> : <Copy size={11} />}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Role */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          {u.role === "ADMIN" ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                background: "#fef3c7",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              <ShieldCheck size={11} />
                              ADMIN
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                background: "#f1f5f9",
                                color: "#475569",
                                border: "1px solid #e2e8f0",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 500,
                              }}
                            >
                              USER
                            </span>
                          )}
                        </td>

                        {/* 3. Subscription Tier */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div className="space-y-1">
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: tierBg,
                                color: tierFg,
                                border: `1px solid ${tierBorder}`,
                                padding: "2px 8px",
                                borderRadius: "5px",
                                fontSize: "11.5px",
                                fontWeight: 700,
                              }}
                            >
                              {!isFree && <Crown size={12} />}
                              {tier} TIER
                            </span>

                            {/* Expiry indicator */}
                            {!isFree && u.subscriptionExpiresAt && (
                              <div
                                style={{
                                  fontSize: "10.5px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  color: u.isSubscriptionExpired ? "var(--red)" : "var(--muted)",
                                }}
                              >
                                <Clock size={10} />
                                {u.isSubscriptionExpired ? (
                                   <span style={{ fontWeight: 600 }}>Kedaluwarsa</span>
                                ) : (
                                  <span>
                                    Hingga{" "}
                                    {new Date(u.subscriptionExpiresAt).toLocaleDateString("id-ID", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 4. Saldo Kredit */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: "13px",
                                color: "var(--ink)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Coins size={13} className="text-green" />
                              <span>{u.creditBalance.toLocaleString("id-ID")} CR</span>
                            </div>
                            <div
                              style={{
                                fontSize: "10.5px",
                                color: "var(--muted)",
                                display: "flex",
                                gap: "6px",
                                marginTop: "2px",
                              }}
                            >
                              <span title="Sisa Kuota Bulanan">
                                Kuota: {u.monthlyCreditsRemaining.toLocaleString("id-ID")}
                              </span>
                              <span>•</span>
                              <span title="Kredit Permanen Top-Up">
                                Top-up: {u.purchasedCredits.toLocaleString("id-ID")}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 5. API Keys */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "12px",
                              color: "var(--ink-soft)",
                            }}
                          >
                            <KeyRound size={12} className="text-muted" />
                            <span>{u.apiKeysCount} keys</span>
                          </div>
                        </td>

                        {/* 6. Terdaftar */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                            {new Date(u.createdAt).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </td>

                        {/* 7. Aksi Admin */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                            {/* Tombol Ubah Tier */}
                            <button
                              type="button"
                              className="btn-pill-purple"
                              onClick={() => openChangeTierModal(u)}
                              title="Ubah Paket Subscription Tier"
                            >
                              <Crown size={12} strokeWidth={2} />
                              <span>Ubah Tier</span>
                            </button>

                            {/* Tombol Injeksi Kredit */}
                            <button
                              type="button"
                              className="btn-pill-emerald"
                              onClick={() => openInjectCreditsModal(u)}
                              title="Injeksikan Saldo Kredit Langsung"
                            >
                              <Plus size={12} strokeWidth={2.5} />
                              <span>Injeksi</span>
                            </button>

                            {/* Tombol Role Toggle (khusus non super admin) */}
                            {u.email !== "admin@devportal.local" && (
                              <button
                                type="button"
                                className="table-action-btn"
                                onClick={() => openChangeRoleModal(u)}
                                title={`Ubah Role ke ${u.role === "ADMIN" ? "USER" : "ADMIN"}`}
                              >
                                <Shield size={12} strokeWidth={1.75} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {!loading && users.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderTop: "1px solid var(--line)",
                background: "#ffffff",
                fontSize: "12px",
                color: "var(--muted)",
                flexWrap: "wrap",
                gap: "10px",
                boxSizing: "border-box",
                width: "100%",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                Menampilkan halaman <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{page}</strong> dari{" "}
                <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{totalPages || 1}</strong> (Total{" "}
                <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{totalCount}</strong> pengguna)
              </div>

              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    height: "30px",
                    padding: "0 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    border: "1px solid var(--line)",
                    background: page <= 1 ? "var(--surface-hover)" : "#ffffff",
                    color: page <= 1 ? "var(--muted)" : "var(--ink)",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    opacity: page <= 1 ? 0.5 : 1,
                    transition: "all 0.15s ease",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  }}
                >
                  <ChevronLeft size={13} />
                  <span>Sebelumnya</span>
                </button>

                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--ink-soft)",
                    padding: "0 8px",
                    fontFamily: "monospace",
                  }}
                >
                  {page} / {totalPages || 1}
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    height: "30px",
                    padding: "0 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    border: "1px solid var(--line)",
                    background: page >= totalPages ? "var(--surface-hover)" : "#ffffff",
                    color: page >= totalPages ? "var(--muted)" : "var(--ink)",
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                    opacity: page >= totalPages ? 0.5 : 1,
                    transition: "all 0.15s ease",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  }}
                >
                  <span>Berikutnya</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* MODAL 1: UBAH SUBSCRIPTION TIER                                */}
        {/* ============================================================== */}
        {tierModalUser && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "16px",
            }}
          >
            <div
              className="card animate-fade-in"
              style={{
                width: "100%",
                maxWidth: "520px",
                padding: "22px",
                borderRadius: "var(--radius-xl)",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "#f5f3ff",
                      color: "#7c3aed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Crown size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
                      Ubah Paket Subscription Tier
                    </h3>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--muted)" }}>
                      Pengguna: <strong>{tierModalUser.email}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTierModalUser(null)}
                  className="btn-close cursor-pointer"
                  title="Tutup dialog"
                >
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={handleSubmitChangeTier}
                style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "14px" }}
              >
                {/* Current Active Info */}
                <div
                  style={{
                    background: "var(--line-subtle)",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="text-muted">Tier Aktif Saat Ini:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      background: "var(--card)",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {tierModalUser.subscriptionTier || "FREE"}
                  </span>
                </div>

                {/* Tier Selection Radio Cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>
                    Pilih Paket Tier Baru:
                  </label>

                  {/* FREE OPTION */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "8px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border:
                        selectedTierId === "FREE"
                          ? "2px solid var(--blue)"
                          : "1px solid var(--line)",
                      background: selectedTierId === "FREE" ? "var(--blue-soft)" : "var(--card)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div className="flex items-center gap-3" style={{ flex: "1 1 200px" }}>
                      <input
                        type="radio"
                        name="targetTier"
                        value="FREE"
                        checked={selectedTierId === "FREE"}
                        onChange={() => setSelectedTierId("FREE")}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "13px" }}>Free Tier</div>
                        <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                          20.000 CR kuota awal · 15 RPM · Regular Lane
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginLeft: "auto" }}>
                      Rp 0 / bln
                    </span>
                  </label>

                  {/* DYNAMIC TIERS (PLUS, PRO, ULTRA) */}
                  {tiers
                    .filter((t) => t.id !== "FREE")
                    .map((t) => {
                      const isSelected = selectedTierId === t.id;
                      return (
                        <label
                          key={t.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px",
                            padding: "10px 14px",
                            borderRadius: "8px",
                            border: isSelected
                              ? "2px solid var(--blue)"
                              : "1px solid var(--line)",
                            background: isSelected ? "var(--blue-soft)" : "var(--card)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div className="flex items-center gap-3" style={{ flex: "1 1 200px" }}>
                            <input
                              type="radio"
                              name="targetTier"
                              value={t.id}
                              checked={isSelected}
                              onChange={() => setSelectedTierId(t.id)}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span style={{ fontWeight: 700, fontSize: "13px" }}>{t.name}</span>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    background: "#ecfdf5",
                                    color: "#059669",
                                    padding: "1px 5px",
                                    borderRadius: "3px",
                                  }}
                                >
                                  +{t.monthlyCredits.toLocaleString("id-ID")} CR
                                </span>
                              </div>
                              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                                {t.rpmLimit} RPM · {t.routingPriority} Lane · Max {t.maxKeys} Keys
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)", marginLeft: "auto" }}>
                            Rp {t.priceIdr.toLocaleString("id-ID")}
                          </span>
                        </label>
                      );
                    })}
                </div>

                {/* Auto Add Credits Option */}
                {selectedTierId !== "FREE" && selectedTierConfig && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "8px",
                      padding: "12px 14px",
                    }}
                  >
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoAddCredits}
                        onChange={(e) => setAutoAddCredits(e.target.checked)}
                        style={{ marginTop: "2px" }}
                      />
                      <div style={{ fontSize: "12px" }}>
                        <strong style={{ color: "#166534" }}>
                          Tambahkan kuota paket (+{selectedTierConfig.monthlyCredits.toLocaleString()}{" "}
                          CR) otomatis ke saldo akun
                        </strong>
                        <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#15803d" }}>
                          Paket akan otomatis aktif 30 hari ke depan dan kredit langsung dapat
                          digunakan oleh user.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "24px",
                    paddingTop: "16px",
                    borderTop: "1px solid var(--line-subtle)",
                  }}
                >
                  <button
                    type="button"
                    className="control cursor-pointer"
                    onClick={() => setTierModalUser(null)}
                    disabled={isUpdatingTier}
                    style={{ height: "36px", padding: "0 18px", borderRadius: "8px", fontWeight: 500 }}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="primary btn-inline cursor-pointer"
                    disabled={isUpdatingTier}
                    style={{ height: "36px", padding: "0 20px", borderRadius: "8px", fontWeight: 600 }}
                  >
                    {isUpdatingTier && <RefreshCw size={13} className="animate-spin" />}
                    <span>{isUpdatingTier ? "Menyimpan..." : "Aktifkan Paket & Update Tier"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL 2: INJEKSI SALDO KREDIT                                  */}
        {/* ============================================================== */}
        {injectModalUser && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "16px",
            }}
          >
            <div
              className="card animate-fade-in"
              style={{
                width: "100%",
                maxWidth: "520px",
                padding: "22px",
                borderRadius: "var(--radius-xl)",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "#ecfdf5",
                      color: "#059669",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Coins size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
                      Injeksi Saldo Kredit
                    </h3>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--muted)" }}>
                      Pengguna: <strong>{injectModalUser.email}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setInjectModalUser(null)}
                  className="btn-close cursor-pointer"
                  title="Tutup dialog"
                >
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={handleSubmitInjectCredits}
                style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "14px" }}
              >
                {/* Current Balance */}
                <div
                  style={{
                    background: "var(--line-subtle)",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span className="text-muted">Saldo Saat Ini:</span>
                  <span style={{ fontWeight: 700, color: "var(--green)" }}>
                    {injectModalUser.creditBalance.toLocaleString("id-ID")} CR
                  </span>
                </div>

                {/* Quick Nominal Chips */}
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--ink)",
                      marginBottom: "6px",
                      display: "block",
                    }}
                  >
                    Pilih Nominal Cepat:
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "8px",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    {["10000", "50000", "100000", "500000", "1000000"].map((amt) => {
                      const isSel = injectAmount === amt;
                      return (
                        <button
                          key={amt}
                          type="button"
                          className="control cursor-pointer"
                          style={{
                            height: "32px",
                            fontSize: "11.5px",
                            padding: "0 6px",
                            background: isSel ? "var(--blue-soft)" : "#ffffff",
                            borderColor: isSel ? "var(--blue)" : "var(--line)",
                            color: isSel ? "var(--blue)" : "var(--ink)",
                            fontWeight: isSel ? 700 : 500,
                            borderRadius: "6px",
                            whiteSpace: "nowrap",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                          onClick={() => setInjectAmount(amt)}
                        >
                          +{parseInt(amt, 10).toLocaleString()} CR
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Amount Input */}
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--ink)",
                      marginBottom: "6px",
                      display: "block",
                    }}
                  >
                    Nominal Kredit Kustom (CR):
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1000"
                    value={injectAmount}
                    onChange={(e) => setInjectAmount(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--line)",
                      background: "var(--card)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "var(--ink)",
                      fontFamily: "monospace",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                    Nilai Setara: ≈{" "}
                    <strong>
                      Rp{" "}
                      {(
                        parseInt(injectAmount || "0", 10) / 10
                      ).toLocaleString("id-ID")}
                    </strong>{" "}
                    (Rasio 1 IDR = 10 CR)
                  </div>
                </div>

                {/* Credit Type Selection */}
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--ink)",
                      marginBottom: "6px",
                      display: "block",
                    }}
                  >
                    Kategori Kredit:
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border:
                          injectType === "PERMANENT"
                            ? "2px solid var(--blue)"
                            : "1px solid var(--line)",
                        background: injectType === "PERMANENT" ? "var(--blue-soft)" : "var(--card)",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      <input
                        type="radio"
                        name="injectType"
                        value="PERMANENT"
                        checked={injectType === "PERMANENT"}
                        onChange={() => setInjectType("PERMANENT")}
                      />
                      <div>
                        <strong>Kredit Permanen</strong>
                        <div style={{ fontSize: "10px", color: "var(--muted)" }}>
                          Top-Up (Tidak hangus)
                        </div>
                      </div>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border:
                          injectType === "MONTHLY"
                            ? "2px solid var(--blue)"
                            : "1px solid var(--line)",
                        background: injectType === "MONTHLY" ? "var(--blue-soft)" : "var(--card)",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      <input
                        type="radio"
                        name="injectType"
                        value="MONTHLY"
                        checked={injectType === "MONTHLY"}
                        onChange={() => setInjectType("MONTHLY")}
                      />
                      <div>
                        <strong>Kuota Bulanan</strong>
                        <div style={{ fontSize: "10px", color: "var(--muted)" }}>
                          Reset di akhir siklus
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Reason / Notes */}
                <div>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--ink)",
                      marginBottom: "6px",
                      display: "block",
                    }}
                  >
                    Catatan / Alasan Injeksi:
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Bonus testing, kompensasi error sistem..."
                    value={injectReason}
                    onChange={(e) => setInjectReason(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--line)",
                      background: "var(--card)",
                      fontSize: "12px",
                      color: "var(--ink)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: "10px",
                    marginTop: "24px",
                    paddingTop: "16px",
                    borderTop: "1px solid var(--line-subtle)",
                  }}
                >
                  <button
                    type="button"
                    className="control cursor-pointer"
                    onClick={() => setInjectModalUser(null)}
                    disabled={isInjectingCredits}
                    style={{ height: "36px", padding: "0 18px", borderRadius: "8px", fontWeight: 500 }}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="primary btn-inline cursor-pointer"
                    disabled={isInjectingCredits}
                    style={{ height: "36px", padding: "0 20px", borderRadius: "8px", fontWeight: 600 }}
                  >
                    {isInjectingCredits && <RefreshCw size={13} className="animate-spin" />}
                    <span>{isInjectingCredits ? "Memproses..." : "Injeksikan Kredit Sekarang"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL 3: UBAH ROLE PENGGUNA                                    */}
        {/* ============================================================== */}
        {roleModalUser && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "16px",
            }}
          >
            <div
              className="card animate-fade-in"
              style={{
                width: "100%",
                maxWidth: "420px",
                padding: "20px",
                borderRadius: "var(--radius-xl)",
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: "14px" }}>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-amber" />
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>Ubah Role Pengguna</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRoleModalUser(null)}
                  className="btn-close cursor-pointer"
                  title="Tutup dialog"
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ fontSize: "12.5px", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                Apakah kamu yakin ingin mengubah role akun <strong>{roleModalUser.email}</strong>{" "}
                menjadi <strong className="text-blue">{targetRole}</strong>?
              </p>

              {targetRole === "ADMIN" && (
                <div
                  style={{
                    background: "#fef3c7",
                    border: "1px solid #fde68a",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "11px",
                    color: "#92400e",
                    marginTop: "10px",
                  }}
                >
                  Perhatian: Pengguna berstatus ADMIN dapat mengelola semua pengaturan gateway,
                  saldo, model, dan kuota.
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "20px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--line-subtle)",
                }}
              >
                <button
                  type="button"
                  className="control cursor-pointer"
                  onClick={() => setRoleModalUser(null)}
                  disabled={isUpdatingRole}
                  style={{ height: "36px", padding: "0 18px", borderRadius: "8px", fontWeight: 500 }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="primary btn-inline cursor-pointer"
                  onClick={handleSubmitChangeRole}
                  disabled={isUpdatingRole}
                  style={{ height: "36px", padding: "0 20px", borderRadius: "8px", fontWeight: 600 }}
                >
                  {isUpdatingRole && <RefreshCw size={13} className="animate-spin" />}
                  <span>{isUpdatingRole ? "Menyimpan..." : "Konfirmasi Ubah Role"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
