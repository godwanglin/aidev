"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";

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

  const [showModal, setShowModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("");

  async function fetchKeys(targetPage = page) {
    setLoading(true);
    try {
      const res = await fetch(`/api/keys?page=${targetPage}&limit=${pageSize}`);
      const json = await res.json();
      if (json.data) {
        setKeys(json.data);
        if (json.pagination) setPagination(json.pagination);
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
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "Default API Key" }),
      });
      const json = await res.json();
      if (json.success && json.data?.rawKey) {
        setGeneratedKey(json.data.rawKey);
        setNewKeyName("");
        setPage(1);
        fetchKeys(1);
      }
    } catch {}
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

          <div className="table-footer">
            <div className="table-footer-left">
              <span className="table-footer-text">
                Showing {pagination.totalCount === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, pagination.totalCount)} of {pagination.totalCount} keys
              </span>
              <div className="per-page-wrap flex items-center gap-2">
                <span className="text-muted text-xs">Per page:</span>
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
                  minWidth={65}
                  width={65}
                />
              </div>
            </div>

            <div className="pager">
              <button
                className="pager-btn"
                disabled={!pagination.hasPrevPage}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                title="Previous Page"
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
                title="Next Page"
              >
                <span>Next</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </article>

        {/* Modal Popup Create & Show Newly Created Key */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "480px" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <KeyRound size={15} className="text-blue" style={{ flexShrink: 0 }} />
                  <h3 className="modal-title-text">
                    {generatedKey ? "Secret API Key Generated" : "Create New Secret Key"}
                  </h3>
                </div>
                <button
                  className="btn-close"
                  onClick={() => {
                    setShowModal(false);
                    setGeneratedKey(null);
                  }}
                >
                  ✕
                </button>
              </div>

              {!generatedKey ? (
                /* Step 1: Input Key Name */
                <form onSubmit={handleCreateKey}>
                  <div className="form-group mb-3">
                    <label>Key Name / Identifier</label>
                    <input
                      suppressHydrationWarning
                      type="text"
                      className="control w-full"
                      placeholder="e.g. Production Backend, Cursor AI, Agent Runner"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      autoFocus
                    />
                    <small className="text-muted block mt-1 text-xs">
                      Default Rate Limit is set to 30 requests/minute.
                    </small>
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
                      disabled={submitting}
                    >
                      <Sparkles size={13} />
                      <span>{submitting ? "Generating..." : "Generate Secret Key"}</span>
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
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
