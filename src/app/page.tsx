"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardShell from "@/components/DashboardShell";
import PageHead from "@/components/PageHead";
import Status from "@/components/Status";
import MiniSparkline from "@/components/MiniSparkline";
import MainTrafficChart from "@/components/analytics/MainTrafficChart";
import ModelBreakdownChart from "@/components/analytics/ModelBreakdownChart";
import TokenSplitChart from "@/components/analytics/TokenSplitChart";
import PerformanceLatencyChart from "@/components/analytics/PerformanceLatencyChart";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  KeyRound,
  BookOpen,
  ArrowUpRight,
  Boxes,
  Activity,
  Layers,
  Coins,
  DollarSign,
  Gauge,
  CheckCircle2,
} from "lucide-react";

export default function OverviewPage() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<any>({
    range: "7d",
    totalRequests: 0,
    reqTrend: "0.0%",
    totalTokens: 0,
    tokenTrend: "0.0%",
    promptTokens: 0,
    completionTokens: 0,
    totalCostUsd: 0,
    costTrend: "0.0%",
    avgLatencyMs: 0,
    latencyTrend: "0.0%",
    errorRate: "0.00%",
    errorCount: 0,
    successRate: "100.0%",
    timeSeries: [],
    modelBreakdown: [],
    statusBreakdown: { successCount: 0, clientErrorCount: 0, serverErrorCount: 0, successRate: 100 },
    sparkSeriesTokens: [0, 0, 0, 0, 0, 0, 0],
    sparkSeriesRequests: [0, 0, 0, 0, 0, 0, 0],
    sparkSeriesCost: [0, 0, 0, 0, 0, 0, 0],
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
    } catch (e) {
      console.error("Failed to load overview data", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOverview(range);
  }, [range]);

  const metrics = [
    {
      label: "TOTAL REQUESTS",
      icon: Layers,
      val: data.totalRequests.toLocaleString(),
      trend: data.reqTrend || "0.0%",
      up: !data.reqTrend?.startsWith("-"),
      color: "#0284c7",
      series: data.sparkSeriesRequests?.length ? data.sparkSeriesRequests : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "TOKENS USED",
      icon: Coins,
      val:
        data.totalTokens >= 1_000_000_000
          ? (data.totalTokens / 1_000_000_000).toFixed(2) + "B"
          : data.totalTokens >= 1_000_000
          ? (data.totalTokens / 1_000_000).toFixed(2) + "M"
          : data.totalTokens.toLocaleString(),
      trend: data.tokenTrend || "0.0%",
      up: !data.tokenTrend?.startsWith("-"),
      color: "#f97316",
      series: data.sparkSeriesTokens?.length ? data.sparkSeriesTokens : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "ESTIMATED COST",
      icon: DollarSign,
      val:
        data.totalCostUsd >= 1
          ? `$${data.totalCostUsd.toFixed(2)}`
          : `$${data.totalCostUsd.toFixed(4)}`,
      trend: data.costTrend || "0.0%",
      up: !data.costTrend?.startsWith("-"),
      color: "#10b981",
      series: data.sparkSeriesCost?.length ? data.sparkSeriesCost : [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "AVG LATENCY",
      icon: Gauge,
      val: data.avgLatencyMs ? `${(data.avgLatencyMs / 1000).toFixed(2)}s` : "0.00s",
      trend: data.latencyTrend || "0.0%",
      up: data.latencyTrend?.startsWith("-"), // Lower latency is better
      color: "#f59e0b",
      series: [0, 0, 0, 0, 0, 0, 0],
    },
    {
      label: "SUCCESS RATE",
      icon: CheckCircle2,
      val: data.successRate || "100%",
      trend: data.errorCount > 0 ? `${data.errorCount} errors` : "Zero errors",
      up: data.errorRate === "0.00%",
      color: data.errorRate === "0.00%" ? "#10b981" : "#ef4444",
      series: [0, 0, 0, 0, 0, 0, 0],
    },
  ];

  return (
    <DashboardShell>
      <div className="content space-y-6">
        {/* Header with Title and Range Picker */}
        <PageHead
          title="Overview & Analytics"
          subtitle="Real-time telemetry, model consumption patterns, and upstream gateway latency."
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
              className={`seg-btn ${range === "14d" ? "active" : ""}`}
              onClick={() => setRange("14d")}
            >
              14D
            </button>
            <button
              className={`seg-btn ${range === "30d" ? "active" : ""}`}
              onClick={() => setRange("30d")}
            >
              30D
            </button>
            <button
              className={`seg-btn ${range === "all" ? "active" : ""}`}
              onClick={() => setRange("all")}
            >
              All
            </button>
          </div>
          <button
            className="control btn-icon-only"
            aria-label="Refresh"
            disabled={loading}
            onClick={() => fetchOverview(range)}
          >
            <RefreshCw size={13} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
          </button>
        </PageHead>

        {/* 5 Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <article
                className="bg-[#11141a] border border-white/5 rounded-2xl p-4 shadow-lg hover:border-white/10 transition-all flex flex-col justify-between"
                key={m.label}
              >
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span className="flex items-center gap-1.5 font-medium tracking-wider text-[11px]">
                    <Icon size={13} style={{ color: m.color }} />
                    {m.label}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded ${
                      m.up
                        ? "text-emerald-400 bg-emerald-500/10"
                        : "text-red-400 bg-red-500/10"
                    }`}
                  >
                    {m.up ? (
                      <TrendingUp size={11} strokeWidth={2} />
                    ) : (
                      <TrendingDown size={11} strokeWidth={2} />
                    )}
                    {m.trend}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <strong className="text-xl font-bold font-mono text-white tracking-tight">
                    {m.val}
                  </strong>
                </div>
                <div className="h-6 mt-3">
                  <MiniSparkline data={m.series} color={m.color} />
                </div>
              </article>
            );
          })}
        </div>

        {/* Gambar 1: Main Traffic Chart (Tokens | Requests | Cost) */}
        <div>
          <MainTrafficChart data={data.timeSeries} range={range} />
        </div>

        {/* 2-Column Analytics: Model Breakdown + Token Dynamics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ModelBreakdownChart data={data.modelBreakdown} />
          <TokenSplitChart data={data.timeSeries} />
        </div>

        {/* Latency & Reliability Performance Chart */}
        <div>
          <PerformanceLatencyChart
            data={data.timeSeries}
            statusBreakdown={data.statusBreakdown}
            avgLatencyMs={data.avgLatencyMs}
          />
        </div>

        {/* Bottom Section: Recent Request Logs & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <article className="lg:col-span-2 bg-[#11141a] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                  <Activity size={16} className="text-indigo-400" />
                  Recent Request Logs
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Latest activity streamed from your API clients
                </p>
              </div>
              <Link
                href="/logs"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
              >
                <span>Full Logs Table</span>
                <ArrowUpRight size={13} strokeWidth={1.75} />
              </Link>
            </div>

            <div className="table-wrap mt-3 overflow-x-auto">
              <table className="table w-full text-left text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-white/5">
                    <th className="py-2.5 px-3 font-medium">TIME</th>
                    <th className="py-2.5 px-3 font-medium">KEY</th>
                    <th className="py-2.5 px-3 font-medium">MODEL</th>
                    <th className="py-2.5 px-3 font-medium">ENDPOINT</th>
                    <th className="py-2.5 px-3 font-medium">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loading && data.recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-gray-400">
                        Loading real-time logs...
                      </td>
                    </tr>
                  ) : data.recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-gray-400">
                        No requests logged yet for this period ({range.toUpperCase()}). Send a request to
                        /v1/chat/completions to see live logs.
                      </td>
                    </tr>
                  ) : (
                    data.recentLogs.map((row: any) => (
                      <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3 font-mono text-gray-400">
                          {new Date(row.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-gray-200">
                          {row.apiKey?.name || row.apiKey?.prefix || "-"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-indigo-400">
                          {row.model || "-"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-gray-400">{row.path}</td>
                        <td className="py-2.5 px-3">
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
            </div>
          </article>

          {/* Quick Actions Panel */}
          <article className="bg-[#11141a] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="pb-3 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white tracking-wide">
                Quick Shortcuts
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Manage your credentials & explore documentation
              </p>
            </div>
            <div className="space-y-3 mt-4">
              <Link
                href="/keys"
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <KeyRound size={16} />
                </div>
                <div className="min-w-0">
                  <strong className="text-xs font-semibold text-gray-200 group-hover:text-white block">
                    API Keys
                  </strong>
                  <small className="text-[11px] text-gray-400 truncate block">
                    Create and configure internal client tokens
                  </small>
                </div>
              </Link>

              <Link
                href="/models"
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                  <Boxes size={16} />
                </div>
                <div className="min-w-0">
                  <strong className="text-xs font-semibold text-gray-200 group-hover:text-white block">
                    AI Models & Pricing
                  </strong>
                  <small className="text-[11px] text-gray-400 truncate block">
                    View prompt/completion rates and routing
                  </small>
                </div>
              </Link>

              <Link
                href="/logs"
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Activity size={16} />
                </div>
                <div className="min-w-0">
                  <strong className="text-xs font-semibold text-gray-200 group-hover:text-white block">
                    Request Logs
                  </strong>
                  <small className="text-[11px] text-gray-400 truncate block">
                    Filter by model, status code, and latency
                  </small>
                </div>
              </Link>
            </div>
          </article>
        </div>
      </div>
    </DashboardShell>
  );
}
