"use client";

import { useEffect, useState, useMemo } from "react";
import { formatUsd, usdToIdr, idrToUsd, getTierLevel } from "@/lib/billing-config";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import CustomDropdown from "@/components/CustomDropdown";
import { Modal } from "@/components/Modal";
import { Pagination } from "@/components/Pagination";
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
  Wallet,
  ChevronLeft,
  ChevronRight,
  Gauge,
  KeyRound,
  Rocket,
  Flame,
  Lock,
} from "lucide-react";

// Paket Top-Up Saldo USD Ketengan (Dihitung dinamis via idrToUsd)
const KETENGAN_PACKAGES = [
  { price: 15000, tag: "Starter", bonusPct: 0 },
  { price: 50000, tag: "Popular", bonusPct: 0 },
  { price: 100000, tag: "Bonus +5%", bonusPct: 5 },
  { price: 250000, tag: "Power User (+10%)", bonusPct: 10 },
].map((p) => {
  const baseUsd = idrToUsd(p.price);
  const totalUsd = Number((baseUsd * (1 + p.bonusPct / 100)).toFixed(2));
  return {
    balanceUsd: totalUsd,
    price: p.price,
    label: `$${totalUsd}`,
    priceLabel: `Rp ${p.price.toLocaleString("id-ID")}`,
    tag: p.tag,
    desc: `Saldo $${totalUsd}${p.bonusPct > 0 ? ` (Bonus ${p.bonusPct}%)` : ""}`,
  };
});

const DEFAULT_TIERS = [
  {
    id: "FREE",
    name: "Free Tier",
    priceIdr: 0,
    monthlyBalanceUsd: 1,
    rpmLimit: 15,
    maxKeys: 2,
    routingPriority: "REGULAR",
    bonusPercentage: 0,
    description: "Cocok untuk eksplorasi dan integrasi awal proyek prototype.",
    features: [
      "Saldo awal $1.00 gratis",
      "Batas 15 Request Per Menit (RPM)",
      "Maksimal 2 API Keys",
      "Jalur Regular Routing",
      "Akses model standar & opensource",
      "Community & standard support",
    ],
  },
  {
    id: "PLUS",
    name: "Plus Developer",
    priceIdr: 49000,
    monthlyBalanceUsd: 3.0625,
    rpmLimit: 30,
    maxKeys: 5,
    routingPriority: "FAST_LANE",
    bonusPercentage: 0,
    description: "Pilihan hemat untuk developer mandiri & testing produksi ringan.",
    features: [
      "Saldo $3.06 per bulan",
      "Batas 30 Request Per Menit (RPM)",
      "Maksimal 5 API Keys",
      "Jalur Fast Lane Priority",
      "Akses model coding standar",
      "Dukungan teknis prioritas",
    ],
  },
  {
    id: "PRO",
    name: "Pro Developer",
    priceIdr: 99000,
    monthlyBalanceUsd: 6.1875,
    rpmLimit: 60,
    maxKeys: 10,
    routingPriority: "FAST_LANE",
    bonusPercentage: 30,
    description: "Paket paling populer untuk tim kecil & automasi skala menengah.",
    features: [
      "Saldo $6.19 per bulan",
      "Batas 60 Request Per Menit (RPM)",
      "Maksimal 10 API Keys",
      "Jalur Fast Lane Priority",
      "Akses model Pro (GPT-5.5, Claude Sonnet)",
      "1x Emergency Rescue Bonus +30% (+$1.86)",
      "Support prioritas 24/7",
    ],
  },
  {
    id: "ULTRA",
    name: "Ultra Power / Team",
    priceIdr: 249000,
    monthlyBalanceUsd: 15.5625,
    rpmLimit: 120,
    maxKeys: 999,
    routingPriority: "DEDICATED",
    bonusPercentage: 50,
    description: "Performa tertinggi untuk workload produksi skala enterprise.",
    features: [
      "Saldo $15.56 per bulan",
      "Batas 120 Request Per Menit (RPM)",
      "Unlimited API Keys",
      "Dedicated Lane + Zero Cooldown",
      "Akses penuh seluruh model Flagship",
      "1x Emergency Rescue Bonus +50% (+$7.78)",
      "Direct SLA & Dedicated Support",
    ],
  },
];

