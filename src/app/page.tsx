"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import Status from "@/components/Status";
import UsageChart from "@/components/UsageChart";
import MiniSparkline from "@/components/MiniSparkline";
import {
  RefreshCw,
  Plus,
  TrendingUp,
  TrendingDown,
  KeyRound,
  BookOpen,
  ArrowUpRight,
  Boxes,
} from "lucide-react";

export default function OverviewPage() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<any>({
    totalRequests: 0,
    reqTrend: "0.0%",
    totalTokens: 0,
    tokenTrend: "0.0%",
    avgMillionTokens: "0.0000M",
    avgTrend: "0.0%",
    errorRate: "0.00%",
    sparkSeries: [0, 0, 0, 0, 0, 0, 0],
    modelBreakdown: [],
    recentLogs: [],
  });
  const [loading, setLoading] = useState(true);

  async function fetchOverview(selectedRange = range) {
    setLoading(true);
    try {
      const res = await fetch(`/api/overview?range=${selectedRange}`);
      const json = await res.json();
      if (json.totalRequests !== undefined) {
        setData(json);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchOverview(range);
  }, [range]);

  const metrics = [
    {
      label: "TOTAL REQUESTS",
      val: data.totalRequests.toLocaleString(),
      trend: data.reqTrend,
      up: !data.reqTrend.startsWith("-"),
      color: "#2563eb",
      series:
        data.sparkSeries && data.sparkSeries.length > 0
          ? data.sparkSeries
          : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "TOKENS USED",
      val:
        data.totalTokens > 1000000
          ? (data.totalTokens / 1000000).toFixed(2) + "M"
          : data.totalTokens.toLocaleString(),
      trend: data.tokenTrend,
      up: !data.tokenTrend.startsWith("-"),
      color: "#2563eb",
      series:
        data.sparkSeries && data.sparkSeries.length > 0
          ? data.sparkSeries
          : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "AVG TOKENS / REQ",
      val: data.avgMillionTokens,
      trend: data.avgTrend,
      up: !data.avgTrend.startsWith("-"),
      color: "#059669",
      series:
        data.sparkSeries && data.sparkSeries.length > 0
          ? data.sparkSeries
          : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "ERROR RATE",
      val: data.errorRate,
      trend: data.errorRate === "0.00%" ? "0.0%" : "+" + data.errorRate,
      up: data.errorRate === "0.00%",
      color: data.errorRate === "0.00%" ? "#059669" : "#dc2626",
      series: [0, 0, 0, 0, 0, 0, 0],
    },
  ];

  return (
    <DashboardShell>
      <div className="content">
        <PageHead
          title="Overview"
          subtitle="Real-time monitoring of internal gateway traffic, token consumption, and upstream latency."
        >
          <div className="segmented">
            <button
              className={`seg-btn ${range === "24h" ? "active" : ""}`}
              onClick={() => setRange("24h")}
            >
              24h
            </button>
            <button
              className={`seg-btn ${range === "7d" ? "active" : ""}`}
              onClick={() => setRange("7d")}
            >
              7D
            </button>
            <button
              className={`seg-btn ${range === "30d" ? "active" : ""}`}
              onClick={() => setRange("30d")}
            >
              30D
            </button>
          </div>
          <button
            className="control btn-icon-only"
            aria-label="Refresh"
            onClick={() => fetchOverview(range)}
          >
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
          
        </PageHead>

        <div className="cards">
          {metrics.map((m) => {
            return (
              <article className="card metric" key={m.label}>
                <div className="metric-header">
                  <label>{m.label}</label>
                  <span className={"trend " + (m.up ? "up" : "down")}>
                    {m.up ? (
                      <TrendingUp size={11} strokeWidth={2} />
                    ) : (
                      <TrendingDown size={11} strokeWidth={2} />
                    )}
                    {m.trend}
                  </span>
                </div>
                <div className="metric-body">
                  <strong>{m.val}</strong>
                </div>
                <div className="metric-chart-wrap">
                  <MiniSparkline data={m.series} color={m.color} />
                </div>
              </article>
            );
          })}
        </div>

        <article className="panel">
          <div className="panel-title">
            <h2>Requests by Model</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">
                Range: {range.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="chart-container-recharts">
            <UsageChart modelBreakdown={data.modelBreakdown} />
          </div>
        </article>

        <div className="bottom">
          <article className="panel">
            <div className="panel-title">
              <h2>Recent Request Logs</h2>
              <Link href="/logs" className="link-inline">
                <span>View All Logs</span>
                <ArrowUpRight size={12} strokeWidth={1.75} />
              </Link>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>KEY</th>
                  <th>MODEL</th>
                  <th>ENDPOINT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      Loading real-time logs...
                    </td>
                  </tr>
                ) : data.recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-4">
                      No requests logged yet for this period ({range}). Send a request to
                      /v1/chat/completions to see live logs.
                    </td>
                  </tr>
                ) : (
                  data.recentLogs.map((row: any) => (
                    <tr key={row.id}>
                      <td className="mono">
                        {new Date(row.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="cell-strong">
                        {row.apiKey?.name || row.apiKey?.prefix}
                      </td>
                      <td className="mono font-medium text-blue">
                        {row.model || "-"}
                      </td>
                      <td className="mono">{row.path}</td>
                      <td>
                        <Status
                          value={
                            row.statusCode.toString() +
                            (row.statusCode === 200 ? " OK" : "")
                          }
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </article>
          <article className="panel">
            <div className="panel-title">
              <h2>Quick Actions</h2>
            </div>
            <div className="quick">
              <Link href="/keys" className="quick-item">
                <div className="quick-icon">
                  <KeyRound size={14} strokeWidth={1.5} />
                </div>
                <div>
                  <strong>Create Internal API Key</strong>
                  <small>Generate scoped tokens for your clients</small>
                </div>
              </Link>
              <Link href="/models" className="quick-item">
                <div className="quick-icon">
                  <Boxes size={14} strokeWidth={1.5} />
                </div>
                <div>
                  <strong>Supported AI Models</strong>
                  <small>Check prompt & completion pricing</small>
                </div>
              </Link>
              <a href="#docs" className="quick-item">
                <div className="quick-icon">
                  <BookOpen size={14} strokeWidth={1.5} />
                </div>
                <div>
                  <strong>OpenAI-compatible Integration</strong>
                  <small>Base URL: /v1 with Bearer token</small>
                </div>
              </a>
            </div>
          </article>
        </div>
      </div>
    </DashboardShell>
  );
}
