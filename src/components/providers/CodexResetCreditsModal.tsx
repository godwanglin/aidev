"use client";

import React, { useState, useEffect } from "react";
import { X, RefreshCw } from "lucide-react";
import { ConnectionItem } from "./EditConnectionModal";

export interface CodexResetCreditItem {
  status: string;
  grantedAt: string | null;
  expiresAt: string | null;
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
  onCreditsUpdated,
}: CodexResetCreditsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CodexResetCreditsResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/admin/providers/${connection.id}/reset-credits`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          const credits = Array.isArray(json.data.credits) ? [...json.data.credits] : [];
          credits.sort((a, b) => {
            const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
            const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
            return aTime - bTime;
          });
          setData({ ...json.data, credits });
          if (onCreditsUpdated) {
            onCreditsUpdated(connection.id, json.data.availableCount ?? 0);
          }
        } else {
          setError(json.error || json.message || "Failed to load Codex reset credits");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load Codex reset credits");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, connection.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="codex-expiry-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="codex-expiry-card">
        {/* Header */}
        <div className="codex-expiry-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="codex-expiry-title">
              Codex Reset Credit Expiry
            </h3>
            <p className="codex-expiry-subtitle">
              {connection.accountEmail || connection.name || "Codex account"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="codex-expiry-close-btn"
            aria-label="Close reset credit expiry modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="codex-expiry-body">
          {loading ? (
            <div className="codex-expiry-loading">
              <RefreshCw size={18} className="animate-spin" />
              <span>Loading reset credits...</span>
            </div>
          ) : error ? (
            <div className="codex-expiry-error">
              {error}
            </div>
          ) : data?.credits && data.credits.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div className="codex-expiry-summary">
                <span>
                  {data.credits.length} reset credit{data.credits.length === 1 ? "" : "s"}
                </span>
                <strong>{data.availableCount ?? 0} available</strong>
              </div>
              <div className="codex-expiry-table-wrap">
                <table className="codex-expiry-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Granted At</th>
                      <th>Expires At</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.credits.map((credit, index) => (
                      <tr key={`${credit.status}-${credit.expiresAt || index}`}>
                        <td>
                          <span className="codex-expiry-pill">
                            {credit.status || "unknown"}
                          </span>
                        </td>
                        <td style={{ color: "#64748b" }}>
                          {formatCreditDate(credit.grantedAt)}
                        </td>
                        <td>
                          {formatCreditDate(credit.expiresAt)}
                        </td>
                        <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                          {formatTimeRemaining(credit.expiresAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="codex-expiry-empty-box">
              No reset credit details returned for this account.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
