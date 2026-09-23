"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import CustomDropdown from "@/components/CustomDropdown";
import {
  Crown,
  Coins,
  Sparkles,
  Check,
  CheckCircle2,
  Copy,
  Zap,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  QrCode,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Gauge,
  KeyRound,
  Rocket,
  Flame,
} from "lucide-react";

// Ketengan Packages: 1 IDR = 10 Credits base ratio with bonus credits on higher amounts
const KETENGAN_PACKAGES = [
  {
    credits: 150000,
    price: 15000,
    label: "150k Credits",
    priceLabel: "Rp 15.000",
    tag: "Starter",
    desc: "150.000 Saldo Credits",
  },
  {
    credits: 500000,
    price: 50000,
    label: "500k Credits",
    priceLabel: "Rp 50.000",
    tag: "Popular",
    desc: "500.000 Saldo Credits",
  },
  {
    credits: 1050000,
    price: 100000,
    label: "1.05M Credits",
    priceLabel: "Rp 100.000",
    tag: "Bonus +50k CR",
    desc: "1.050.000 Saldo Credits",
  },
  {
    credits: 2750000,
    price: 250000,
    label: "2.75M Credits",
    priceLabel: "Rp 250.000",
    tag: "Power User (+250k CR)",
    desc: "2.750.000 Saldo Credits",
  },
];