export default function BillingPage() {
  const [data, setData] = useState<{
    balanceTokens: number;
    balanceUsd: number;
    subscriptionTier: string;
    subscriptionExpiresAt: string | null;
    monthlyBalanceAllocatedUsd: number;
    monthlyBalanceRemainingUsd: number;
    bonusRescueClaimed: boolean;
    usagePct: number;
    canClaimRescueBonus: boolean;
    tiers: any[];
    topupPackages?: any[];
    totalConsumedTokens: number;
    userDiscount?: { discountPct: number; reason: string | null };
    activeOrder: any;
    topups: any[];
    pagination: any;
  }>({
    balanceTokens: 0,
    balanceUsd: 0,
    subscriptionTier: "FREE",
    subscriptionExpiresAt: null,
    monthlyBalanceAllocatedUsd: 0,
    monthlyBalanceRemainingUsd: 0,
    bonusRescueClaimed: false,
    usagePct: 0,
    canClaimRescueBonus: false,
    tiers: [],
    topupPackages: [],
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
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
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
      if (json.balanceUsd !== undefined || json.balanceTokens !== undefined) {
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
          text: json.message || `Berhasil mengklaim +$${Number(json.bonusBalanceUsd || 0).toFixed(2)}!`,
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

  const activePackages = useMemo(() => {
    if (data.topupPackages && data.topupPackages.length > 0) {
      return data.topupPackages.map((p: any) => {
        const totalUsd = Number(
          p.balanceUsd ||
            (idrToUsd(p.priceIdr) * (1 + (p.bonusPercentage || 0) / 100)).toFixed(2)
        );
        return {
          id: p.id,
          name: p.name,
          price: p.priceIdr,
          balanceUsd: totalUsd,
          label: `$${totalUsd}`,
          priceLabel: `Rp ${Number(p.priceIdr).toLocaleString("id-ID")}`,
          tag: p.tag || p.name,
          desc: `Saldo $${totalUsd}${
            p.bonusPercentage > 0 ? ` (Bonus ${p.bonusPercentage}%)` : ""
          }`,
        };
      });
    }
    return KETENGAN_PACKAGES;
  }, [data.topupPackages]);

  const effectiveKetengan = selectedKetengan || activePackages[1] || activePackages[0];

  function handleOpenSubscriptionCheckout(tier: any) {
    const targetTierKey = tier.id.toUpperCase();
    const currentTierName = (data.subscriptionTier || "FREE").toUpperCase();
    const isSubscriptionActive = currentTierName !== "FREE" && Boolean(
      data.subscriptionExpiresAt && new Date(data.subscriptionExpiresAt).getTime() > Date.now()
    );
    const currentTierLevel = getTierLevel(currentTierName);
    const targetTierLevel = getTierLevel(targetTierKey);

    if (isSubscriptionActive && targetTierLevel < currentTierLevel) {
      alert(`Proteksi Downgrade: Anda sedang aktif di paket ${currentTierName}. Tidak dapat downgrade ke paket ${targetTierKey}.`);
      return;
    }

    setInvoiceError(null);
    setSelectedTier(tier);
    setCheckoutType("SUBSCRIPTION");
    setActiveInvoice(null);
    setShowModal(true);
  }

  function handleOpenKetenganCheckout(pkg?: any) {
    setInvoiceError(null);
    setSelectedKetengan(pkg || activePackages[1] || activePackages[0]);
    setCheckoutType("TOPUP");
    setActiveInvoice(null);
    setShowModal(true);
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setInvoiceError(null);
    try {
      const payload: any = {
        orderType: checkoutType,
        method: payMethod,
        bank: selectedBank,
      };

      if (checkoutType === "SUBSCRIPTION") {
        payload.tier = selectedTier?.id || "PLUS";
      } else {
        payload.priceIdr = effectiveKetengan?.price || 50000;
      }

      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success && json.order) {
        setActiveInvoice(json.order);
      } else if (json.error) {
        setInvoiceError(json.error);
      }
    } catch {
      setInvoiceError("Terjadi kesalahan jaringan saat membuat tagihan pembayaran.");
    }
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
  const isSubscriptionActive =
    currentTier !== "FREE" &&
    Boolean(
      data.subscriptionExpiresAt &&
        new Date(data.subscriptionExpiresAt).getTime() > Date.now()
    );
  const currentTierLevel = getTierLevel(currentTier);
  const tiersToRender = data.tiers && data.tiers.length > 0 ? data.tiers : DEFAULT_TIERS;
  const currentDiscountPct = data.userDiscount?.discountPct || 0;

  // Formatter helpers
  const formatNum = (n: number) => Number(n || 0).toLocaleString("id-ID");

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Subscription & Saldo"
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
            <span>Top-Up Saldo</span>
          </button>
        </PageHead>

        {/* Bonus Rescue Alert Notification */}
        {bonusNotification && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium mb-4 ${
              bonusNotification.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80"
                : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/80"
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
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 dark:border dark:border-amber-800/70">
                    +{currentTier === "ULTRA" ? "50%" : "30%"} Bonus Kuota
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                  Penggunaan kuota bulanan Anda saat ini telah mencapai <strong>{data.usagePct}%</strong> (&ge; 95%).
                  Klaim kuota darurat tambahan sebesar{" "}
                  <strong>
                    {currentTier === "ULTRA" ? "+$7.78 (+50%)" : "+$1.86 (+30%)"}
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
                  <span className="quota-stat-value font-mono">
                    ${Number(Math.max(0, data.monthlyBalanceAllocatedUsd - data.monthlyBalanceRemainingUsd)).toFixed(2)} / ${Number(data.monthlyBalanceAllocatedUsd).toFixed(2)}
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

          {/* Card 2: Total Saldo */}
          <article className="summary-card">
            <div className="summary-card-header">
              <span className="summary-card-label">Total Saldo</span>
            </div>

            <div className="summary-card-body">
              <div>
                <div className="balance-main-row flex items-baseline gap-2">
                  <Coins size={22} className="text-amber-500 shrink-0 self-center" />
                  <span className="balance-val font-mono">${Number(data.balanceUsd || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                <div className="balance-info-sub">
                  Saldo fleksibel siap pakai untuk semua model AI tanpa masa kedaluwarsa.
                </div>
              </div>

              <div className="balance-action-wrap">
                <button
                  type="button"
                  className="balance-topup-btn"
                  onClick={() => handleOpenKetenganCheckout()}
                >
                  <Coins size={13} />
                  <span>Top-Up Saldo</span>
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
                Pilih paket langganan bulanan untuk kuota saldo hemat, limit RPM tinggi, dedicated priority, dan akses model flagship.
              </p>
            </div>
          </div>

          <div className="tier-grid">
            {tiersToRender.map((tier: any) => {
              const tierKey = tier.id.toUpperCase();
              const isCurrent = currentTier === tierKey;
              const isFeatured = tierKey === "PRO";
              const defaultTierObj = DEFAULT_TIERS.find((d) => d.id === tierKey);
              const features =
                Array.isArray(tier.features) && tier.features.length > 0
                  ? tier.features
                  : defaultTierObj?.features || [];

              const tierLevel = getTierLevel(tierKey);
              const isTierDowngrade = isSubscriptionActive && tierLevel < currentTierLevel;
              const canRenew = isCurrent && isSubscriptionActive && tier.priceIdr > 0;

              return (
                <div
                  key={tier.id}
                  className={`tier-card ${isCurrent ? "current" : ""} ${isFeatured ? "featured" : ""} ${
                    isTierDowngrade ? "opacity-60 bg-stone-50/50 dark:bg-stone-900/30 border-stone-200 dark:border-stone-800" : ""
                  }`}
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
                    {isCurrent ? (
                      <span className="tier-current-pill">
                        PAKET AKTIF
                      </span>
                    ) : isTierDowngrade ? (
                      <span className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full flex items-center gap-1 border border-stone-200 dark:border-stone-700">
                        <Lock size={9} />
                        <span>TERKUNCI</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="tier-price-val">
                    {tier.priceIdr === 0 ? "Gratis" : `Rp ${tier.priceIdr.toLocaleString("id-ID")}`}
                    {tier.priceIdr > 0 && <span className="tier-price-period"> / bulan</span>}
                  </div>

                  <div className="tier-balance-alloc">
                    <span className="tier-balance-label">Alokasi Saldo Bulanan</span>
                    <div className="tier-balance-val-wrap">
                      <span className="tier-balance-val">
                        +${Number(tier.monthlyBalanceUsd || 0).toFixed(2)}
                      </span>
                    </div>
                    <span className="tier-balance-sub">
                      {tier.priceIdr > 0
                        ? `Rp ${tier.priceIdr.toLocaleString("id-ID")} = $${Number(tier.monthlyBalanceUsd || 0).toFixed(2)}`
                        : "Bonus kuota gratis per bulan"}
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
                      canRenew ? (
                        <button
                          type="button"
                          className="control w-full btn-inline justify-center text-xs font-semibold hover:border-blue-500/50 transition-colors"
                          onClick={() => handleOpenSubscriptionCheckout(tier)}
                        >
                          <RefreshCw size={12} className="text-blue" />
                          <span>Perpanjang (+30 Hari)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="control w-full btn-inline justify-center opacity-75 cursor-default text-xs font-semibold"
                          disabled
                        >
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          <span>Paket Anda Saat Ini</span>
                        </button>
                      )
                    ) : isTierDowngrade ? (
                      <button
                        type="button"
                        className="control w-full btn-inline justify-center opacity-50 cursor-not-allowed text-xs font-semibold text-muted bg-stone-100 dark:bg-stone-800 border-dashed"
                        disabled
                        title={`Downgrade terkunci selama paket ${currentTier} Anda masih aktif`}
                      >
                        <Lock size={12} className="text-muted" />
                        <span>Tier di Bawah {currentTier}</span>
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
                  <th>Saldo Masuk</th>
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
                        +${Number(t.balanceAmountUsd || 0).toFixed(2)}
                      </td>
                      <td className="mono text-xs font-semibold">Rp {Number(t.priceIdr || 0).toLocaleString("id-ID")}</td>
                      <td>
                        <span className="env env-production text-xs">{t.method}</span>
                      </td>
                      <td>
                        <span className={`badge-status ${t.status === "PAID" ? "online" : "warning"} text-[11px]`}>
                          {t.status === "PAID" ? "Success" : t.status || "Success"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={data.pagination?.totalPages || 1}
            totalCount={data.pagination?.totalCount || 0}
            pageSize={pageSize}
            pageSizeOptions={[5, 10, 20]}
            itemName="transaksi"
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
          />
        </article>

        {/* Modal Checkout Direct QRIS & VA */}
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setActiveInvoice(null);
          }}
          title={
            activeInvoice
              ? "Pembayaran Instan (QRIS / Virtual Account)"
              : checkoutType === "SUBSCRIPTION"
              ? `Langganan Paket ${selectedTier?.name || selectedTier?.id}`
              : "Top-Up Saldo"
          }
          icon={
            activeInvoice ? (
              <QrCode size={16} className="text-blue shrink-0" />
            ) : checkoutType === "SUBSCRIPTION" ? (
              <Crown size={16} className="text-amber-500 shrink-0" />
            ) : (
              <Coins size={16} className="text-amber-500 shrink-0" />
            )
          }
          maxWidth="520px"
        >

              {!activeInvoice ? (
                /* Step 1: Package Selection & Payment Method */
                <form onSubmit={handleCreateInvoice}>
                  {/* TOPUP: Interactive Package Selector */}
                  {checkoutType === "TOPUP" ? (
                    <div className="form-group mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-ink">
                          1. Pilih Paket Saldo:
                        </label>
                      </div>
                      <div className="ketengan-modal-grid">
                        {activePackages.map((pkg: any) => {
                          const isSelected = effectiveKetengan?.price === pkg.price;
                          const discountedPriceNum =
                            currentDiscountPct > 0
                              ? Math.round(pkg.price * (1 - currentDiscountPct / 100))
                              : pkg.price;

                          return (
                            <div
                              key={pkg.id || pkg.price}
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
                    <div className="p-3.5 rounded-lg mb-3" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                      <div className="text-[11px] text-muted font-semibold uppercase tracking-wider flex items-center justify-between">
                        <span>Paket Langganan Dipilih:</span>
                        {selectedTier?.id?.toUpperCase() === currentTier && isSubscriptionActive && (
                          <span className="text-[10px] text-blue font-bold px-2 py-0.5 rounded bg-blue/10">
                            PERPANJANGAN (+30 HARI)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <strong className="text-base font-bold text-ink">
                          Paket {selectedTier?.name || selectedTier?.id}
                        </strong>
                        <strong className="text-base font-mono text-blue font-bold">
                          Rp {Number(selectedTier?.priceIdr || 0).toLocaleString("id-ID")}
                        </strong>
                      </div>
                      <div className="text-xs text-muted mt-1.5 flex items-center justify-between">
                        <span>Alokasi Saldo Bulanan:</span>
                        <span className="font-mono text-emerald-600 font-bold">
                          +${Number(selectedTier?.monthlyBalanceUsd || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  {invoiceError && (
                    <div className="text-xs bg-rose-50 text-rose-800 border border-rose-200 p-2.5 rounded-lg mb-3 font-medium flex items-center gap-1.5 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80">
                      <AlertCircle size={14} className="text-rose-600 shrink-0" />
                      <span>{invoiceError}</span>
                    </div>
                  )}

                  {currentDiscountPct > 0 && checkoutType === "TOPUP" && (
                    <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 p-2.5 rounded-lg mb-3 font-medium flex items-center gap-1.5 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80">
                      <Sparkles size={14} className="text-emerald-600 shrink-0" />
                      <span>{data.userDiscount?.reason || "VIP Reward"} ({currentDiscountPct}% promo diskon otomatis diterapkan saat checkout)</span>
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
                        <Wallet size={14} />
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
                          : `Top-Up Saldo +$${Number(activeInvoice.balanceAmountUsd || 0).toFixed(2)}`}
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
                      <div className="copy-box mt-1.5 flex items-center justify-between p-2 rounded" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
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
                    Setelah melakukan pembayaran melalui QRIS atau Virtual Account, sistem payment gateway atau Admin akan memverifikasi transaksi. Saldo dan paket otomatis aktif setelah pesanan terverifikasi.
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
                            ? "var(--emerald-soft)"
                            : invoiceStatusMsg.type === "pending"
                            ? "var(--amber-soft)"
                            : "var(--red-soft)",
                        border:
                          invoiceStatusMsg.type === "success"
                            ? "1px solid var(--emerald-border)"
                            : invoiceStatusMsg.type === "pending"
                            ? "1px solid var(--amber-border)"
                            : "1px solid var(--red-border)",
                        color:
                          invoiceStatusMsg.type === "success"
                            ? "var(--emerald)"
                            : invoiceStatusMsg.type === "pending"
                            ? "var(--amber)"
                            : "var(--red)",
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
        </Modal>
      </div>
    </DashboardShell>
  );
}
