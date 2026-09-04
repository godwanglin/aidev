"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Boxes,
  Search,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";

interface ModelItem {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  contextWindow: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [modelId, setModelId] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("OpenAI");
  const [contextWindow, setContextWindow] = useState("128k");
  const [isActive, setIsActive] = useState(true);

  async function fetchModels() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/models");
      const json = await res.json();
      if (json.data) {
        setModels(json.data);
      } else if (json.error) {
        setErrorMsg(json.error);
      }
    } catch {
      setErrorMsg("Failed to connect to admin models API.");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchModels();
  }, []);

  function handleCopyModelId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function openCreateModal() {
    setEditingModel(null);
    setModelId("");
    setName("");
    setProvider("OpenAI");
    setContextWindow("128k");
    setIsActive(true);
    setErrorMsg("");
    setModalOpen(true);
  }

  function openEditModal(m: ModelItem) {
    setEditingModel(m);
    setModelId(m.modelId);
    setName(m.name);
    setProvider(m.provider);
    setContextWindow(m.contextWindow || "128k");
    setIsActive(m.isActive);
    setErrorMsg("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    const payload = {
      id: editingModel?.id,
      modelId,
      name,
      provider,
      contextWindow,
      isActive,
    };

    try {
      const res = await fetch("/api/admin/models", {
        method: editingModel ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        setSuccessMsg(
          editingModel
            ? `Model '${modelId}' updated successfully!`
            : `Model '${modelId}' created successfully!`
        );
        setTimeout(() => setSuccessMsg(""), 3000);
        setModalOpen(false);
        fetchModels();
      } else {
        setErrorMsg(json.error || "Operation failed.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
    setSubmitting(false);
  }

  async function handleDelete(m: ModelItem) {
    if (!confirm(`Are you sure you want to permanently delete model '${m.modelId}'?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/models?id=${m.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Model '${m.modelId}' deleted.`);
        setTimeout(() => setSuccessMsg(""), 3000);
        fetchModels();
      } else {
        setErrorMsg(json.error || "Failed to delete model.");
      }
    } catch {
      setErrorMsg("Network error.");
    }
  }

  const filtered = models.filter((m) =>
    `${m.modelId} ${m.name} ${m.provider}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Admin Model Management"
          subtitle="Add, edit, deactivate, or customize context parameters for all LLMs in database."
        >
          <button className="primary btn-inline" onClick={openCreateModal}>
            <Plus size={13} />
            <span>Add New Model</span>
          </button>
        </PageHead>

        {successMsg && (
          <div className="banner-alert mb-3">
            <CheckCircle2 size={16} className="text-green" />
            <div className="banner-text">
              <strong>Success!</strong>
              <p>{successMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="login-error mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="toolbar">
          <div className="toolbar-search">
            <Search size={13} strokeWidth={1.5} />
            <input suppressHydrationWarning
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Model ID, Name, or Provider..."
            />
          </div>
          <button className="control btn-inline shrink-0" onClick={fetchModels}>
            <RefreshCw size={13} strokeWidth={1.5} />
            <span>Refresh</span>
          </button>
        </div>

        <article className="panel logs">
          <div className="logs-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Model ID</th>
                  <th>Display Name</th>
                  <th>Provider</th>
                  <th>Context Window</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4">
                      Loading models...
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4">
                      No models found.
                    </td>
                  </tr>
                ) : (
                  paginated.map((m) => {
                    const isCopied = copiedId === m.modelId;
                    return (
                      <tr key={m.id}>
                        <td className="cell-project">
                          <div className="flex items-center gap-1.5">
                            <span className="project-icon">
                              <Boxes size={13} strokeWidth={1.5} />
                            </span>
                            <span className="mono text-blue font-semibold">{m.modelId}</span>
                            <button
                              className={`btn-icon-subtle ${isCopied ? "text-green" : "text-muted hover:text-ink"}`}
                              style={{ padding: "2px", border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                              onClick={() => handleCopyModelId(m.modelId)}
                              title={isCopied ? "Copied Model ID!" : `Copy "${m.modelId}"`}
                            >
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>
                        <td className="cell-strong">{m.name}</td>
                        <td>
                          <span
                            className={`env ${
                              m.provider === "OpenAI"
                                ? "env-production"
                                : m.provider === "Anthropic"
                                ? "env-staging"
                                : "env-preview"
                            }`}
                          >
                            {m.provider}
                          </span>
                        </td>
                        <td className="mono">{m.contextWindow}</td>
                        <td>
                          <span className={`status-dot ${m.isActive ? "online" : "idle"}`}>
                            {m.isActive ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="action-btn-group">
                            <button
                              className="action-btn edit"
                              onClick={() => openEditModal(m)}
                              title="Edit Model Specifications"
                            >
                              <Edit2 size={13} strokeWidth={1.75} />
                            </button>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDelete(m)}
                              title="Delete Model Permanently"
                            >
                              <Trash2 size={13} strokeWidth={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <div className="table-footer-left">
              <span className="table-footer-text">
                Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, filtered.length)} of {filtered.length} models
              </span>
              <div className="per-page-wrap">
                <span className="text-muted">Per page:</span>
                <select suppressHydrationWarning
                  className="per-page-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>

            <div className="pager">
              <button
                className="pager-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                <ChevronLeft size={11} />
                <span>Prev</span>
              </button>
              <span className="pager-info">
                {page}/{totalPages}
              </span>
              <button
                className="pager-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              >
                <span>Next</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </article>

        {/* Modal Popup */}
        {modalOpen && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ width: "480px" }}>
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Boxes size={15} className="text-blue" style={{ flexShrink: 0 }} />
                  <h3 className="modal-title-text">
                    {editingModel ? `Edit Model: ${editingModel.modelId}` : "Add New AI Model"}
                  </h3>
                </div>
                <button
                  className="btn-close"
                  onClick={() => setModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group mb-3">
                  <label>1. Model ID (API Route Identifier)</label>
                  <input suppressHydrationWarning
                    type="text"
                    className="control w-full"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder="e.g. gpt-5.5 or claude-opus-4.6"
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label>2. Display Name</label>
                  <input suppressHydrationWarning
                    type="text"
                    className="control w-full"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. GPT-5.5 Ultra Reasoning"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label>Provider</label>
                    <input suppressHydrationWarning
                      type="text"
                      className="control w-full"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      placeholder="OpenAI, Anthropic, etc."
                      required
                    />
                  </div>
                  <div>
                    <label>Context Window</label>
                    <input suppressHydrationWarning
                      type="text"
                      className="control w-full"
                      value={contextWindow}
                      onChange={(e) => setContextWindow(e.target.value)}
                      placeholder="128k, 256k, 1M"
                      required
                    />
                  </div>
                </div>

                <div className="form-group mt-3">
                  <label className="switch-label">
                    <input suppressHydrationWarning
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span>Active & Available for AI Gateway Routing</span>
                  </label>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="control"
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary btn-inline"
                    disabled={submitting}
                  >
                    <Sparkles size={13} />
                    <span>{submitting ? "Saving..." : editingModel ? "Update Model" : "Create Model"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
