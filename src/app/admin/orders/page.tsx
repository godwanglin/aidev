"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Receipt,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Coins,
  Crown,
  CreditCard,
  QrCode,
  Building2,
  Copy,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  ShieldCheck,
  CheckCheck,
  Ban,
  Eye,
  Sparkles,
  ArrowUpDown,
  Filter,
} from "lucide-react";

interface OrderUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  subscriptionTier: string;
  creditBalance: number;
}

interface OrderItem {
  id: string;
  orderId: string;
  userId: string;
  tokenAmount: number;
  creditAmount: number;
  orderType: string;
  tierTarget: string | null;
  basePrice: number;
  priceIdr: number;
  discountPct: number;
  discountReason: string | null;
  method: string;
  status: string;
  qrString: string | null;
  vaNumber: string | null;
  createdAt: string;
  paidAt: string | null;
  user: OrderUser | null;
}

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  totalRevenueIdr: number;
  totalCreditsIssued: number;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    totalOrders: 0,
    pendingOrders: 0,
    paidOrders: 0,
    totalRevenueIdr: 0,
    totalCreditsIssued: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Notifications
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals
  const [approveModalOrder, setApproveModalOrder] = useState<OrderItem | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const [cancelModalOrder, setCancelModalOrder] = useState<OrderItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const [detailModalOrder, setDetailModalOrder] = useState<OrderItem | null>(null);

  const fetchOrders = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMsg("");

      try {
        const queryParams = new URLSearchParams({
          q: searchQuery,
          status: statusFilter,
          orderType: typeFilter,
          page: String(page),
          limit: "15",
          sortBy,
          sortOrder,
        });

        const res = await fetch(`/api/admin/orders?${queryParams.toString()}`);
        const data = await res.json();

        if (data.success) {
          setOrders(data.orders || []);
          if (data.stats) setStats(data.stats);
          setTotalPages(data.totalPages || 1);
          setTotalCount(data.total || 0);
        } else {
          setErrorMsg(data.error || "Gagal memuat daftar transaksi");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Gagal terhubung ke API transaksi");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery, statusFilter, typeFilter, page, sortBy, sortOrder]
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Submit Approval
  const handleConfirmApprove = async () => {
    if (!approveModalOrder) return;
    setIsApproving(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: approveModalOrder.orderId,
          action: "APPROVE",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(
          `Pesanan ${approveModalOrder.orderId} berhasil di-approve! Saldo/paket pengguna ${approveModalOrder.user?.email || ""} telah aktif.`
        );
        setTimeout(() => setSuccessMsg(""), 5000);
        setApproveModalOrder(null);
        await fetchOrders(true);
      } else {
        setErrorMsg(data.error || "Gagal menyetujui pesanan");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal terhubung ke server");
    } finally {
      setIsApproving(false);
    }
  };

  // Submit Cancellation
  const handleConfirmCancel = async () => {
    if (!cancelModalOrder) return;
    setIsCancelling(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: cancelModalOrder.orderId,
          action: "CANCEL",
          reason: cancelReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Pesanan ${cancelModalOrder.orderId} telah dibatalkan.`);
        setTimeout(() => setSuccessMsg(""), 4000);
        setCancelModalOrder(null);
        setCancelReason("");
        await fetchOrders(true);
      } else {
        setErrorMsg(data.error || "Gagal membatalkan pesanan");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal terhubung ke server");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Kelola Transaksi & Approval Pesanan"
          subtitle="Pantau seluruh transaksi top-up & langganan, verifikasi pembayaran manual (mode sandbox), dan injeksikan paket/kredit secara instan ke akun pengguna."
        >
          <button
            type="button"
            className="control btn-inline cursor-pointer"
            onClick={() => fetchOrders(true)}
            disabled={refreshing || loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span>{refreshing ? "Memperbarui..." : "Refresh"}</span>
          </button>
        </PageHead>

        {/* Success Alert Banner */}
        {successMsg && (
          <div
            className="banner-alert"
            style={{
              marginBottom: "16px",
              background: "#ecfdf5",
              borderColor: "#a7f3d0",
              color: "#065f46",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 16px",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <CheckCircle2 size={18} className="text-green shrink-0" />
            <div style={{ flex: 1, fontSize: "13px" }}>
              <strong>Berhasil!</strong> {successMsg}
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg("")}
              className="cursor-pointer"
              style={{ background: "none", border: "none", color: "#065f46", padding: "4px" }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMsg && (
          <div
            className="login-error"
            style={{
              marginBottom: "16px",
              background: "#fef2f2",
              borderColor: "#fecaca",
              color: "#991b1b",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 16px",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <AlertCircle size={18} className="text-red shrink-0" />
            <div style={{ flex: 1, fontSize: "13px" }}>
              <strong>Perhatian:</strong> {errorMsg}
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg("")}
              className="cursor-pointer"
              style={{ background: "none", border: "none", color: "#991b1b", padding: "4px" }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* 4 Stat Summary Cards */}
        <div className="admin-stats-grid">
          {/* Card 1: Total Orders */}
          <div className="card" style={{ padding: "14px 16px", borderRadius: "var(--radius-lg)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>Total Transaksi</span>
              <Receipt size={16} className="text-blue shrink-0" />
            </div>
            <div className="stat-value" style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>
              {stats.totalOrders.toLocaleString("id-ID")}
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
              Semua order masuk di sistem
            </div>
          </div>

          {/* Card 2: Menunggu Approval (Pending) */}
          <div
            className="card"
            style={{
              padding: "14px 16px",
              borderRadius: "var(--radius-lg)",
              border: stats.pendingOrders > 0 ? "1px solid #fde68a" : "1px solid var(--line)",
              background: stats.pendingOrders > 0 ? "#fffbeb" : "var(--card)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 600, color: stats.pendingOrders > 0 ? "#92400e" : "var(--muted)" }}>
                Menunggu Approval
              </span>
              <Clock size={16} className={stats.pendingOrders > 0 ? "text-amber-500 animate-pulse shrink-0" : "text-muted shrink-0"} />
            </div>
            <div className="stat-value" style={{ fontSize: "22px", fontWeight: 800, color: stats.pendingOrders > 0 ? "#b45309" : "var(--ink)" }}>
              {stats.pendingOrders.toLocaleString("id-ID")}
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: stats.pendingOrders > 0 ? "#92400e" : "var(--muted)", marginTop: "4px" }}>
              {stats.pendingOrders > 0 ? "Perlu verifikasi admin" : "Tidak ada antrian pending"}
            </div>
          </div>

          {/* Card 3: Transaksi Selesai (Paid) */}
          <div className="card" style={{ padding: "14px 16px", borderRadius: "var(--radius-lg)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>Transaksi Berhasil</span>
              <CheckCircle2 size={16} className="text-green shrink-0" />
            </div>
            <div className="stat-value" style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)" }}>
              {stats.paidOrders.toLocaleString("id-ID")}
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
              Telah disetujui & kredit terinjeksi
            </div>
          </div>

          {/* Card 4: Total Omset (IDR) */}
          <div className="card" style={{ padding: "14px 16px", borderRadius: "var(--radius-lg)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span className="stat-title" style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>Total Omset</span>
              <Coins size={16} className="text-amber-500 shrink-0" />
            </div>
            <div className="stat-value" style={{ fontSize: "20px", fontWeight: 800, color: "var(--ink)" }}>
              Rp {stats.totalRevenueIdr.toLocaleString("id-ID")}
            </div>
            <div className="stat-sub" style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
              Total omset pesanan PAID
            </div>
          </div>
        </div>


        {/* Filter & Search Toolbar */}
        <div
          className="card"
          style={{
            padding: "12px 16px",
            marginBottom: "16px",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Search Input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: "1 1 260px",
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "0 10px",
              height: "36px",
            }}
          >
            <Search size={14} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Cari Order ID, Email, Nama pengguna..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                width: "100%",
                fontSize: "12.5px",
                color: "var(--ink)",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "2px" }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter Dropdowns Container */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            {/* Status Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)" }}>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="control cursor-pointer"
                style={{ height: "36px", fontSize: "12px", padding: "0 10px", borderRadius: "6px", fontWeight: 500 }}
              >
                <option value="ALL">Semua Status</option>
                <option value="PENDING">Menunggu Approval</option>
                <option value="PAID">Berhasil (PAID)</option>
                <option value="CANCELLED">Dibatalkan</option>
                <option value="EXPIRED">Kedaluwarsa</option>
              </select>
            </div>

            {/* Type Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)" }}>Tipe:</span>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="control cursor-pointer"
                style={{ height: "36px", fontSize: "12px", padding: "0 10px", borderRadius: "6px", fontWeight: 500 }}
              >
                <option value="ALL">Semua Tipe</option>
                <option value="TOPUP">Top-Up Ketengan</option>
                <option value="SUBSCRIPTION">Subscription Tier</option>
              </select>
            </div>

            {/* Sort Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)" }}>Urutan:</span>
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [f, o] = e.target.value.split(":");
                  setSortBy(f);
                  setSortOrder(o as "asc" | "desc");
                  setPage(1);
                }}
                className="control cursor-pointer"
                style={{ height: "36px", fontSize: "12px", padding: "0 10px", borderRadius: "6px", fontWeight: 500 }}
              >
                <option value="createdAt:desc">Terbaru</option>
                <option value="createdAt:asc">Terlama</option>
                <option value="priceIdr:desc">Nominal Tertinggi</option>
                <option value="priceIdr:asc">Nominal Terendah</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transactions Table Panel */}
        <div className="card" style={{ padding: "0", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
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
                minWidth: "1120px",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", width: "160px" }}>
                    ORDER ID
                  </th>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", width: "230px" }}>
                    PENGGUNA
                  </th>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", width: "180px" }}>
                    PRODUK / TARGET
                  </th>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", width: "160px" }}>
                    TAGIHAN & KREDIT
                  </th>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", width: "140px" }}>
                    METODE
                  </th>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", width: "130px" }}>
                    STATUS
                  </th>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", width: "130px" }}>
                    TANGGAL
                  </th>
                  <th style={{ padding: "12px 14px", fontSize: "11.5px", fontWeight: 700, color: "var(--muted)", textAlign: "right", width: "170px" }}>
                    AKSI ADMIN
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                      <div style={{ fontSize: "13px" }}>Memuat daftar transaksi...</div>
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center" }}>
                      <Receipt size={32} className="text-muted" style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                      <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                        Tidak ada transaksi ditemukan
                      </h4>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)" }}>
                        Coba sesuaikan kata kunci pencarian atau filter status.
                      </p>
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const isPending = o.status === "PENDING";
                    const isPaid = o.status === "PAID";
                    const isCancelled = o.status === "CANCELLED";
                    const isSub = o.orderType === "SUBSCRIPTION";

                    return (
                      <tr
                        key={o.id}
                        style={{
                          borderBottom: "1px solid var(--line-subtle)",
                          transition: "background 0.15s ease",
                        }}
                      >
                        {/* 1. ORDER ID */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <code
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  fontFamily: "monospace",
                                  color: "var(--ink)",
                                }}
                              >
                                {o.orderId}
                              </code>
                              <button
                                type="button"
                                className="cursor-pointer"
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: "2px",
                                  color: "var(--muted)",
                                }}
                                onClick={() => handleCopy(o.orderId, o.id)}
                                title="Salin Order ID"
                              >
                                {copiedId === o.id ? (
                                  <Check size={12} className="text-green" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                            <div style={{ marginTop: "3px" }}>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: isSub ? "#f5f3ff" : "#ecfdf5",
                                  color: isSub ? "#7c3aed" : "#059669",
                                  border: isSub ? "1px solid #ddd6fe" : "1px solid #a7f3d0",
                                }}
                              >
                                {isSub ? "SUBSCRIPTION" : "TOPUP"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. PENGGUNA */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          {o.user ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "50%",
                                  background: "var(--blue-soft)",
                                  color: "var(--blue)",
                                  fontWeight: 700,
                                  fontSize: "11px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                {o.user.name
                                  ? o.user.name.charAt(0).toUpperCase()
                                  : o.user.email.charAt(0).toUpperCase()}
                              </div>
                              <div style={{ overflow: "hidden" }}>
                                <div
                                  style={{
                                    fontSize: "12.5px",
                                    fontWeight: 600,
                                    color: "var(--ink)",
                                    whiteSpace: "nowrap",
                                    textOverflow: "ellipsis",
                                    overflow: "hidden",
                                  }}
                                  title={o.user.email}
                                >
                                  {o.user.email}
                                </div>
                                <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>
                                  {o.user.name || "User"} · Tier:{" "}
                                  <strong style={{ color: "var(--ink)" }}>{o.user.subscriptionTier}</strong>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--muted)" }}>User telah dihapus</span>
                          )}
                        </td>

                        {/* 3. PRODUK / TARGET */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          {isSub ? (
                            <div>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Crown size={12} className="text-purple-600" />
                                <span style={{ fontWeight: 700, fontSize: "12.5px", color: "#6d28d9" }}>
                                  {o.tierTarget} TIER
                                </span>
                              </div>
                              <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "2px" }}>
                                +{(o.creditAmount / 1000).toLocaleString("id-ID")}K CR / bln (30 hari)
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Coins size={12} className="text-green" />
                                <span style={{ fontWeight: 700, fontSize: "12.5px", color: "var(--ink)" }}>
                                  +{o.creditAmount.toLocaleString("id-ID")} CR
                                </span>
                              </div>
                              <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "2px" }}>
                                Kredit Permanen Top-Up
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 4. TAGIHAN & KREDIT */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--ink)" }}>
                              Rp {o.priceIdr.toLocaleString("id-ID")}
                            </div>
                            {o.discountPct > 0 && (
                              <div style={{ fontSize: "10px", color: "#059669", fontWeight: 600, marginTop: "2px" }}>
                                Diskon {o.discountPct}% ({o.discountReason || "Promo"})
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. METODE */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "var(--ink-soft)",
                              }}
                            >
                              {o.method === "QRIS" ? (
                                <>
                                  <QrCode size={13} className="text-blue" />
                                  <span>QRIS</span>
                                </>
                              ) : (
                                <>
                                  <Building2 size={13} className="text-muted" />
                                  <span>VA {o.method}</span>
                                </>
                              )}
                            </div>
                            {o.vaNumber && (
                              <div style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--muted)", marginTop: "2px" }}>
                                {o.vaNumber}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 6. STATUS */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          {isPending ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "#fef3c7",
                                color: "#92400e",
                                border: "1px solid #fde68a",
                              }}
                            >
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  background: "#d97706",
                                  display: "inline-block",
                                }}
                              />
                              Pending
                            </span>
                          ) : isPaid ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "#ecfdf5",
                                color: "#065f46",
                                border: "1px solid #a7f3d0",
                              }}
                            >
                              <CheckCircle2 size={11} className="text-green" />
                              Lunas / Selesai
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: 600,
                                background: "#f1f5f9",
                                color: "#64748b",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              {o.status}
                            </span>
                          )}
                        </td>

                        {/* 7. TANGGAL */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                          <div>
                            <div style={{ fontSize: "11.5px", color: "var(--ink-soft)" }}>
                              {new Date(o.createdAt).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "1px" }}>
                              {new Date(o.createdAt).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </td>

                        {/* 8. AKSI ADMIN */}
                        <td style={{ padding: "12px 14px", verticalAlign: "middle", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                            {isPending ? (
                              <>
                                {/* Tombol Approve & Injeksi */}
                                <button
                                  type="button"
                                  onClick={() => setApproveModalOrder(o)}
                                  title="Setujui dan Injeksikan Saldo/Paket Sekarang"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    height: "28px",
                                    padding: "0 10px",
                                    fontSize: "11.5px",
                                    fontWeight: 700,
                                    borderRadius: "6px",
                                    background: "#059669",
                                    color: "#ffffff",
                                    border: "none",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    boxShadow: "0 1px 2px rgba(5, 150, 105, 0.2)",
                                  }}
                                >
                                  <CheckCheck size={12} strokeWidth={2.5} />
                                  <span>Approve</span>
                                </button>

                                {/* Tombol Tolak / Batalkan */}
                                <button
                                  type="button"
                                  onClick={() => setCancelModalOrder(o)}
                                  title="Batalkan Pesanan Ini"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    height: "28px",
                                    width: "28px",
                                    borderRadius: "6px",
                                    background: "#ffffff",
                                    color: "#dc2626",
                                    border: "1px solid #fecaca",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  <Ban size={12} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDetailModalOrder(o)}
                                title="Lihat Detail Transaksi"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  height: "28px",
                                  padding: "0 10px",
                                  fontSize: "11.5px",
                                  fontWeight: 500,
                                  borderRadius: "6px",
                                  background: "#ffffff",
                                  color: "var(--ink-soft)",
                                  border: "1px solid var(--line)",
                                  cursor: "pointer",
                                }}
                              >
                                <Eye size={12} />
                                <span>Detail</span>
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
          {!loading && orders.length > 0 && (
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
              <div>
                Menampilkan halaman <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{page}</strong> dari{" "}
                <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{totalPages || 1}</strong> (Total{" "}
                <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{totalCount}</strong> transaksi)
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
        {/* MODAL 1: KONFIRMASI APPROVAL & INJEKSI                         */}
        {/* ============================================================== */}
        {approveModalOrder && (
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
                maxWidth: "500px",
                padding: "22px",
                borderRadius: "var(--radius-xl)",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              {/* Modal Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: "#ecfdf5",
                      color: "#059669",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CheckCheck size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
                      Approval Manual & Injeksi Saldo
                    </h3>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--muted)" }}>
                      Verifikasi pembayaran dan aktifkan paket user sekarang
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setApproveModalOrder(null)}
                  className="btn-close cursor-pointer"
                  title="Tutup dialog"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Order Summary Box */}
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "14px",
                  marginBottom: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="text-muted">Order ID:</span>
                  <code style={{ fontWeight: 700, fontFamily: "monospace" }}>{approveModalOrder.orderId}</code>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="text-muted">Pengguna:</span>
                  <strong style={{ color: "var(--ink)" }}>{approveModalOrder.user?.email || "Unknown"}</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="text-muted">Nominal Pembayaran:</span>
                  <strong style={{ fontSize: "13px", color: "var(--blue)" }}>
                    Rp {approveModalOrder.priceIdr.toLocaleString("id-ID")}
                  </strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="text-muted">Metode:</span>
                  <span>{approveModalOrder.method}</span>
                </div>

                <div
                  style={{
                    borderTop: "1px dashed var(--line)",
                    paddingTop: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>Benefit yang Diinjeksikan:</span>
                  {approveModalOrder.orderType === "SUBSCRIPTION" ? (
                    <span
                      style={{
                        fontWeight: 700,
                        color: "#7c3aed",
                        background: "#f5f3ff",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        border: "1px solid #ddd6fe",
                      }}
                    >
                      {approveModalOrder.tierTarget} TIER (+
                      {(approveModalOrder.creditAmount / 1000).toLocaleString("id-ID")}K CR / 30 Hari)
                    </span>
                  ) : (
                    <span
                      style={{
                        fontWeight: 700,
                        color: "#059669",
                        background: "#ecfdf5",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        border: "1px solid #a7f3d0",
                      }}
                    >
                      +{approveModalOrder.creditAmount.toLocaleString("id-ID")} CR Permanen
                    </span>
                  )}
                </div>
              </div>

              {/* Informative Alert */}
              <div
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "11.5px",
                  color: "#1e40af",
                  lineHeight: "1.45",
                }}
              >
                <strong>Catatan Sandbox:</strong> Pesanan akan diubah menjadi status <strong>PAID</strong>, kredit
                langsung diinjeksi ke akun pengguna, dan riwayat topup akan tercatat pada mutasi saldo.
              </div>

              {/* Actions Footer */}
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
                  onClick={() => setApproveModalOrder(null)}
                  disabled={isApproving}
                  style={{ height: "36px", padding: "0 18px", borderRadius: "8px", fontWeight: 500 }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApprove}
                  disabled={isApproving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    height: "36px",
                    padding: "0 20px",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "13px",
                    background: "#059669",
                    color: "#ffffff",
                    border: "none",
                    cursor: isApproving ? "not-allowed" : "pointer",
                    boxShadow: "0 1px 3px rgba(5, 150, 105, 0.3)",
                  }}
                >
                  {isApproving && <RefreshCw size={14} className="animate-spin" />}
                  <span>{isApproving ? "Memproses Approval..." : "Approve & Injeksi Sekarang"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL 2: KONFIRMASI PEMBATALAN ORDER                           */}
        {/* ============================================================== */}
        {cancelModalOrder && (
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
                maxWidth: "440px",
                padding: "22px",
                borderRadius: "var(--radius-xl)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: "#fef2f2",
                      color: "#dc2626",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ban size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
                      Batalkan Pesanan
                    </h3>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--muted)" }}>
                      Order: <strong>{cancelModalOrder.orderId}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="btn-close cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ fontSize: "12.5px", color: "var(--ink-soft)", lineHeight: 1.5, margin: "0 0 12px" }}>
                Apakah kamu yakin ingin membatalkan pesanan ini? Pengguna tidak akan dapat membayar nomor VA atau QRIS yang terkait lagi.
              </p>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", display: "block", marginBottom: "6px" }}>
                  Alasan Pembatalan (Opsional):
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Kadaluwarsa, permintaan pengguna, transaksi ganda..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
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
                  onClick={() => setCancelModalOrder(null)}
                  disabled={isCancelling}
                  style={{ height: "36px", padding: "0 18px", borderRadius: "8px", fontWeight: 500 }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={isCancelling}
                  style={{
                    height: "36px",
                    padding: "0 20px",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "13px",
                    background: "#dc2626",
                    color: "#ffffff",
                    border: "none",
                    cursor: isCancelling ? "not-allowed" : "pointer",
                  }}
                >
                  {isCancelling ? "Membatalkan..." : "Batalkan Pesanan"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MODAL 3: DETAIL TRANSAKSI                                      */}
        {/* ============================================================== */}
        {detailModalOrder && (
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "8px",
                      background: "var(--blue-soft)",
                      color: "var(--blue)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Receipt size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--ink)" }}>
                      Rincian Transaksi
                    </h3>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "var(--muted)" }}>
                      Order: <strong>{detailModalOrder.orderId}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailModalOrder(null)}
                  className="btn-close cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Details Key-Value List */}
              <div
                style={{
                  background: "var(--surface)",
                  borderRadius: "8px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  fontSize: "12px",
                  border: "1px solid var(--line)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">Status:</span>
                  <span style={{ fontWeight: 700, color: detailModalOrder.status === "PAID" ? "#059669" : "var(--ink)" }}>
                    {detailModalOrder.status}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">Pengguna:</span>
                  <strong>{detailModalOrder.user?.email || "Unknown"}</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">User ID:</span>
                  <code style={{ fontSize: "11px", fontFamily: "monospace" }}>{detailModalOrder.userId}</code>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">Tipe Pesanan:</span>
                  <strong>{detailModalOrder.orderType}</strong>
                </div>

                {detailModalOrder.tierTarget && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-muted">Target Subscription:</span>
                    <strong style={{ color: "#7c3aed" }}>{detailModalOrder.tierTarget} TIER</strong>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">Jumlah Kredit (CR):</span>
                  <strong style={{ color: "var(--green)" }}>
                    +{detailModalOrder.creditAmount.toLocaleString("id-ID")} CR
                  </strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">Total Tagihan (IDR):</span>
                  <strong style={{ fontSize: "13px", color: "var(--ink)" }}>
                    Rp {detailModalOrder.priceIdr.toLocaleString("id-ID")}
                  </strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">Metode Pembayaran:</span>
                  <span>{detailModalOrder.method}</span>
                </div>

                {detailModalOrder.vaNumber && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-muted">Nomor Virtual Account:</span>
                    <code style={{ fontWeight: 700, color: "var(--blue)" }}>{detailModalOrder.vaNumber}</code>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="text-muted">Waktu Dibuat:</span>
                  <span>{new Date(detailModalOrder.createdAt).toLocaleString("id-ID")}</span>
                </div>

                {detailModalOrder.paidAt && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="text-muted">Waktu Lunas (Paid At):</span>
                    <strong style={{ color: "#059669" }}>
                      {new Date(detailModalOrder.paidAt).toLocaleString("id-ID")}
                    </strong>
                  </div>
                )}
              </div>

              {/* QR Preview if QRIS */}
              {detailModalOrder.qrString && (
                <div style={{ marginTop: "14px", textAlign: "center" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                    QR Code QRIS:
                  </span>
                  <img
                    src={detailModalOrder.qrString}
                    alt="QRIS Preview"
                    style={{ width: "160px", height: "160px", margin: "0 auto", borderRadius: "8px", border: "1px solid var(--line)" }}
                  />
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  marginTop: "20px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--line-subtle)",
                }}
              >
                <button
                  type="button"
                  className="control cursor-pointer"
                  onClick={() => setDetailModalOrder(null)}
                  style={{ height: "36px", padding: "0 20px", borderRadius: "8px", fontWeight: 500 }}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
