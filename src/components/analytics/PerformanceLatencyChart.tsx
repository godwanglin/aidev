"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Gauge, CheckCircle2, AlertTriangle, XCircle, Timer } from "lucide-react";

interface TimeSeriesPoint {
  date: string;
  fullDate: string;
  timestamp: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  costUsd: number;
  avgLatencyMs: number;
  errors: number;
  successes: number;
}

interface StatusBreakdown {
  successCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  successRate: number;
}

interface PerformanceLatencyChartProps {
  data: TimeSeriesPoint[];
  statusBreakdown?: StatusBreakdown;
  avgLatencyMs?: number;
}

function formatLatencySec(ms: number): string {
  if (ms === 0) return "0s";
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function PerformanceLatencyChart({
  data,
  statusBreakdown,
  avgLatencyMs = 0,
}: PerformanceLatencyChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((d) => ({
      ...d,
      latencySeconds: Number((d.avgLatencyMs / 1000).toFixed(2)),
    }));
  }, [data]);

  const successRate = statusBreakdown?.successRate ?? 100;
  const successCount = statusBreakdown?.successCount ?? 0;
  const clientErrors = statusBreakdown?.clientErrorCount ?? 0;
  const serverErrors = statusBreakdown?.serverErrorCount ?? 0;
  const totalErrors = clientErrors + serverErrors;

  return (
    <div className="bg-[#11141a] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
            <Gauge size={16} className="text-amber-400" />
            Performance & Upstream Latency
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Round-trip response time and gateway reliability status
          </p>
        </div>

        {/* Status Reliability Badges */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
            <CheckCircle2 size={12} className="text-emerald-400" />
            <span className="text-gray-300">Success:</span>
            <span className="font-mono font-semibold text-emerald-400">
              {successRate}% ({successCount.toLocaleString()})
            </span>
          </div>

          {totalErrors > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
              <AlertTriangle size={12} className="text-red-400" />
              <span className="text-gray-300">Errors:</span>
              <span className="font-mono font-semibold text-red-400">
                {totalErrors.toLocaleString()}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
            <Timer size={12} className="text-amber-400" />
            <span className="text-gray-300">Avg:</span>
            <span className="font-mono font-semibold text-amber-400">
              {formatLatencySec(avgLatencyMs)}
            </span>
          </div>
        </div>
      </div>

      {/* Latency Line Chart */}
      <div className="h-[210px] w-full pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#4b5563"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              dy={6}
            />
            <YAxis
              stroke="#4b5563"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}s`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const pt = payload[0].payload;
                return (
                  <div className="bg-[#141820]/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl text-xs min-w-[200px] pointer-events-none z-50">
                    <div className="text-gray-400 font-medium mb-2 pb-1.5 border-b border-white/10 flex items-center justify-between">
                      <span>{pt.fullDate || pt.date}</span>
                      <span className="text-[10px] font-mono text-gray-300">
                        {pt.requests} reqs
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400 flex items-center gap-1.5">
                          <Timer size={12} />
                          Avg Latency
                        </span>
                        <span className="font-mono font-semibold text-white">
                          {(pt.avgLatencyMs / 1000).toFixed(2)}s ({pt.avgLatencyMs}ms)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-white/5">
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          {pt.successes || 0} OK
                        </span>
                        {(pt.errors || 0) > 0 ? (
                          <span className="text-red-400 flex items-center gap-1">
                            <XCircle size={10} />
                            {pt.errors} Errors
                          </span>
                        ) : (
                          <span className="text-gray-500">0 Errors</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="latencySeconds"
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={{ fill: "#f59e0b", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#fbbf24", stroke: "#11141a", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
