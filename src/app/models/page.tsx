"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import { Boxes, Search, RefreshCw, ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";

interface ModelItem {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  contextWindow: string;
  isActive: boolean;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function fetchModels() {
    setLoading(true);
    try {
      const res = await fetch("/api/models");
      const json = await res.json();
      if (json.data) setModels(json.data);
    } catch {}
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

  const filtered = models.filter((m) =>
    `${m.modelId} ${m.name} ${m.provider}`.toLowerCase().includes(filter.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedModels = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="AI Models Catalogue"
          subtitle="Real-time catalogue of supported LLMs and token context window specifications."
        >
          <button className="control btn-inline" onClick={fetchModels}>
            <RefreshCw size={13} strokeWidth={1.5} />
            <span>Refresh</span>
          </button>
        </PageHead>

        <div className="toolbar">
          <div className="toolbar-search">
            <Search size={13} strokeWidth={1.5} />
            <input suppressHydrationWarning
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by Model ID, Name, or Provider (OpenAI, Anthropic)..."
            />
          </div>
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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      Loading models from database...
                    </td>
                  </tr>
                ) : paginatedModels.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      No matching models found.
                    </td>
                  </tr>
                ) : (
                  paginatedModels.map((m) => {
                    const isCopied = copiedId === m.modelId;
                    return (
                      <tr key={m.modelId}>
                        <td className="cell-project">
                          <div className="flex items-center gap-1.5">
                            <span className="project-icon">
                              <Boxes size={13} strokeWidth={1.5} />
                            </span>
                            <span className="mono text-blue font-semibold">
                              {m.modelId}
                            </span>
                            <button
                              className={`btn-icon-subtle ${isCopied ? "text-green" : "text-muted hover:text-ink"}`}
                              style={{ padding: "2px", border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                              onClick={() => handleCopyModelId(m.modelId)}
                              title={isCopied ? "Copied to clipboard!" : `Copy "${m.modelId}"`}
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
                                : "env-staging"
                            }`}
                          >
                            {m.provider}
                          </span>
                        </td>
                        <td className="mono">{m.contextWindow}</td>
                        <td>
                          <span
                            className={`status-dot ${
                              m.isActive ? "online" : "idle"
                            }`}
                          >
                            {m.isActive ? "Available" : "Disabled"}
                          </span>
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
                  <option value="20">20</option>
                </select>
              </div>
            </div>

            <div className="pager">
              <button
                className="pager-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                title="Previous Page"
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
                title="Next Page"
              >
                <span>Next</span>
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </article>
      </div>
    </DashboardShell>
  );
}