const DEFAULT_TIERS = [
  {
    id: "FREE",
    name: "Free",
    priceIdr: 0,
    monthlyCredits: 20000,
    rpmLimit: 15,
    maxKeys: 2,
    routingPriority: "REGULAR",
    bonusPercentage: 0,
    description: "Cocok untuk eksplorasi dan integrasi awal proyek prototype.",
    features: [
      "20.000 Welcome Credits gratis",
      "Batas 15 Request Per Menit (RPM)",
      "Maksimal 2 API Keys",
      "Jalur Regular Routing",
      "Akses model standar & opensource",
      "Community & standard support",
    ],
  },
  {
    id: "PLUS",
    name: "Plus",
    priceIdr: 49000,
    monthlyCredits: 650000,
    rpmLimit: 30,
    maxKeys: 5,
    routingPriority: "FAST_LANE",
    bonusPercentage: 0,
    description: "Pilihan hemat untuk developer mandiri & testing produksi ringan.",
    features: [
      "650.000 Credits per bulan (Rasio 1:13.26)",
      "Batas 30 Request Per Menit (RPM)",
      "Maksimal 5 API Keys",
      "Jalur Fast Lane Priority",
      "Akses model GPT-5.2 Core & Claude 3.5",
      "Dukungan teknis prioritas",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    priceIdr: 99000,
    monthlyCredits: 1200000,
    rpmLimit: 60,
    maxKeys: 10,
    routingPriority: "FAST_LANE",
    bonusPercentage: 30,
    description: "Paket paling populer untuk tim kecil & automasi skala menengah.",
    features: [
      "1.200.000 Credits per bulan (Rasio 1:12.12)",
      "Batas 60 Request Per Menit (RPM)",
      "Maksimal 10 API Keys",
      "Jalur Fast Lane Priority",
      "Akses model Pro (GPT-5.5, Claude Sonnet)",
      "1x Emergency Rescue Bonus +30% (+360k CR)",
      "Support prioritas 24/7",
    ],
  },
  {
    id: "ULTRA",
    name: "Ultra",
    priceIdr: 249000,
    monthlyCredits: 3500000,
    rpmLimit: 120,
    maxKeys: 999,
    routingPriority: "DEDICATED",
    bonusPercentage: 50,
    description: "Performa tertinggi untuk workload produksi skala enterprise.",
    features: [
      "3.500.000 Credits per bulan (Rasio 1:14.05)",
      "Batas 120 Request Per Menit (RPM)",
      "Unlimited API Keys",
      "Dedicated Lane + Zero Cooldown",
      "Akses penuh seluruh model Flagship",
      "1x Emergency Rescue Bonus +50% (+1.75M CR)",
      "Direct SLA & Dedicated Support",
    ],
  },
];

export default function BillingPage() {
  const [data, setData] = useState<{
    balanceTokens: number;
    creditBalance: number;
    subscriptionTier: string;
    subscriptionExpiresAt: string | null;
    monthlyCreditsAllocated: number;
    monthlyCreditsRemaining: number;
    bonusRescueClaimed: boolean;
    usagePct: number;
    canClaimRescueBonus: boolean;
    tiers: any[];
    totalConsumedTokens: number;
    userDiscount?: { discountPct: number; reason: string | null };
    activeOrder: any;
    topups: any[];
    pagination: any;
  }>({
    balanceTokens: 0,
    creditBalance: 0,
    subscriptionTier: "FREE",
    subscriptionExpiresAt: null,
    monthlyCreditsAllocated: 20000,
    monthlyCreditsRemaining: 20000,
    bonusRescueClaimed: false,
    usagePct: 0,
    canClaimRescueBonus: false,
    tiers: [],
    totalConsumedTokens: 0,
    userDiscount: { discountPct: 0, reason: null },
    activeOrder: null,
    topups: [],
    pagination: { totalCount: 0, totalPages: 1, hasPrevPage: false, hasNextPage: false },
  });

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Bonus Rescue Claim States
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [bonusNotification, setBonusNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modal Checkout States
  const [showModal, setShowModal] = useState(false);
  const [checkoutType, setCheckoutType] = useState<"SUBSCRIPTION" | "TOPUP">("SUBSCRIPTION");
  const [selectedTier, setSelectedTier] = useState<any>(null);
  const [selectedKetengan, setSelectedKetengan] = useState<any>(KETENGAN_PACKAGES[1]);
  const [payMethod, setPayMethod] = useState<"QRIS" | "VA">("QRIS");
  const [selectedBank, setSelectedBank] = useState<"bca" | "bni" | "bri" | "echannel">("bca");
  const [activeInvoice, setActiveInvoice] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceStatusMsg, setInvoiceStatusMsg] = useState<{
    type: "pending" | "success" | "error";
    text: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function fetchBilling(targetPage = page) {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing?page=${targetPage}&limit=${pageSize}`);
      const json = await res.json();
      if (json.creditBalance !== undefined || json.balanceTokens !== undefined) {
        setData(json);
        if (json.activeOrder && !activeInvoice) {
          setActiveInvoice(json.activeOrder);
        }
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchBilling(page);
  }, [page, pageSize]);

  async function handleClaimBonus() {
    setClaimingBonus(true);
    setBonusNotification(null);
    try {
      const res = await fetch("/api/billing/claim-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (json.success) {
        setBonusNotification({
          type: "success",
          text: json.message || `Berhasil mengklaim +${Number(json.bonusCredits).toLocaleString()} Credits!`,
        });
        await fetchBilling(page);
      } else {
        setBonusNotification({
          type: "error",
          text: json.error || "Gagal mengklaim bonus darurat.",
        });
      }
    } catch {
      setBonusNotification({
        type: "error",
        text: "Terjadi kesalahan jaringan saat mengklaim bonus.",
      });
    }
    setClaimingBonus(false);
  }

  function handleOpenSubscriptionCheckout(tier: any) {
    setSelectedTier(tier);
    setCheckoutType("SUBSCRIPTION");
    setActiveInvoice(null);
    setShowModal(true);
  }

  function handleOpenKetenganCheckout(pkg = KETENGAN_PACKAGES[1]) {
    setSelectedKetengan(pkg);
    setCheckoutType("TOPUP");
    setActiveInvoice(null);
    setShowModal(true);
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        orderType: checkoutType,
        method: payMethod,
        bank: selectedBank,
      };

      if (checkoutType === "SUBSCRIPTION") {
        payload.tier = selectedTier?.id || "PLUS";
      } else {
        payload.creditAmount = selectedKetengan?.credits || 500000;
      }

      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success && json.order) {
        setActiveInvoice(json.order);
      }
    } catch {}
    setSubmitting(false);
  }

  async function handleCheckPaymentStatus(orderId: string) {
    setSubmitting(true);
    setInvoiceStatusMsg(null);
    try {
      const res = await fetch(`/api/billing?orderId=${orderId}`, {
        method: "PUT",
      });
      const json = await res.json();
      if (json.success && json.status === "PAID") {
        setInvoiceStatusMsg({
          type: "success",
          text: json.message || "Pembayaran berhasil diverifikasi! Saldo dan paket kamu telah aktif.",
        });
        setTimeout(async () => {
          setActiveInvoice(null);
          setShowModal(false);
          setInvoiceStatusMsg(null);
          setPage(1);
          await fetchBilling(1);
        }, 1500);
      } else {
        setInvoiceStatusMsg({
          type: "pending",
          text:
            json.message ||
            "Pembayaran belum terkonfirmasi oleh sistem atau masih menunggu approval Admin. Silakan lakukan transfer jika belum, lalu periksa kembali.",
        });
      }
    } catch {
      setInvoiceStatusMsg({
        type: "error",
        text: "Gagal memeriksa status pembayaran. Pastikan koneksi stabil.",
      });
    }
    setSubmitting(false);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const currentTier = (data.subscriptionTier || "FREE").toUpperCase();
  const tiersToRender = data.tiers && data.tiers.length > 0 ? data.tiers : DEFAULT_TIERS;
  const currentDiscountPct = data.userDiscount?.discountPct || 0;

  // Formatter helpers
  const formatNum = (n: number) => Number(n || 0).toLocaleString("id-ID");

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Subscription & Credit Billing"
        >
          <button
            className="control btn-inline"
            onClick={() => fetchBilling(page)}
            title="Refresh Status"
          >
            <RefreshCw size={13} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            className="primary btn-inline"
            onClick={() => handleOpenKetenganCheckout()}
          >
            <Coins size={13} strokeWidth={2} />
            <span>Beli Credits Ketengan</span>
          </button>
        </PageHead>

        {/* Bonus Rescue Alert Notification */}
        {bonusNotification && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium mb-4 ${
              bonusNotification.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {bonusNotification.type === "success" ? (
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={15} className="text-red-600 shrink-0" />
            )}
            <span>{bonusNotification.text}</span>
          </div>
        )}

        {/* Emergency Rescue Bonus Banner (PRO & ULTRA >= 95% usage) */}
        {data.canClaimRescueBonus && (
          <div className="rescue-banner">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <Zap size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-amber-900 text-sm font-semibold">
                    Emergency Rescue Bonus Siap Diklaim!
                  </strong>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                    +{currentTier === "ULTRA" ? "50%" : "30%"} Bonus Kuota
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                  Penggunaan kuota bulanan Anda saat ini telah mencapai <strong>{data.usagePct}%</strong> (&ge; 95%).
                  Klaim kuota darurat tambahan sebesar{" "}
                  <strong>
                    {currentTier === "ULTRA" ? "+1.750.000 Credits" : "+360.000 Credits"}
                  </strong>{" "}
                  secara instan ke akun Anda tanpa biaya tambahan (1x per periode langganan).
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rescue-btn"
              onClick={handleClaimBonus}
              disabled={claimingBonus}
            >
              <Sparkles size={14} />
              <span>{claimingBonus ? "Mengklaim Bonus..." : "Klaim Bonus Darurat Sekarang"}</span>
            </button>
          </div>
        )}

        {/* Status Indicator if Bonus already claimed */}
        {(currentTier === "PRO" || currentTier === "ULTRA") && data.bonusRescueClaimed && (
          <div className="rescue-claimed-banner">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              <strong>Emergency Rescue Bonus ({currentTier === "ULTRA" ? "+50%" : "+30%"})</strong> berhasil diklaim untuk periode langganan saat ini.
            </span>
          </div>
        )}

        {/* Top Status & Metrics Grid (3-Column Layout) */}
        <div className="billing-summary-grid">
          {/* Card 1: Subscription Plan */}
          <article className="summary-card">
            <div className="summary-card-header">
              <span className="summary-card-label">Subscription Plan</span>
              <span className={`tier-badge-pill ${currentTier.toLowerCase()}`}>
                <Crown size={11} />
                <span>{currentTier} PLAN</span>
              </span>
            </div>

            <div className="summary-card-body">
              <div className="summary-tier-title">
                <Sparkles size={18} className="text-blue shrink-0" />
                <span>{currentTier} TIER</span>
              </div>

              <div className="space-y-1.5 mt-auto">
                <div className="quota-stat-row">
                  <span className="quota-stat-label">Kuota Bulanan</span>
                  <span className="quota-stat-value">
                    {formatNum(Math.max(0, data.monthlyCreditsAllocated - data.monthlyCreditsRemaining))} / {formatNum(data.monthlyCreditsAllocated)} CR
                  </span>
                </div>

                <div className="quota-progress-track">
                  <div
                    className={`quota-progress-fill ${data.usagePct >= 95 ? "warning" : "normal"}`}
                    style={{ width: `${Math.min(data.usagePct, 100)}%` }}
                  />
                </div>

                <div className="quota-meta-row">
                  <span className="font-semibold text-ink-soft">Terpakai {data.usagePct}%</span>
                  <span>
                    {data.subscriptionExpiresAt
                      ? `Berlaku hingga ${new Date(data.subscriptionExpiresAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}`
                      : "Paket Gratis Tanpa Batas Waktu"}
                  </span>
                </div>
              </div>
            </div>
          </article>

          {/* Card 2: Total Credit Balance */}
          <article className="summary-card">
            <div className="summary-card-header">
              <span className="summary-card-label">Total Credit Balance</span>
            </div>

            <div className="summary-card-body">
              <div>
                <div className="balance-main-row">
                  <Coins size={22} className="text-amber-500 shrink-0 self-center" />
                  <span className="balance-val">{formatNum(data.creditBalance)}</span>
                  <span className="balance-unit">CR</span>
                </div>

                <div className="balance-info-sub">
                  Saldo kredit aktif fleksibel siap pakai untuk semua model AI tanpa masa kedaluwarsa.
                </div>
              </div>

              <div className="balance-action-wrap">
                <button
                  type="button"
                  className="balance-topup-btn"
                  onClick={() => handleOpenKetenganCheckout()}
                >
                  <Coins size={13} />
                  <span>Top-Up Kredit Ketengan</span>
                  <ArrowRight size={12} className="ml-auto" />
                </button>
              </div>
            </div>
          </article>

          {/* Card 3: Access Limits */}
          <article className="summary-card">
            <div className="summary-card-header">
              <span className="summary-card-label">Access Limits</span>
            </div>

            <div className="summary-card-body">
              <div className="limits-list">
                <div className="limit-item">
                  <div className="limit-label-wrap">
                    <Gauge size={14} className="text-blue" />
                    <span>Rate Limit (RPM)</span>
                  </div>
                  <span className="limit-val-mono">
                    {currentTier === "ULTRA" ? "120 RPM" : currentTier === "PRO" ? "60 RPM" : currentTier === "PLUS" ? "30 RPM" : "15 RPM"}
                  </span>
                </div>

                <div className="limit-item">
                  <div className="limit-label-wrap">
                    <KeyRound size={14} className="text-amber-500" />
                    <span>Maximum API Keys</span>
                  </div>
                  <span className="limit-val-mono">
                    {currentTier === "ULTRA" ? "Unlimited Keys" : currentTier === "PRO" ? "10 Keys" : currentTier === "PLUS" ? "5 Keys" : "2 Keys"}
                  </span>
                </div>

                <div className="limit-item">
                  <div className="limit-label-wrap">
                    <Rocket size={14} className="text-purple-500" />
                    <span>Routing Priority</span>
                  </div>
                  <span className={`limit-pill ${
                    currentTier === "ULTRA" ? "dedicated" : currentTier === "FREE" ? "" : "fast-lane"
                  }`}>
                    {currentTier === "ULTRA" ? "Dedicated + Zero Cooldown" : currentTier === "FREE" ? "Regular Lane" : "Fast Lane Priority"}
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Section 1: 4 Subscription Tiers Grid */}
        <section className="billing-tier-section">
          <div className="panel-title flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Crown size={16} className="text-amber-500" />
                <span>Pilihan Paket Langganan (Monthly Subscriptions)</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Dapatkan rasio kredit hemat (1 IDR &asymp; 13+ Credits), akses model eksklusif, limit RPM lebih tinggi, dan fast-lane routing.
              </p>
            </div>
          </div>

          <div className="tier-grid">
            {tiersToRender.map((tier: any) => {
              const tierKey = tier.id.toUpperCase();
              const isCurrent = currentTier === tierKey;
              const isFeatured = tierKey === "PRO";
              const defaultTierObj = DEFAULT_TIERS.find((d) => d.id === tierKey);
              const features = tier.features || defaultTierObj?.features || [];

              return (
                <div
                  key={tier.id}
                  className={`tier-card ${isCurrent ? "current" : ""} ${isFeatured ? "featured" : ""}`}
                >
                  {isFeatured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                      PALING POPULER
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className={`tier-badge-pill ${tierKey.toLowerCase()}`}>
                      <Crown size={10} />
                      <span>{tier.name || tierKey}</span>
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        PAKET AKTIF
                      </span>
                    )}
                  </div>

                  <div className="tier-price-val">
                    {tier.priceIdr === 0 ? "Gratis" : `Rp ${tier.priceIdr.toLocaleString("id-ID")}`}
                    {tier.priceIdr > 0 && <span className="tier-price-period"> / bulan</span>}
                  </div>

                  <div className="tier-credits-alloc">
                    <span className="tier-credits-label">Alokasi Kredit Bulanan</span>
                    <div className="tier-credits-val-wrap">
                      <span className="tier-credits-val">+{formatNum(tier.monthlyCredits)}</span>
                      <span className="tier-credits-unit">CR</span>
                    </div>
                    <span className="tier-credits-sub">
                      {tier.priceIdr > 0
                        ? `Rasio hemat 1:${(tier.monthlyCredits / tier.priceIdr).toFixed(1)} IDR to Credits`
                        : "Bonus awal pendaftaran"}
                    </span>
                  </div>

                  <ul className="tier-features-list">
                    {features.map((feat: string, fIdx: number) => (
                      <li key={fIdx} className="tier-feature-item">
                        <Check size={13} className="text-blue shrink-0 tier-feature-icon" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-2">
                    {isCurrent ? (
                      <button
                        type="button"
                        className="control w-full btn-inline justify-center opacity-75 cursor-default text-xs font-semibold"
                        disabled
                      >
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        <span>Paket Anda Saat Ini</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`w-full btn-inline justify-center text-xs font-semibold ${
                          isFeatured ? "primary" : "control"
                        }`}
                        onClick={() => handleOpenSubscriptionCheckout(tier)}
                      >
                        <Sparkles size={13} />
                        <span>{tier.priceIdr === 0 ? "Pilih Free" : `Upgrade ke ${tier.name || tierKey}`}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Payment & Transaction History Table */}
        <article className="panel logs billing-history-panel">
          <div className="panel-title flex items-center justify-between">
            <h2>Riwayat Pembayaran & Top-Up</h2>
            <span className="text-xs text-muted">Total: {data.pagination?.totalCount || 0} Transaksi</span>
          </div>
          <div className="logs-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Deskripsi Transaksi</th>
                  <th>Kredit Didapatkan</th>
                  <th>Total Bayar</th>
                  <th>Metode Pembayaran</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-muted">
                      Memuat data riwayat transaksi...
                    </td>
                  </tr>
                ) : data.topups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-muted">
                      Belum ada riwayat transaksi pembayaran.
                    </td>
                  </tr>
                ) : (
                  data.topups.map((t) => (
                    <tr key={t.id}>
                      <td className="text-muted text-xs">
                        {new Date(t.createdAt).toLocaleString("id-ID")}
                      </td>
                      <td className="cell-strong text-xs font-semibold">{t.description}</td>
                      <td className="mono text-emerald-600 font-semibold text-xs whitespace-nowrap">
                        +{formatNum(t.amount / 10)} CR
                      </td>
                      <td className="mono text-xs font-semibold">Rp {t.priceIdr.toLocaleString("id-ID")}</td>
                      <td>
                        <span className="env env-production text-xs">{t.method}</span>
                      </td>
                      <td>
                        <span className="badge-status online text-[11px]">Success</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <div className="table-footer-left">
              <span className="table-footer-text">
                Menampilkan {data.pagination?.totalCount === 0 ? 0 : (page - 1) * pageSize + 1} hingga{" "}
                {Math.min(page * pageSize, data.pagination?.totalCount || 0)} dari {data.pagination?.totalCount || 0} transaksi
              </span>
              <div className="per-page-wrap flex items-center gap-2">
                <span className="text-muted text-xs">Per halaman:</span>
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
                    { value: "20", label: "20" },
                  ]}
                  minWidth={72}
                  align="right"
                />
              </div>
            </div>

            <div className="pager">
              <button
                className="pager-btn"
                disabled={!data.pagination?.hasPrevPage}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={11} />
                <span>Prev</span>
              </button>
              <span className="pager-info">
                {page} / {data.pagination?.totalPages || 1}
              </span>
              <button
                className="pager-btn"
                disabled={!data.pagination?.hasNextPage}
                onClick={() => setPage((p) => Math.min(p + 1, data.pagination?.totalPages || 1))}
              >
                <span>Next</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </article>

        {/* Modal Checkout Direct QRIS & VA */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "520px", maxWidth: "95vw" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  {activeInvoice ? (
                    <QrCode size={16} className="text-blue shrink-0" />
                  ) : checkoutType === "SUBSCRIPTION" ? (
                    <Crown size={16} className="text-amber-500 shrink-0" />
                  ) : (
                    <Coins size={16} className="text-amber-500 shrink-0" />
                  )}
                  <h3 className="modal-title-text">
                    {activeInvoice
                      ? "Pembayaran Instan (QRIS / Virtual Account)"
                      : checkoutType === "SUBSCRIPTION"
                      ? `Langganan Paket ${selectedTier?.name || selectedTier?.id}`
                      : "Top-Up Saldo Credits Ketengan"}
                  </h3>
                </div>
                <button
                  className="btn-close"
                  onClick={() => {
                    setShowModal(false);
                    setActiveInvoice(null);
                  }}
                >
                  &#x2715;
                </button>
              </div>

              {!activeInvoice ? (
                /* Step 1: Package Selection & Payment Method */
                <form onSubmit={handleCreateInvoice}>
                  {/* TOPUP: Interactive Package Selector */}
                  {checkoutType === "TOPUP" ? (
                    <div className="form-group mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-ink">
                          1. Pilih Paket Kredit Ketengan:
                        </label>
                      </div>
                      <div className="ketengan-modal-grid">
                        {KETENGAN_PACKAGES.map((pkg) => {
                          const isSelected = selectedKetengan?.credits === pkg.credits;
                          const discountedPriceNum =
                            currentDiscountPct > 0
                              ? Math.round(pkg.price * (1 - currentDiscountPct / 100))
                              : pkg.price;

                          return (
                            <div
                              key={pkg.credits}
                              className={`ketengan-modal-card ${isSelected ? "selected" : ""}`}
                              onClick={() => setSelectedKetengan(pkg)}
                            >
                              <span className="ketengan-modal-tag">{pkg.tag}</span>
                              <div className="ketengan-modal-amount">{pkg.label}</div>
                              <div className="ketengan-modal-tokens">{pkg.desc}</div>
                              <div className="ketengan-modal-price">
                                {currentDiscountPct > 0 ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="line-through text-xs text-muted font-normal">
                                      {pkg.priceLabel}
                                    </span>
                                    <span>Rp {discountedPriceNum.toLocaleString("id-ID")}</span>
                                  </span>
                                ) : (
                                  pkg.priceLabel
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* SUBSCRIPTION: Tier Summary Card */
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg mb-3">
                      <div className="text-[11px] text-muted font-semibold uppercase tracking-wider">
                        Paket Langganan Dipilih:
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <strong className="text-base font-bold text-ink">
                          Paket {selectedTier?.name || selectedTier?.id} (30 Hari)
                        </strong>
                        <strong className="text-base font-mono text-blue font-bold">
                          Rp {Number(selectedTier?.priceIdr || 0).toLocaleString("id-ID")}
                        </strong>
                      </div>
                      <div className="text-xs text-muted mt-1.5 flex items-center justify-between">
                        <span>Alokasi Kredit Bulanan:</span>
                        <span className="font-mono text-emerald-600 font-bold">
                          +{formatNum(selectedTier?.monthlyCredits)} CR
                        </span>
                      </div>
                    </div>
                  )}

                  {currentDiscountPct > 0 && checkoutType === "TOPUP" && (
                    <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 p-2 rounded mb-3 font-medium">
                      ✓ {data.userDiscount?.reason} ({currentDiscountPct}% promo diskon otomatis diterapkan saat checkout)
                    </div>
                  )}

                  <div className="form-group">
                    <label className="text-xs font-semibold text-ink block mb-1.5">
                      {checkoutType === "TOPUP" ? "2. Pilih Jalur Pembayaran:" : "Pilih Jalur Pembayaran:"}
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`pay-method-btn ${payMethod === "QRIS" ? "active" : ""}`}
                        onClick={() => setPayMethod("QRIS")}
                      >
                        <QrCode size={14} />
                        <span>Direct QRIS (Semua Bank/e-Wallet)</span>
                      </button>
                      <button
                        type="button"
                        className={`pay-method-btn ${payMethod === "VA" ? "active" : ""}`}
                        onClick={() => setPayMethod("VA")}
                      >
                        <CreditCard size={14} />
                        <span>Direct Virtual Account</span>
                      </button>
                    </div>
                  </div>

                  {payMethod === "VA" && (
                    <div className="form-group mt-3">
                      <label className="text-xs font-semibold text-ink block mb-1">
                        Pilih Bank Virtual Account:
                      </label>
                      <CustomDropdown
                        size="md"
                        width="100%"
                        value={selectedBank}
                        onChange={(val: any) => setSelectedBank(val)}
                        options={[
                          { value: "bca", label: "BCA Virtual Account", sublabel: "Bank Central Asia" },
                          { value: "echannel", label: "Mandiri Bill Payment", sublabel: "Bank Mandiri" },
                          { value: "bni", label: "BNI Virtual Account", sublabel: "Bank Negara Indonesia" },
                          { value: "bri", label: "BRI Virtual Account", sublabel: "Bank Rakyat Indonesia" },
                        ]}
                      />
                    </div>
                  )}

                  <div className="modal-actions mt-4">
                    <button
                      type="button"
                      className="control"
                      onClick={() => setShowModal(false)}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="primary btn-inline"
                      disabled={submitting}
                    >
                      <Sparkles size={13} />
                      <span>{submitting ? "Memproses Kode..." : "Dapatkan QRIS / Kode Bayar"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Step 2: Direct QRIS / VA Code Display */
                <div className="invoice-box">
                  <div className="invoice-summary">
                    <div>
                      <span className="text-xs text-muted">Invoice ID:</span>
                      <strong className="block mono text-xs">{activeInvoice.orderId}</strong>
                      <span className="text-[11px] text-muted block mt-0.5">
                        {activeInvoice.orderType === "SUBSCRIPTION"
                          ? `Paket Langganan ${activeInvoice.tierTarget || "PRO"}`
                          : `Top-Up Ketengan +${formatNum(activeInvoice.creditAmount)} CR`}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted">Total Pembayaran:</span>
                      <strong className="block text-blue text-base font-bold">
                        Rp {Number(activeInvoice.priceIdr || 0).toLocaleString("id-ID")}
                      </strong>
                    </div>
                  </div>

                  {activeInvoice.method === "QRIS" ? (
                    <div className="qris-view">
                      <img
                        src={activeInvoice.qrString}
                        alt="Midtrans QRIS Code"
                        className="qris-img"
                        style={{ width: "200px", height: "200px" }}
                      />
                      <small className="text-muted block mt-2 text-xs font-medium">
                        Scan QRIS langsung dengan BCA Mobile, GoPay, OVO, DANA, ShopeePay, atau m-Banking apa saja.
                      </small>
                    </div>
                  ) : (
                    <div className="va-view">
                      <span className="text-xs text-muted font-semibold block">
                        Nomor Virtual Account ({selectedBank.toUpperCase()}):
                      </span>
                      <div className="copy-box mt-1.5 flex items-center justify-between p-2 bg-white border border-slate-200 rounded">
                        <code className="text-sm font-bold mono text-blue">{activeInvoice.vaNumber}</code>
                        <button
                          type="button"
                          className="btn-copy text-xs font-medium flex items-center gap-1 text-slate-600 hover:text-ink"
                          onClick={() => handleCopy(activeInvoice.vaNumber)}
                        >
                          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          <span>{copied ? "Tersalin" : "Salin VA"}</span>
                        </button>
                      </div>
                      <small className="text-muted block mt-2 text-xs">
                        Transfer tepat sebesar <strong>Rp {Number(activeInvoice.priceIdr || 0).toLocaleString("id-ID")}</strong> ke nomor VA di atas.
                      </small>
                    </div>
                  )}

                  <div
                    style={{
                      background: "var(--line-subtle)",
                      border: "1px solid var(--line)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      marginTop: "12px",
                      fontSize: "11px",
                      color: "var(--muted)",
                      lineHeight: "1.4",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--ink)", fontWeight: 600, marginBottom: "4px" }}>
                      <AlertCircle size={13} className="text-amber-500" />
                      <span>Verifikasi Pembayaran</span>
                    </div>
                    Setelah melakukan pembayaran melalui QRIS atau Virtual Account, sistem payment gateway atau Admin akan memverifikasi transaksi. Saldo kredit dan paket otomatis aktif setelah pesanan terverifikasi.
                  </div>

                  {invoiceStatusMsg && (
                    <div
                      style={{
                        marginTop: "10px",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        fontSize: "12px",
                        background:
                          invoiceStatusMsg.type === "success"
                            ? "#ecfdf5"
                            : invoiceStatusMsg.type === "pending"
                            ? "#fef3c7"
                            : "#fef2f2",
                        border:
                          invoiceStatusMsg.type === "success"
                            ? "1px solid #a7f3d0"
                            : invoiceStatusMsg.type === "pending"
                            ? "1px solid #fde68a"
                            : "1px solid #fecaca",
                        color:
                          invoiceStatusMsg.type === "success"
                            ? "#065f46"
                            : invoiceStatusMsg.type === "pending"
                            ? "#92400e"
                            : "#991b1b",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                      }}
                    >
                      {invoiceStatusMsg.type === "success" ? (
                        <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: "1px" }} />
                      ) : (
                        <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "1px" }} />
                      )}
                      <span>{invoiceStatusMsg.text}</span>
                    </div>
                  )}

                  <div className="invoice-actions mt-3" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <button
                      type="button"
                      className="primary w-full btn-inline justify-center"
                      onClick={() => handleCheckPaymentStatus(activeInvoice.orderId)}
                      disabled={submitting}
                      style={{ height: "38px", fontWeight: 600 }}
                    >
                      <RefreshCw size={14} className={submitting ? "animate-spin" : ""} />
                      <span>
                        {submitting ? "Memeriksa Status Pembayaran..." : "Cek Status Pembayaran"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="control w-full btn-inline justify-center"
                      onClick={() => {
                        setActiveInvoice(null);
                        setShowModal(false);
                        setInvoiceStatusMsg(null);
                      }}
                      style={{ height: "34px", fontSize: "12px" }}
                    >
                      Tutup & Bayar Nanti
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
