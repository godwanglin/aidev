"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { Cpu, Coins, Layers, Zap } from "lucide-react";

interface ModelStat {
  model: string;
  count: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  avgLatencyMs: number;
  share: number;
  reqShare: number;
}

interface ModelBreakdownChartProps {
  data: ModelStat[];
}

const PALETTE = [
  "#6366f1", // Indigo
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f97316", // Orange
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#eab308", // Yellow
  "#3b82f6", // Blue
  "#14b8a6", // Teal
  "#64748b", // Slate
];

function formatTokens(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString();
}

function formatCost(val: number): string {
  if (val >= 1) return `$${val.toFixed(2)}`;
  if (val >= 0.01) return `$${val.toFixed(3)}`;
  return `$${val.toFixed(4)}`;
}

export default function ModelBreakdownChart({ data }: ModelBreakdownChartProps) {
  const [metric, setMetric] = useState<"tokens" | "requests" | "cost">("tokens");

  const totalValue = useMemo(() => {
    if (!data || data.length === 0) return 0;
    if (metric === "tokens") return data.reduce((acc, m) => acc + m.tokens, 0);
    if (metric === "requests") return data.reduce((acc, m) => acc + m.count, 0);
    return data.reduce((acc, m) => acc + m.costUsd, 0);
  }, [data, metric]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((m, idx) => {
      const val =
        metric === "tokens"
          ? m.tokens
          : metric === "requests"
          ? m.count
          : m.costUsd;
      const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
      return {
        name: m.model,
        value: val,
        pct: Number(pct.toFixed(1)),
        color: PALETTE[idx % PALETTE.length],
        raw: m,
      };
    });
  }, [data, metric, totalValue]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#11141a] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[320px] text-center">
        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 mb-3">
          <Cpu size={22} />
        </div>
        <p className="text-sm font-medium text-gray-300">No Model Activity</p>
        <p className="text-xs text-gray-400 mt-1">
          No upstream AI requests were recorded for the selected timeframe.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#11141a] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      {/* Header & Metric Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
            <Cpu size={16} className="text-indigo-400" />
            Distribution by Model
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Breakdown across upstream AI models
          </p>
        </div>

        {/* Metric Selector Tabs */}
        <div className="inline-flex items-center gap-1 bg-[#161a22] p-1 rounded-xl border border-white/5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMetric("tokens")}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              metric === "tokens"
                ? "bg-[#6366f1] text-white shadow"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Coins size={12} />
            <span>Tokens</span>
          </button>
          <button
            type="button"
            onClick={() => setMetric("requests")}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              metric === "requests"
                ? "bg-[#0284c7] text-white shadow"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Layers size={12} />
            <span>Requests</span>
          </button>
          <button
            type="button"
            onClick={() => setMetric("cost")}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              metric === "cost"
                ? "bg-[#059669] text-white shadow"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <span>$ Cost</span>
          </button>
        </div>
      </div>

      {/* Main Content: Donut + List */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center pt-4">
        {/* Donut Chart */}
        <div className="md:col-span-5 h-[210px] relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                stroke="#11141a"
                strokeWidth={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-[#141820]/95 backdrop-blur-md border border-white/10 rounded-xl p-2.5 shadow-2xl text-xs pointer-events-none z-50">
                      <div className="font-semibold text-white mb-1">
                        {item.name}
                      </div>
                      <div className="text-gray-300 font-mono text-[11px] space-y-0.5">
                        <div>
                          {metric === "tokens"
                            ? `${item.value.toLocaleString()} tokens`
                            : metric === "requests"
                            ? `${item.value.toLocaleString()} requests`
                            : formatCost(item.value)}
                          <span className="text-gray-400 ml-1.5 font-sans">
                            ({item.pct}%)
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 pt-0.5 border-t border-white/5 flex items-center gap-1">
                          <Zap size={10} className="text-amber-400" />
                          <span>Avg Latency: {(item.raw.avgLatencyMs / 1000).toFixed(2)}s</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center text badge */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
              {metric}
            </span>
            <span className="text-base font-bold text-white font-mono">
              {metric === "tokens"
                ? formatTokens(totalValue)
                : metric === "requests"
                ? totalValue.toLocaleString()
                : formatCost(totalValue)}
            </span>
          </div>
        </div>

        {/* Model Breakdown Legend List */}
        <div className="md:col-span-7 space-y-2.5 max-h-[230px] overflow-y-auto pr-1">
          {chartData.map((item) => (
            <div
              key={item.name}
              className="p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors"
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium text-gray-200 truncate" title={item.name}>
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="font-mono font-semibold text-white text-xs">
                    {metric === "tokens"
                      ? formatTokens(item.value)
                      : metric === "requests"
                      ? `${item.value.toLocaleString()} reqs`
                      : formatCost(item.value)}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                    {item.pct}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(item.pct, 2)}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1 font-mono">
                <span>
                  {item.raw.count.toLocaleString()} reqs • {formatCost(item.raw.costUsd)}
                </span>
                <span>
                  {item.raw.avgLatencyMs ? `${(item.raw.avgLatencyMs / 1000).toFixed(2)}s` : "-"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
