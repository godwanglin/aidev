"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  Boxes,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Network,
  Coins,
} from "lucide-react";
import CustomDropdown from "@/components/CustomDropdown";
import {
  ProviderAvatar,
  getProviderDisplayName,
  getProviderSlug,
} from "@/components/providers/ProviderIcons";

interface ModelItem {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  contextWindow: string;
  isActive: boolean;
  rateInPer1k?: number;
  rateOutPer1k?: number;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("ALL");
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

  const filteredModels = models.filter((m) => {
    const matchesSearch = `${m.modelId} ${m.name} ${m.provider}`.toLowerCase().includes(filter.toLowerCase());
    const matchesProvider = providerFilter === "ALL" || m.provider.toUpperCase() === providerFilter.toUpperCase();
    return matchesSearch && matchesProvider;
  });

  const availableProviders = ["ALL", ...Array.from(new Set(models.map((m) => m.provider.toUpperCase()))).sort()];
  const totalPages = Math.ceil(filteredModels.length / pageSize) || 1;
  const paginatedModels = filteredModels.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="AI Models Catalogue"
          subtitle="Real-time catalogue of supported LLMs and token context specifications."
        >
          <button className="control btn-inline" onClick={fetchModels}>
            <RefreshCw size={13} strokeWidth={1.5} />
            <span>Refresh</span>
          </button>
        </PageHead>

        {/* Toolbar with Search and Provider Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: "22px" }}>
          <div className="toolbar-search" style={{ flex: 1, minWidth: "260px" }}>
            <Search size={13} strokeWidth={1.5} />
            <input
              suppressHydrationWarning
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Model ID, Name, or Provider (OpenAI, Gemini, DeepSeek)..."
            />
          </div>

          <CustomDropdown
            size="sm"
            value={providerFilter}
            onChange={(val) => {
              setProviderFilter(val);
              setPage(1);
            }}
            options={availableProviders.map((p) => {
              if (p === "ALL") {
                return {
                  value: "ALL",
                  label: `All Providers (${models.length})`,
                  icon: <Network size={13} style={{ color: "var(--blue)" }} />,
                };
              }
              const count = models.filter((m) => m.provider.toUpperCase() === p).length;
              return {
                value: p,
                label: `${getProviderDisplayName(p)} (${count})`,
                icon: (
                  <ProviderAvatar
                    slugOrId={getProviderSlug(p)}
                    name={p}
                    size={16}
                    imgSize={12}
                    className="shrink-0 rounded"
                    style={{ background: "#f1f5f9", borderColor: "#e2e8f0" }}
                  />
                ),
              };
            })}
            minWidth={170}
            title="Filter by provider"
          />
        </div>

        {/* Models Table */}
        <article className="panel logs">
          <div className="logs-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Model ID</th>
                  <th>Display Name</th>
                  <th>Provider</th>
                  <th>Credit Cost Rate</th>
                  <th>Context Window</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted text-xs">
                      Loading models...
                    </td>
                  </tr>
                ) : paginatedModels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted text-xs">
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
                            <span className="mono text-blue font-semibold">{m.modelId}</span>
                            <button
                              className={`btn-icon-subtle ${isCopied ? "text-green" : "text-muted hover:text-ink"}`}
                              style={{
                                padding: "2px",
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              onClick={() => handleCopyModelId(m.modelId)}
                              title={isCopied ? "Copied!" : `Copy "${m.modelId}"`}
                            >
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          </div>
                        </td>
                        <td className="cell-strong">{m.name}</td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              fontSize: "11px",
                              fontWeight: 600,
                              color: "#334155",
                            }}
                          >
                            <ProviderAvatar
                              slugOrId={getProviderSlug(m.provider)}
                              name={m.provider}
                              size={15}
                              imgSize={12}
                              className="shrink-0 rounded"
                            />
                            <span>{getProviderDisplayName(m.provider)}</span>
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#1e293b" }}>
                              <Coins size={12} className="text-amber-500 shrink-0" />
                              <span>{m.rateInPer1k ?? 25} In / {m.rateOutPer1k ?? 100} Out</span>
                            </div>
                            <span className="text-[10.5px] text-muted">CR / 1k tokens</span>
                          </div>
                        </td>
                        <td>
                          <span className="mono text-xs font-medium" style={{ color: "#475569" }}>
                            {m.contextWindow || "128k"}
                          </span>
                        </td>
                        <td>
                          <span className={`status-dot ${m.isActive !== false ? "online" : "idle"}`}>
                            {m.isActive !== false ? "Available" : "Maintenance"}
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
                Showing {filteredModels.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, filteredModels.length)} of {filteredModels.length} models
              </span>
              <div className="per-page-wrap flex items-center gap-2">
                <span className="text-muted text-xs">Per page:</span>
                <CustomDropdown
                  size="sm"
                  direction="up"
                  value={String(pageSize)}
                  onChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                  options={[
                    { value: "5", label: "5" },
                    { value: "10", label: "10" },
                    { value: "20", label: "20" },
                    { value: "50", label: "50" },
                  ]}
                  minWidth={65}
                  width={65}
                />
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
