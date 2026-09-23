"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import Status from "@/components/Status";
import CustomDropdown from "@/components/CustomDropdown";
import {
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Coins,
} from "lucide-react";

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false,
  });

  // Filter States
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");
  const [minLatency, setMinLatency] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  useEffect(() => {
    async function fetchPublicModels() {
      try {
        const res = await fetch("/api/models");
        const json = await res.json();
        if (Array.isArray(json.data)) {
          setAvailableModels(json.data);
        }
      } catch {}
    }
    fetchPublicModels();
  }, []);

  async function fetchLogs(targetPage = page) {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("page", targetPage.toString());
      query.set("limit", pageSize.toString());

      if (filter) query.set("filter", filter);
      if (statusFilter !== "all") query.set("status", statusFilter);
      if (modelFilter !== "all") query.set("model", modelFilter);
      if (methodFilter !== "all") query.set("method", methodFilter);
      if (rangeFilter !== "all") query.set("range", rangeFilter);
      if (minLatency && Number(minLatency) > 0) query.set("minLatency", minLatency);

      const res = await fetch(`/api/logs?${query.toString()}`);
      const json = await res.json();
      if (json.data) {
        setLogs(json.data);
        if (json.pagination) {
          setPagination(json.pagination);
        }
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [statusFilter, modelFilter, methodFilter, rangeFilter, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPage(newPage);
    fetchLogs(newPage);
  };

  const resetFilters = () => {
    setFilter("");
    setStatusFilter("all");
    setModelFilter("all");
    setMethodFilter("all");
    setRangeFilter("all");
    setMinLatency("");
    setPage(1);
  };

  const hasActiveFilters =
    filter ||
    statusFilter !== "all" ||
    modelFilter !== "all" ||
    methodFilter !== "all" ||
    rangeFilter !== "all" ||
    minLatency;

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Logs & Request History"
          subtitle="Real-time stream of client API calls with server-side pagination."
        >
          <button
            className={`control btn-inline ${showAdvanced ? "active-filter-btn" : ""}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <SlidersHorizontal size={13} strokeWidth={1.5} />
            <span>Advanced Filters</span>
          </button>
          <button className="control btn-icon-only" onClick={() => fetchLogs(page)} title="Refresh">
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
        </PageHead>

        {/* Primary Toolbar */}
        <div className="toolbar">
          <form onSubmit={handleSearchSubmit} className="toolbar-search">
            <Search size={13} strokeWidth={1.5} />
            <input suppressHydrationWarning
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search Path, Key, or Model (press Enter)..."
            />
          </form>
          <div className="toolbar-filters flex items-center gap-2">
            <CustomDropdown
              size="sm"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: "all", label: "Status: All", icon: <Filter size={12} className="text-muted" /> },
                { value: "200", label: "200 OK", sublabel: "Success" },
                { value: "400", label: "400 Bad Request" },
                { value: "401", label: "401 Unauthorized" },
                { value: "429", label: "429 Rate Limit" },
                { value: "500", label: "5xx Server Error" },
                { value: "errors", label: "All Errors (4xx/5xx)" },
              ]}
              minWidth={135}
            />

            <CustomDropdown
              size="sm"
              value={modelFilter}
              onChange={(val) => setModelFilter(val)}
              options={[
                { value: "all", label: "Model: All" },
                ...availableModels.map((m: any) => ({
                  value: m.modelId,
                  label: m.modelId,
                  sublabel: m.name !== m.modelId ? m.name : undefined,
                })),
              ]}
              minWidth={140}
            />
          </div>
        </div>

        {/* Expandable Advanced Filter Panel */}
        {showAdvanced && (
          <div className="advanced-filter-box">
            <div className="filter-grid">
              <div className="filter-item">
                <label className="filter-label">Time Window</label>
                <CustomDropdown
                  size="md"
                  width="100%"
                  value={rangeFilter}
                  onChange={(val) => setRangeFilter(val)}
                  options={[
                    { value: "all", label: "All Time" },
                    { value: "24h", label: "Past 24 Hours" },
                    { value: "7d", label: "Past 7 Days" },
                    { value: "30d", label: "Past 30 Days" },
                  ]}
                />
              </div>

              <div className="filter-item">
                <label className="filter-label">HTTP Method</label>
                <CustomDropdown
                  size="md"
                  width="100%"
                  value={methodFilter}
                  onChange={(val) => setMethodFilter(val)}
                  options={[
                    { value: "all", label: "Any Method" },
                    { value: "POST", label: "POST" },
                    { value: "GET", label: "GET" },
                    { value: "DELETE", label: "DELETE" },
                  ]}
                />
              </div>

              <div className="filter-item">
                <label className="filter-label">Min Latency (ms)</label>
                <input suppressHydrationWarning
                  type="number"
                  className="control w-full"
                  placeholder="e.g. 500"
                  value={minLatency}
                  onChange={(e) => setMinLatency(e.target.value)}
                />
              </div>

              <div className="filter-actions-col">
                <button className="primary btn-inline" onClick={() => { setPage(1); fetchLogs(1); }}>
                  Apply
                </button>
                {hasActiveFilters && (
                  <button className="control btn-inline text-red" onClick={resetFilters}>
                    <X size={12} />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <article className="panel logs">
          <div className="logs-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <span className="th-sort">Timestamp <ArrowUpDown size={10} /></span>
                  </th>
                  <th>Key / Prefix</th>
                  <th>Model</th>
                  <th>Method</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th>
                    <div className="flex items-center gap-1.5">
                      <Coins size={12} className="text-amber-500 shrink-0" />
                      <span>Credit</span>
                    </div>
                    <div className="text-[10px] text-muted font-normal lowercase tracking-normal">
                      in / out / total ≈ cr
                    </div>
                  </th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-4">Fetching logs from database...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-4">No request logs match the selected filter criteria.</td></tr>
                ) : (
                  logs.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="mono text-blue">{row.apiKey?.name || row.apiKey?.prefix}</td>
                      <td className="mono font-medium text-blue">{row.model || "-"}</td>
                      <td><span className="env">{row.method}</span></td>
                      <td className="mono">{row.path}</td>
                      <td><Status value={row.statusCode.toString() + (row.statusCode === 200 ? " OK" : "")} /></td>
                      <td className="mono text-xs">
                        {row.totalTokens !== null ? (
                          <div
                            className="inline-flex items-center gap-1.5 whitespace-nowrap"
                            title={`Input: ${(row.promptTokens || 0).toLocaleString()} · Output: ${(row.completionTokens || 0).toLocaleString()} · Total: ${(row.totalTokens || 0).toLocaleString()} tokens → Digunakan: ${(row.creditsCost ?? 0).toLocaleString()} CR`}
                          >
                            <span className="text-slate-600 font-medium">
                              {(row.promptTokens || 0).toLocaleString()}/{(row.completionTokens || 0).toLocaleString()}/{(row.totalTokens || 0).toLocaleString()}
                            </span>
                            <span className="text-muted" style={{ margin: "0 1px" }}>≈</span>
                            <span
                              className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded shadow-xs"
                              style={{
                                background: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fef3c7",
                                fontSize: "11px",
                              }}
                            >
                              <Coins size={11} className="text-amber-500 shrink-0" />
                              <span>{(row.creditsCost ?? 0).toLocaleString()} CR</span>
                            </span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="mono text-muted">{row.durationMs ? `${row.durationMs}ms` : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Server-Side Pagination Footer */}
          <div className="table-footer">
            <div className="table-footer-left">
              <span className="table-footer-text">
                Showing {pagination.totalCount === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, pagination.totalCount)} of {pagination.totalCount.toLocaleString()} logs
              </span>
              <div className="per-page-wrap flex items-center gap-2">
                <span className="text-muted text-xs">Per page:</span>
                <CustomDropdown
                  size="sm"
                  value={String(pageSize)}
                  onChange={(val) => setPageSize(Number(val))}
                  options={[
                    { value: "10", label: "10" },
                    { value: "15", label: "15" },
                    { value: "25", label: "25" },
                    { value: "50", label: "50" },
                  ]}
                  minWidth={72}
                  align="right"
                />
              </div>
            </div>

            <div className="pager">
              <button
                className="pager-btn"
                disabled={!pagination.hasPrevPage}
                onClick={() => handlePageChange(page - 1)}
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
                onClick={() => handlePageChange(page + 1)}
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
