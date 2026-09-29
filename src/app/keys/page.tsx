"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Plus,
  KeyRound,
  Copy,
  Check,
  Trash2,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Search,
  Crown,
  AlertCircle,
} from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";
import { Modal } from "@/components/Modal";
import { Pagination } from "@/components/Pagination";

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  _count?: { requestLogs: number };
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false,
  });

  const [tierInfo, setTierInfo] = useState<{
    id: string;
    name: string;
    rpmLimit: number;
    maxKeys: number;
    activeKeysCount: number;
    canCreate: boolean;
  } | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  async function fetchKeys(targetPage = page) {
    setLoading(true);
    try {
      const res = await fetch(`/api/keys?page=${targetPage}&limit=${pageSize}`);
      const json = await res.json();
      if (json.data) {
        setKeys(json.data);
        if (json.pagination) setPagination(json.pagination);
        if (json.tier) setTierInfo(json.tier);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchKeys(page);
  }, [page, pageSize]);

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "Default API Key" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data?.rawKey) {
        setGeneratedKey(json.data.rawKey);
        setNewKeyName("");
        setCreateError(null);
        setPage(1);
        fetchKeys(1);
      } else {
        const errorMsg = json.error || `Gagal membuat API key (Status: ${res.status}).`;
        setCreateError(errorMsg);
        alert(errorMsg);
      }
    } catch {
      const netError = "Gagal membuat API key. Terjadi kesalahan jaringan.";
      setCreateError(netError);
      alert(netError);
    }
    setSubmitting(false);
  }

  async function handleRevoke(id: string) {
    if (!confirm("Are you sure you want to revoke this API key? This cannot be undone."))
      return;
    try {
      await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
      fetchKeys(page);
    } catch {}
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="API Keys"
          subtitle="Manage secure internal tokens with server-side pagination."
        >
          {tierInfo && (
            <div className="flex items-center gap-2 mr-2">
              <span className={`tier-badge-pill ${tierInfo.id.toLowerCase()}`}>
                <Crown size={11} />
                <span>{tierInfo.name}</span>
              </span>
              <span className="mono text-xs text-muted">
                Keys: <strong className="text-ink">{pagination.totalCount}</strong>/{tierInfo.maxKeys === -1 ? "∞" : tierInfo.maxKeys}
              </span>
              <span className="mono text-xs text-blue font-semibold">
                • {tierInfo.rpmLimit} RPM
              </span>
            </div>
          )}
          <button
            className="control btn-icon-only"
            onClick={() => fetchKeys(page)}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
          <button
            className="primary btn-inline"
            onClick={() => {
              setGeneratedKey(null);
              setNewKeyName("");
              setCreateError(null);
              setShowModal(true);
            }}
          >
            <Plus size={13} strokeWidth={2} />
            <span>Create New Secret Key</span>
          </button>
        </PageHead>

        {/* Search Toolbar */}
        <div className="toolbar">
          <div className="toolbar-search">
            <Search size={13} strokeWidth={1.5} />
            <input
              suppressHydrationWarning
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search API keys by name or prefix..."
            />
          </div>
          {filter && (
            <button
              className="control btn-inline text-muted"
              onClick={() => setFilter("")}
            >
              Clear
            </button>
          )}
        </div>

        <article className="panel logs">
          <div className="logs-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Key Name</th>
                  <th>Key Prefix</th>
                  <th>Rate Limit</th>
                  <th>Requests</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-4">
                      Loading API keys...
                    </td>
                  </tr>
                ) : (() => {
                  const filtered = keys.filter((k) => {
                    if (!filter.trim()) return true;
                    const q = filter.toLowerCase().trim();
                    return (k.name && k.name.toLowerCase().includes(q)) || k.prefix.toLowerCase().includes(q);
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={8} className="text-center py-4 text-muted">
                          {keys.length === 0
                            ? "No API keys found. Click above to generate one."
                            : "No API keys match your search filter."}
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((k) => (
                    <tr key={k.id}>
                      <td className="cell-project">
                        <span className="project-icon">
                          <KeyRound size={13} strokeWidth={1.5} />
                        </span>
                        <span className="cell-strong">{k.name || "Default Key"}</span>
                      </td>
                      <td className="mono text-blue font-semibold">{k.prefix}</td>
                      <td>
                        <span className="env">{k.rateLimit} req/min</span>
                      </td>
                      <td className="mono">{k._count?.requestLogs ?? 0}</td>
                      <td className="text-muted">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-muted">
                        {k.lastUsedAt
                          ? new Date(k.lastUsedAt).toLocaleTimeString()
                          : "Never"}
                      </td>
                      <td>
                        <span
                          className={`status-dot ${
                            k.isActive && !k.revokedAt ? "online" : "idle"
                          }`}
                        >
                          {k.isActive && !k.revokedAt ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td className="text-right">
                        {k.isActive && !k.revokedAt && (
                          <button
                            className="action-btn delete"
                            onClick={() => handleRevoke(k.id)}
                            title="Revoke Key Permanently"
                          >
                            <Trash2 size={13} strokeWidth={1.75} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            totalCount={pagination.totalCount}
            pageSize={pageSize}
            pageSizeOptions={[5, 10, 20]}
            itemName="keys"
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
          />
        </article>

        {/* Reusable Modal Popup Create & Show Newly Created Key */}
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setGeneratedKey(null);
          }}
          title={generatedKey ? "Secret API Key Generated" : "Create New Secret Key"}
          icon={<KeyRound size={15} className="text-blue shrink-0" />}
          maxWidth="480px"
        >
          {!generatedKey ? (
            /* Step 1: Input Key Name */
            <form onSubmit={handleCreateKey}>
              {createError && (
                <div className="text-xs bg-rose-50 text-rose-800 border border-rose-200 p-2.5 rounded-lg mb-3 font-medium flex items-center gap-1.5 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/80">
                  <AlertCircle size={14} className="text-rose-600 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {tierInfo && !tierInfo.canCreate && (
                <div className="text-xs bg-amber-50 text-amber-900 border border-amber-200 p-3 rounded-lg mb-3 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/80 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle size={14} className="text-amber-600 shrink-0" />
                    <span>Batas Kuota Pembuatan API Key Tercapai!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Paket <strong>{tierInfo.name}</strong> memiliki batas kuota <strong>{tierInfo.maxKeys} API Key</strong> (saat ini aktif: {pagination.totalCount}/{tierInfo.maxKeys}). Untuk menambah kuota key dan menaikkan limit RPM hingga 120 RPM, silakan upgrade paket langganan Anda.
                  </p>
                  <Link
                    href="/billing"
                    className="primary btn-inline text-xs font-semibold py-1 px-2.5 rounded w-fit inline-flex"
                    onClick={() => setShowModal(false)}
                  >
                    <Sparkles size={11} />
                    <span>Upgrade Paket di Billing</span>
                  </Link>
                </div>
              )}

              <div className="form-group mb-3">
                <label>Key Name / Identifier</label>
                <input
                  suppressHydrationWarning
                  type="text"
                  className="control w-full"
                  placeholder="e.g. Production Backend, Cursor AI, Agent Runner"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  disabled={Boolean(tierInfo && !tierInfo.canCreate)}
                  autoFocus
                />
                <div className="text-muted block mt-1.5 text-xs space-y-0.5">
                  <div>
                    Rate Limit otomatis: <strong className="text-blue font-mono">{tierInfo?.rpmLimit || 5} requests/minute</strong> (berdasarkan paket <strong>{tierInfo?.name || "Free Tier"}</strong>).
                  </div>
                  <div>
                    Kuota API Key: <strong className="mono">{pagination.totalCount}</strong> / {tierInfo?.maxKeys === -1 ? "Unlimited" : `${tierInfo?.maxKeys || 2} Keys`}.
                  </div>
                </div>
              </div>
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
                  disabled={submitting || Boolean(tierInfo && !tierInfo.canCreate)}
                >
                  <Sparkles size={13} />
                  <span>
                    {submitting
                      ? "Generating..."
                      : tierInfo && !tierInfo.canCreate
                      ? "Kuota Key Penuh"
                      : "Generate Secret Key"}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            /* Step 2: Show Key with Copy Button */
            <div className="invoice-box">
              <div className="banner-alert mb-2" style={{ margin: 0 }}>
                <div className="banner-icon">
                  <ShieldAlert size={16} />
                </div>
                <div className="banner-text">
                  <strong>Please save this secret key immediately!</strong>
                  <p>For your security, you will not be able to view it again after closing this popup.</p>
                </div>
              </div>

              <div className="form-group">
                <label>Your Internal API Secret Key</label>
                <div className="copy-box mt-1">
                  <code className="text-xs font-semibold mono select-all break-all">{generatedKey}</code>
                  <button
                    className="btn-copy shrink-0"
                    onClick={() => handleCopy(generatedKey)}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="primary w-full btn-inline justify-center"
                  onClick={() => {
                    setShowModal(false);
                    setGeneratedKey(null);
                  }}
                >
                  <span>I Have Saved My Secret Key</span>
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardShell>
  );
}
