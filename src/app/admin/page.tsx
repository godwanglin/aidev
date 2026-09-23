"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import {
  RefreshCw,
  Network,
  Activity,
  LifeBuoy,
  Zap,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Flame,
  Plus,
  MessageSquare,
  TrendingUp,
} from "lucide-react";

interface OverviewData {
  providers: {
    total: number;
    healthy: number;
    rateLimited: number;
    exhausted: number;
    byProvider: { provider: string; count: number; healthy: number }[];
  };
  upstream: {
    totalRequests24h: number;
    totalTokensIn24h: number;
    totalTokensOut24h: number;
    healthScore: number;
    recentEvents: {
      id: string;
      provider: string;
      model: string;
      statusCode: number;
      isFailover: boolean;
      latencyMs: number;
      createdAt: string;
    }[];
  };
  tickets: {
    open: number;
    inProgress: number;
    total: number;
  };
}

const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "#10a37f",
  ANTHROPIC: "#d97706",
  GOOGLE: "#4285f4",
  OPENROUTER: "#8b5cf6",
  OPENCODE: "#06b6d4",
  CUSTOM: "#64748b",
};

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchOverview() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/overview");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchOverview();
  }, []);

  const providers = data?.providers || { total: 0, healthy: 0, rateLimited: 0, exhausted: 0, byProvider: [] };
  const upstream = data?.upstream || { totalRequests24h: 0, totalTokensIn24h: 0, totalTokensOut24h: 0, healthScore: 100, recentEvents: [] };
  const tickets = data?.tickets || { open: 0, inProgress: 0, total: 0 };

  const healthColor = upstream.healthScore >= 90 ? "#059669" : upstream.healthScore >= 70 ? "#d97706" : "#dc2626";

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Admin Command Center"
          subtitle="Multi-provider gateway status, upstream health, and operational overview."
        >
          <button className="control btn-icon-only" aria-label="Refresh" onClick={fetchOverview}>
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
        </PageHead>

        {/* KPI Metric Cards */}
        <div className="cards">
          <article className="card metric">
            <div className="metric-header">
              <label>CONNECTED PROVIDERS</label>
            </div>
            <div className="metric-body">
              <strong>{providers.total}</strong>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs" style={{ color: "#059669" }}>● {providers.healthy} Healthy</span>
              {providers.rateLimited > 0 && (
                <span className="text-xs" style={{ color: "#d97706" }}>● {providers.rateLimited} Limited</span>
              )}
              {providers.exhausted > 0 && (
                <span className="text-xs" style={{ color: "#dc2626" }}>● {providers.exhausted} Exhausted</span>
              )}
            </div>
          </article>

          <article className="card metric">
            <div className="metric-header">
              <label>UPSTREAM HEALTH (24H)</label>
            </div>
            <div className="metric-body">
              <strong style={{ color: healthColor }}>{upstream.healthScore.toFixed(1)}%</strong>
            </div>
            <div className="flex items-center gap-1 mt-1">
              {upstream.healthScore >= 90 ? (
                <CheckCircle2 size={12} style={{ color: "#059669" }} />
              ) : upstream.healthScore >= 70 ? (
                <AlertTriangle size={12} style={{ color: "#d97706" }} />
              ) : (
                <XCircle size={12} style={{ color: "#dc2626" }} />
              )}
              <span className="text-xs text-muted">
                {upstream.totalRequests24h.toLocaleString()} requests today
              </span>
            </div>
          </article>

          <article className="card metric">
            <div className="metric-header">
              <label>TOKEN THROUGHPUT (24H)</label>
            </div>
            <div className="metric-body">
              <strong>
                {upstream.totalTokensIn24h + upstream.totalTokensOut24h > 1000000
                  ? ((upstream.totalTokensIn24h + upstream.totalTokensOut24h) / 1000000).toFixed(2) + "M"
                  : (upstream.totalTokensIn24h + upstream.totalTokensOut24h).toLocaleString()}
              </strong>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted">
                In: {upstream.totalTokensIn24h.toLocaleString()}
              </span>
              <span className="text-xs text-muted">
                Out: {upstream.totalTokensOut24h.toLocaleString()}
              </span>
            </div>
          </article>

          <article className="card metric">
            <div className="metric-header">
              <label>PENDING TICKETS</label>
            </div>
            <div className="metric-body">
              <strong style={{ color: tickets.open + tickets.inProgress > 0 ? "#d97706" : "#059669" }}>
                {tickets.open + tickets.inProgress}
              </strong>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs" style={{ color: "#dc2626" }}>● {tickets.open} Open</span>
              <span className="text-xs" style={{ color: "#d97706" }}>● {tickets.inProgress} In Progress</span>
            </div>
          </article>
        </div>

        <div className="bottom">
          {/* Provider Status Quick Glance */}
          <article className="panel">
            <div className="panel-title">
              <h2>
                <Network size={14} strokeWidth={1.5} />
                <span>Provider Status</span>
              </h2>
              <Link href="/admin/providers" className="link-inline">
                <span>Manage All</span>
                <ArrowUpRight size={12} strokeWidth={1.75} />
              </Link>
            </div>
            {loading ? (
              <div className="p-4 text-center text-muted text-xs">Loading providers...</div>
            ) : providers.byProvider.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-muted mb-2">No providers connected yet.</p>
                <Link href="/admin/providers" className="control btn-inline text-xs">
                  <Plus size={12} />
                  <span>Add First Provider</span>
                </Link>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>PROVIDER</th>
                    <th>CONNECTIONS</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.byProvider.map((p) => (
                    <tr key={p.provider}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: PROVIDER_COLORS[p.provider] || "#64748b" }}
                          />
                          <span className="font-medium">{p.provider}</span>
                        </span>
                      </td>
                      <td className="mono">{p.count}</td>
                      <td>
                        {p.healthy === p.count ? (
                          <span className="flex items-center gap-1 text-xs" style={{ color: "#059669" }}>
                            <CheckCircle2 size={12} /> All Healthy
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs" style={{ color: "#d97706" }}>
                            <AlertTriangle size={12} /> {p.healthy}/{p.count} Healthy
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          {/* Quick Actions */}
          <article className="panel">
            <div className="panel-title">
              <h2>Quick Actions</h2>
            </div>
            <div className="quick">
              <Link href="/admin/providers" className="quick-item">
                <div className="quick-icon">
                  <Plus size={14} strokeWidth={1.5} />
                </div>
                <div>
                  <strong>Add Provider Connection</strong>
                  <small>Connect OpenAI, Anthropic, Google & more</small>
                </div>
              </Link>
              <Link href="/admin/usage" className="quick-item">
                <div className="quick-icon">
                  <Activity size={14} strokeWidth={1.5} />
                </div>
                <div>
                  <strong>Realtime Upstream Monitor</strong>
                  <small>Live SSE stream of all upstream requests</small>
                </div>
              </Link>
              <Link href="/admin/discounts" className="quick-item">
                <div className="quick-icon">
                  <Flame size={14} strokeWidth={1.5} />
                </div>
                <div>
                  <strong>Configure Promos & Discounts</strong>
                  <small>Flash sales, loyalty rewards, newcomer perks</small>
                </div>
              </Link>
              <Link href="/admin/tickets" className="quick-item">
                <div className="quick-icon">
                  <MessageSquare size={14} strokeWidth={1.5} />
                </div>
                <div>
                  <strong>Reply Support Tickets</strong>
                  <small>{tickets.open > 0 ? `${tickets.open} ticket(s) awaiting response` : "All caught up!"}</small>
                </div>
              </Link>
            </div>
          </article>
        </div>

        {/* Recent Upstream Events */}
        <article className="panel mt-4">
          <div className="panel-title">
            <h2>
              <Activity size={14} strokeWidth={1.5} />
              <span>Recent Upstream Events</span>
            </h2>
            <Link href="/admin/usage" className="link-inline">
              <span>View Live Stream</span>
              <ArrowUpRight size={12} strokeWidth={1.75} />
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>PROVIDER</th>
                <th>MODEL</th>
                <th>LATENCY</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted text-xs">
                    Loading upstream events...
                  </td>
                </tr>
              ) : upstream.recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted text-xs">
                    No upstream events recorded yet. Connect a provider and send requests to /v1/*.
                  </td>
                </tr>
              ) : (
                upstream.recentEvents.slice(0, 10).map((ev) => (
                  <tr key={ev.id}>
                    <td className="mono text-xs">
                      {new Date(ev.createdAt).toLocaleTimeString()}
                    </td>
                    <td>
                      <span className="flex items-center gap-1">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: PROVIDER_COLORS[ev.provider] || "#64748b" }}
                        />
                        <span className="text-xs font-medium">{ev.provider}</span>
                      </span>
                    </td>
                    <td className="mono text-xs font-medium" style={{ color: "#2563eb" }}>
                      {ev.model}
                    </td>
                    <td className="mono text-xs">{ev.latencyMs}ms</td>
                    <td>
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: ev.statusCode === 200 ? "#dcfce7" : ev.statusCode === 429 ? "#fef3c7" : "#fee2e2",
                          color: ev.statusCode === 200 ? "#166534" : ev.statusCode === 429 ? "#92400e" : "#991b1b",
                        }}
                      >
                        {ev.statusCode}
                        {ev.isFailover && " ⚡"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </article>
      </div>
    </DashboardShell>
  );
}
