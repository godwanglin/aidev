"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import Status from "@/components/Status";
import {
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
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
          <div className="toolbar-filters">
            <div className="select-wrap">
              <Filter size={12} strokeWidth={1.5} className="select-icon" />
              <select suppressHydrationWarning
                className="control select-compact"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Status: All</option>
                <option value="200">200 OK</option>
                <option value="400">400 Bad Request</option>
                <option value="401">401 Unauthorized</option>
                <option value="429">429 Rate Limit</option>
                <option value="500">5xx Server Error</option>
                <option value="errors">All Errors (4xx/5xx)</option>
              </select>
            </div>

            <select suppressHydrationWarning
              className="control select-compact"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            >
              <option value="all">Model: All</option>
              <option value="gpt-5.2">gpt-5.2</option>
              <option value="gpt-5.5">gpt-5.5</option>
              <option value="gpt-5.6-luna">gpt-5.6-luna</option>
              <option value="claude-opus-4.6">claude-opus-4.6</option>
              <option value="claude-fable-5">claude-fable-5</option>
              <option value="claude-sonet-5">claude-sonet-5</option>
            </select>
          </div>
        </div>

        {/* Expandable Advanced Filter Panel */}
        {showAdvanced && (
          <div className="advanced-filter-box">
            <div className="filter-grid">
              <div className="filter-item">
                <label className="filter-label">Time Window</label>
                <select suppressHydrationWarning
                  className="control w-full"
                  value={rangeFilter}
                  onChange={(e) => setRangeFilter(e.target.value)}
                >
                  <option value="all">All Time</option>
                  <option value="24h">Past 24 Hours</option>
                  <option value="7d">Past 7 Days</option>
                  <option value="30d">Past 30 Days</option>
                </select>
              </div>

              <div className="filter-item">
                <label className="filter-label">HTTP Method</label>
                <select suppressHydrationWarning
                  className="control w-full"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                >
                  <option value="all">Any Method</option>
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="DELETE">DELETE</option>
                </select>
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
                  <th>Tokens (P/C/Total)</th>
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
                      <td className="mono text-muted">
                        {row.totalTokens !== null ? `${row.promptTokens || 0}/${row.completionTokens || 0}/${row.totalTokens}` : "-"}
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
              <div className="per-page-wrap">
                <span className="text-muted">Per page:</span>
                <select suppressHydrationWarning
                  className="per-page-select"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  <option value="10">10</option>
                  <option value="15">15</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
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
