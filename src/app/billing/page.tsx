"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Plus,
  RefreshCw,
  Zap,
  ChevronLeft,
  ChevronRight,
  QrCode,
  CreditCard,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  Tag,
  Building2,
} from "lucide-react";

const TOKEN_PACKAGES = [
  { amount: 1000000, label: "1.0M Tokens", raw: "1,000,000", basePrice: 2500, price: "Rp 2.500", tag: "Starter" },
  { amount: 5000000, label: "5.0M Tokens", raw: "5,000,000", basePrice: 8000, price: "Rp 8.000", tag: "Popular" },
  { amount: 10000000, label: "10.0M Tokens", raw: "10,000,000", basePrice: 15000, price: "Rp 15.000", tag: "Best Value" },
  { amount: 25000000, label: "25.0M Tokens", raw: "25,000,000", basePrice: 35000, price: "Rp 35.000", tag: "Growth" },
  { amount: 50000000, label: "50.0M Tokens", raw: "50,000,000", basePrice: 68000, price: "Rp 68.000", tag: "Scale" },
  { amount: 100000000, label: "100.0M Tokens", raw: "100,000,000", basePrice: 130000, price: "Rp 130.000", tag: "Enterprise" },
];

export default function BillingPage() {
  const [data, setData] = useState<{
    balanceTokens: number;
    totalConsumedTokens: number;
    activeOrder: any;
    userDiscount?: { discountPct: number; reason: string | null };
    topups: any[];
  }>({
    balanceTokens: 0,
    totalConsumedTokens: 0,
    activeOrder: null,
    userDiscount: { discountPct: 0, reason: null },
    topups: [],
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false,
  });

  // Modal Checkout States
  const [showModal, setShowModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(5000000);
  const [payMethod, setPayMethod] = useState<"QRIS" | "VA">("QRIS");
  const [selectedBank, setSelectedBank] = useState<"bca" | "bni" | "bri" | "echannel">("bca");
  const [activeInvoice, setActiveInvoice] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function fetchBilling(targetPage = page) {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing?page=${targetPage}&limit=${pageSize}`);
      const json = await res.json();
      if (json.balanceTokens !== undefined) {
        setData(json);
        if (json.activeOrder && !activeInvoice) {
          setActiveInvoice(json.activeOrder);
        }
        if (json.pagination) setPagination(json.pagination);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchBilling(page);
  }, [page, pageSize]);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: selectedAmount,
          method: payMethod,
          bank: selectedBank,
        }),
      });
      const json = await res.json();
      if (json.success && json.order) {
        setActiveInvoice(json.order);
      }
    } catch {}
    setSubmitting(false);
  }

  async function handleCheckOrSimulatePayment(orderId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/billing?orderId=${orderId}`, {
        method: "PUT",
      });
      const json = await res.json();
      if (json.success) {
        setActiveInvoice(null);
        setShowModal(false);
        setPage(1);
        fetchBilling(1);
      }
    } catch {}
    setSubmitting(false);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const formatTokens = (t: number) => {
    if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(2)}M Tokens`;
    if (t >= 1_000) return `${(t / 1_000).toFixed(1)}k Tokens`;
    return `${t.toLocaleString()} Tokens`;
  };

  const currentDiscountPct = data.userDiscount?.discountPct || 0;

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Token Balance & Payment Gateway"
          subtitle="Top up token credits via Instant QRIS or Direct Bank Virtual Account."
        >
          <button
            className="control btn-inline"
            onClick={() => fetchBilling(page)}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={1.5} />
            <span>Refresh</span>
          </button>
          <button
            className="primary btn-inline"
            onClick={() => {
              setActiveInvoice(null);
              setShowModal(true);
            }}
          >
            <Plus size={13} strokeWidth={2} />
            <span>Add Token Credits</span>
          </button>
        </PageHead>

        {/* Metric Cards Top */}
        <div className="cards">
          <article className="card metric">
            <div className="metric-header">
              <label>AVAILABLE TOKEN BALANCE</label>
              <span className="badge-status online">Active Quota</span>
            </div>
            <div className="metric-body">
              <strong className={data.balanceTokens < 0 ? "text-red" : "text-blue"}>
                {formatTokens(data.balanceTokens)}
              </strong>
              <small className="text-muted block mt-1">
                {data.balanceTokens.toLocaleString()} raw tokens remaining
              </small>
            </div>
          </article>

          <article className="card metric">
            <div className="metric-header">
              <label>LIFETIME TOKENS CONSUMED</label>
              <span className="text-xs text-muted">Total Usage</span>
            </div>
            <div className="metric-body">
              <strong>{formatTokens(data.totalConsumedTokens)}</strong>
              <small className="text-muted block mt-1">
                {data.totalConsumedTokens.toLocaleString()} tokens processed
              </small>
            </div>
          </article>
        </div>

        {/* History Table */}
        <article className="panel logs mt-4">
          <div className="panel-title">
            <h2>Payment & Token Credit History</h2>
          </div>
          <div className="logs-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Description</th>
                  <th>Amount (Tokens)</th>
                  <th>Price Paid</th>
                  <th>Payment Method</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      Loading payment transactions...
                    </td>
                  </tr>
                ) : data.topups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      No payment transactions found. Click &apos;Add Token Credits&apos; to purchase.
                    </td>
                  </tr>
                ) : (
                  data.topups.map((t) => (
                    <tr key={t.id}>
                      <td className="text-muted">
                        {new Date(t.createdAt).toLocaleString()}
                      </td>
                      <td className="cell-strong">{t.description}</td>
                      <td className="mono text-green font-semibold">
                        +{formatTokens(t.amount)}
                      </td>
                      <td className="mono">Rp {t.priceIdr.toLocaleString()}</td>
                      <td>
                        <span className="env env-production">{t.method}</span>
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
                Showing {pagination.totalCount === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, pagination.totalCount)} of {pagination.totalCount} transactions
              </span>
              <div className="per-page-wrap">
                <span className="text-muted">Per page:</span>
                <select
                  suppressHydrationWarning
                  className="per-page-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                </select>
              </div>
            </div>

            <div className="pager">
              <button
                className="pager-btn"
                disabled={!pagination.hasPrevPage}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={11} />
                <span>Prev</span>
              </button>
              <span className="pager-info">
                {page}/{pagination.totalPages}
              </span>
              <button
                className="pager-btn"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
              >
                <span>Next</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </article>

        {/* Modal Direct Payment (QRIS / VA Direct on Page) */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "480px" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <QrCode size={15} className="text-blue" style={{ flexShrink: 0 }} />
                  <h3 className="modal-title-text">
                    {activeInvoice ? "Scan QRIS / Transfer VA Langsung" : "Purchase Token Package"}
                  </h3>
                </div>
                <button
                  className="btn-close"
                  onClick={() => {
                    setShowModal(false);
                    setActiveInvoice(null);
                  }}
                >
                  ✕
                </button>
              </div>

              {!activeInvoice ? (
                /* Step 1: Package and Method Selection */
                <form onSubmit={handleCreateInvoice}>
                  {currentDiscountPct > 0 && (
                    <div className="text-xs bg-green-50 text-green-700 border border-green-200 p-2 rounded mb-2 font-medium">
                      ✓ {data.userDiscount?.reason} ({currentDiscountPct}% discount applied at checkout)
                    </div>
                  )}

                  <div className="form-group">
                    <label>1. Select Token Package</label>
                    <div className="token-grid-selector">
                      {TOKEN_PACKAGES.map((pkg) => {
                        const isSelected = selectedAmount === pkg.amount;
                        const discountedPriceNum =
                          currentDiscountPct > 0
                            ? Math.round(pkg.basePrice * (1 - currentDiscountPct / 100))
                            : pkg.basePrice;

                        return (
                          <div
                            key={pkg.amount}
                            className={`token-pkg-card ${isSelected ? "selected" : ""}`}
                            onClick={() => setSelectedAmount(pkg.amount)}
                          >
                            <span className="token-pkg-tag">{pkg.tag}</span>
                            <strong>{pkg.label}</strong>
                            {currentDiscountPct > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="line-through text-xs text-muted">
                                  {pkg.price}
                                </span>
                                <span className="text-xs font-semibold text-green">
                                  Rp {discountedPriceNum.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-blue">{pkg.price}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="form-group mt-3">
                    <label>2. Select Direct Payment Method</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`pay-method-btn ${payMethod === "QRIS" ? "active" : ""}`}
                        onClick={() => setPayMethod("QRIS")}
                      >
                        <QrCode size={14} />
                        <span>Direct QRIS (Gopay/BCA/DANA)</span>
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
                    <div className="form-group mt-2">
                      <label>Select Bank VA</label>
                      <select
                        suppressHydrationWarning
                        className="control w-full text-xs"
                        value={selectedBank}
                        onChange={(e: any) => setSelectedBank(e.target.value)}
                      >
                        <option value="bca">BCA Virtual Account</option>
                        <option value="echannel">Mandiri Bill Payment</option>
                        <option value="bni">BNI Virtual Account</option>
                        <option value="bri">BRI Virtual Account</option>
                      </select>
                    </div>
                  )}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="control"
                      onClick={() => setShowModal(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="primary btn-inline"
                      disabled={submitting}
                    >
                      <Sparkles size={13} />
                      <span>{submitting ? "Membuat Kode..." : "Dapatkan QRIS / Kode Bayar"}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Step 2: Direct QRIS / VA Code Display (NO SNAP POPUP) */
                <div className="invoice-box">
                  <div className="invoice-summary">
                    <div>
                      <span className="text-xs text-muted">Invoice ID:</span>
                      <strong className="block mono">{activeInvoice.orderId}</strong>
                      {activeInvoice.discountPct > 0 && (
                        <span className="text-xs text-green font-medium block">
                          ✓ {activeInvoice.discountReason}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      {activeInvoice.discountPct > 0 && (
                        <span className="text-xs text-muted line-through block">
                          Rp {activeInvoice.basePrice?.toLocaleString()}
                        </span>
                      )}
                      <span className="text-xs text-muted">Total Pembayaran:</span>
                      <strong className="block text-blue text-base">
                        Rp {activeInvoice.priceIdr.toLocaleString()}
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
                      <small className="text-muted block mt-2 text-xs font-semibold">
                        Scan QRIS langsung dengan BCA Mobile, GoPay, OVO, DANA, ShopeePay, atau Bank apa saja
                      </small>
                    </div>
                  ) : (
                    <div className="va-view">
                      <span className="text-xs text-muted font-semibold block">
                        Nomor Virtual Account ({selectedBank.toUpperCase()}):
                      </span>
                      <div className="copy-box mt-1.5">
                        <code className="text-sm font-bold mono text-blue">{activeInvoice.vaNumber}</code>
                        <button
                          className="btn-copy"
                          onClick={() => handleCopy(activeInvoice.vaNumber)}
                        >
                          {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                          <span>{copied ? "Tersalin" : "Salin VA"}</span>
                        </button>
                      </div>
                      <small className="text-muted block mt-2 text-xs">
                        Transfer tepat sebesar Rp {activeInvoice.priceIdr.toLocaleString()} ke nomor VA di atas.
                      </small>
                    </div>
                  )}

                  <div className="invoice-actions mt-3">
                    <button
                      type="button"
                      className="primary w-full btn-inline justify-center"
                      onClick={() => handleCheckOrSimulatePayment(activeInvoice.orderId)}
                      disabled={submitting}
                    >
                      <CheckCircle2 size={14} />
                      <span>
                        {submitting ? "Memeriksa Status..." : "Konfirmasi Pembayaran Selesai"}
                      </span>
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
