"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, RefreshCw, RotateCcw, Check, AlertCircle } from "lucide-react";
import { ConnectionItem } from "./EditConnectionModal";

export interface CodexResetCreditItem {
  id?: string;
  status: string;
  grantedAt: string | null;
  expiresAt: string | null;
  redeemedAt?: string | null;
  title?: string | null;
  description?: string | null;
}

export interface CodexResetCreditsResult {
  availableCount: number;
  credits: CodexResetCreditItem[];
}

interface CodexResetCreditsModalProps {
  connection: ConnectionItem;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
  onCreditsUpdated?: (connId: string, availableCount: number) => void;
}

function formatCreditDate(value: any): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "N/A";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRemaining(value: any): string {
  if (!value) return "N/A";
  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "N/A";
  if (diffMs <= 0) return "Expired";
  const totalHours = Math.ceil(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export default function CodexResetCreditsModal({
  connection,
  isOpen,
  onClose,
  onSuccess,
  onCreditsUpdated,
}: CodexResetCreditsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CodexResetCreditsResult | null>(null);
  const [isConsuming, setIsConsuming] = useState(false);
  const [consumeMsg, setConsumeMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Keep a stable ref to onCreditsUpdated to prevent infinite re-fetching loops
  // when the parent re-renders and passes a new inline function.
  const onCreditsUpdatedRef = React.useRef(onCreditsUpdated);
  useEffect(() => {
    onCreditsUpdatedRef.current = onCreditsUpdated;
  }, [onCreditsUpdated]);

  const loadCredits = useCallback(
    async (forceFresh = false) => {
      if (!connection?.id) return;
      setLoading(true);
      setError(null);
      setConsumeMsg(null);
      try {
        const url = `/api/admin/providers/${connection.id}/reset-credits${forceFresh ? "?fresh=true" : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json();
        if (json.success && json.data) {
          const credits = Array.isArray(json.data.credits) ? [...json.data.credits] : [];
          credits.sort((a, b) => {
            const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
            const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
            return aTime - bTime;
          });
          setData({ ...json.data, credits });
          if (onCreditsUpdatedRef.current) {
            onCreditsUpdatedRef.current(connection.id, json.data.availableCount ?? 0);
          }
        } else {
          setError(json.error || json.message || "Failed to load Codex reset credits");
        }
      } catch (err: any) {
        setError(err.message || "Failed to load Codex reset credits");
      } finally {
        setLoading(false);
      }
    },
    [connection?.id]
  );

  useEffect(() => {
    if (isOpen && connection?.id) {
      loadCredits(false);
    }
  }, [isOpen, connection?.id, loadCredits]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  async function handleConsume() {
    if (isConsuming) return;
    if (!confirm(`Gunakan 1 Codex reset credit untuk ${connection.accountEmail || connection.name}? Batas kuota akan di-reset.`)) {
      return;
    }

    setIsConsuming(true);
    setConsumeMsg(null);
    try {
      const res = await fetch(`/api/admin/providers/${connection.id}/reset-credits`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setConsumeMsg({
          text: "Berhasil menggunakan 1 credit! Kuota akun telah di-reset.",
          isError: false,
        });
        await loadCredits(true);
        if (onSuccess) onSuccess("Berhasil reset kuota akun.");
      } else {
        setConsumeMsg({
          text: json.message || json.error || "Gagal menggunakan reset credit.",
          isError: true,
        });
      }
    } catch (err: any) {
      setConsumeMsg({
        text: err.message || "Terjadi kesalahan koneksi.",
        isError: true,
      });
    } finally {
      setIsConsuming(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="codex-expiry-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="codex-expiry-card" style={{ maxWidth: "600px", width: "100%" }}>
        {/* Header */}
        <div className="codex-expiry-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="codex-expiry-title">History & Masa Berlaku Reset Credit</h3>
            <p className="codex-expiry-subtitle">
              {connection.accountEmail || connection.name || "Codex account"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => loadCredits(true)}
              disabled={loading}
              className="codex-expiry-close-btn"
              title="Refresh status credit terbaru"
              aria-label="Refresh reset credits"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="codex-expiry-close-btn"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="codex-expiry-body">
          {consumeMsg && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
                background: consumeMsg.isError ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                color: consumeMsg.isError ? "#ef4444" : "#10b981",
                border: `1px solid ${consumeMsg.isError ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
              }}
            >
              {consumeMsg.isError ? <AlertCircle size={14} /> : <Check size={14} />}
              <span>{consumeMsg.text}</span>
            </div>
          )}

          {loading ? (
            <div className="codex-expiry-loading">
              <RefreshCw size={18} className="animate-spin" />
              <span>Memuat status reset credits...</span>
            </div>
          ) : error ? (
            <div className="codex-expiry-error">{error}</div>
          ) : data?.credits && data.credits.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                className="codex-expiry-summary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "var(--card-subtle, rgba(255,255,255,0.03))",
                  border: "1px solid var(--line, rgba(255,255,255,0.08))",
                }}
              >
                <span>
                  Total <strong>{data.credits.length}</strong> record credit
                </span>
                <span
                  style={{
                    color: (data.availableCount ?? 0) > 0 ? "#10b981" : "var(--muted)",
                    fontWeight: 700,
                  }}
                >
                  {data.availableCount ?? 0} credit siap digunakan
                </span>
              </div>

              <div className="codex-expiry-table-wrap">
                <table className="codex-expiry-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Granted At</th>
                      <th>Expires / Used At</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.credits.map((credit, index) => {
                      const isRedeemed = credit.status === "redeemed" || Boolean(credit.redeemedAt);
                      const isExpired =
                        credit.status === "expired" ||
                        (!isRedeemed &&
                          credit.expiresAt &&
                          new Date(credit.expiresAt).getTime() < Date.now());
                      const statusLabel = isRedeemed
                        ? "Redeemed"
                        : isExpired
                        ? "Expired"
                        : "Available";
                      const statusColor = isRedeemed
                        ? "var(--muted)"
                        : isExpired
                        ? "#ef4444"
                        : "#10b981";

                      return (
                        <tr key={credit.id || `${credit.status}-${credit.expiresAt || index}`}>
                          <td>
                            <span
                              className="codex-expiry-pill"
                              style={{
                                color: statusColor,
                                borderColor: `${statusColor}40`,
                                background: `${statusColor}15`,
                              }}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td style={{ color: "var(--muted)" }}>
                            {formatCreditDate(credit.grantedAt)}
                          </td>
                          <td>
                            {isRedeemed
                              ? formatCreditDate(credit.redeemedAt || credit.expiresAt)
                              : formatCreditDate(credit.expiresAt)}
                          </td>
                          <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                            {isRedeemed
                              ? "Sudah dipakai"
                              : isExpired
                              ? "Kadaluarsa"
                              : formatTimeRemaining(credit.expiresAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action button if credits are available */}
              {(data.availableCount ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={handleConsume}
                    disabled={isConsuming}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 14px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: "#10b981",
                      color: "#fff",
                      border: "none",
                      cursor: isConsuming ? "not-allowed" : "pointer",
                      opacity: isConsuming ? 0.7 : 1,
                    }}
                  >
                    <RotateCcw size={13} className={isConsuming ? "animate-spin" : ""} />
                    <span>{isConsuming ? "Mereset..." : "Gunakan 1 Credit Sekarang"}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="codex-expiry-empty-box">
              Tidak ada data reset credit untuk akun ini.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
