"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Coins, Layers, ArrowUpRight, Sparkles } from "lucide-react";

export type MetricType = "tokens" | "requests" | "cost";

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

interface MainTrafficChartProps {
  data: TimeSeriesPoint[];
  range: string;
}

// Format numbers like in Gambar 1 (e.g. 0, 150.0M, 300.0M, 450.0M, 600.0M)
function formatYAxisTokens(val: number): string {
  if (val === 0) return "0";
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

function formatYAxisRequests(val: number): string {
  if (val === 0) return "0";
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

function formatYAxisCost(val: number): string {
  if (val === 0) return "$0.00";
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(3)}`;
}

// Custom Glassmorphism Tooltip
function CustomTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload || !payload.length) return null;

  const point: TimeSeriesPoint = payload[0].payload;
  const isTokens = metric === "tokens";
  const isRequests = metric === "requests";
  const isCost = metric === "cost";

  return (
    <div className="bg-[#141820]/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl text-xs min-w-[210px] pointer-events-none z-50">
      <div className="text-gray-400 font-medium mb-2 pb-1.5 border-b border-white/10 flex items-center justify-between">
        <span>{point.fullDate || label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-300 font-mono">
          {point.avgLatencyMs ? `${(point.avgLatencyMs / 1000).toFixed(2)}s` : "-"}
        </span>
      </div>

      <div className="space-y-1.5">
        {/* Main Highlight Metric */}
        <div className="flex items-center justify-between py-1 px-2 rounded-lg bg-white/5">
          <span className="text-gray-300 font-medium capitalize flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{
                backgroundColor: isTokens ? "#f97316" : isRequests ? "#38bdf8" : "#10b981",
              }}
            />
            {isTokens ? "Total Tokens" : isRequests ? "Total Requests" : "Estimated Cost"}
          </span>
          <span className="font-mono font-bold text-white text-sm">
            {isTokens
              ? point.tokens.toLocaleString()
              : isRequests
              ? `${point.requests.toLocaleString()} reqs`
              : `$${point.costUsd.toFixed(4)}`}
          </span>
        </div>

        {/* Detailed Breakdown */}
        {isTokens && (
          <div className="pt-1 text-[11px] text-gray-400 space-y-1 px-1">
            <div className="flex justify-between">
              <span>Prompt (Input):</span>
              <span className="font-mono text-gray-200">
                {point.promptTokens.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Completion (Output):</span>
              <span className="font-mono text-gray-200">
                {point.completionTokens.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {isRequests && (
          <div className="pt-1 text-[11px] text-gray-400 space-y-1 px-1">
            <div className="flex justify-between">
              <span className="text-emerald-400">Success (2xx):</span>
              <span className="font-mono text-gray-200">{point.successes}</span>
            </div>
            {point.errors > 0 && (
              <div className="flex justify-between">
                <span className="text-rose-400">Errors (4xx/5xx):</span>
                <span className="font-mono text-rose-300">{point.errors}</span>
              </div>
            )}
          </div>
        )}

        {isCost && (
          <div className="pt-1 text-[11px] text-gray-400 space-y-1 px-1">
            <div className="flex justify-between">
              <span>Tokens:</span>
              <span className="font-mono text-gray-200">
                {formatYAxisTokens(point.tokens)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Avg Cost / req:</span>
              <span className="font-mono text-gray-200">
                {point.requests > 0
                  ? `$${(point.costUsd / point.requests).toFixed(4)}`
                  : "$0.00"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MainTrafficChart({ data, range }: MainTrafficChartProps) {
  const [metric, setMetric] = useState<MetricType>("tokens");

  // Calculate Period Total for Active Metric
  const totalStats = useMemo(() => {
    let tokens = 0;
    let requests = 0;
    let cost = 0;
    for (const p of data) {
      tokens += p.tokens;
      requests += p.requests;
      cost += p.costUsd;
    }
    return { tokens, requests, cost };
  }, [data]);

  // Curve and Gradient Styling matching Gambar 1
  // Gambar 1 features a glowing indigo/purple smooth bezier curve `#6366f1` with dark backdrop
  const strokeColor = "#6366f1";
  const gradId = `traffic-grad-${metric}`;

  // Formatter for Y-Axis
  const yAxisFormatter = (val: number) => {
    if (metric === "tokens") return formatYAxisTokens(val);
    if (metric === "requests") return formatYAxisRequests(val);
    return formatYAxisCost(val);
  };

  const hasData = data && data.length > 0 && data.some((d) => d.tokens > 0 || d.requests > 0);

  return (
    <div className="w-full bg-[#11141a] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl relative overflow-hidden transition-all duration-300">
      {/* Background glow behind curve */}
      <div className="absolute top-0 right-1/4 w-96 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header: Pill Filter Switcher (Gambar 1 style) & Summary Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6 relative z-10">
        {/* Pill Buttons: Tokens | Requests | Cost */}
        <div className="inline-flex items-center bg-[#1a1e27] border border-white/[0.08] p-1 rounded-xl shadow-inner">
          <button
            type="button"
            onClick={() => setMetric("tokens")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
              metric === "tokens"
                ? "bg-[#ea580c] text-white shadow-md shadow-orange-500/20"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
            }`}
          >
            <Layers size={13} strokeWidth={2} />
            <span>Tokens</span>
          </button>

          <button
            type="button"
            onClick={() => setMetric("requests")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
              metric === "requests"
                ? "bg-[#0284c7] text-white shadow-md shadow-sky-500/20"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
            }`}
          >
            <ArrowUpRight size={13} strokeWidth={2} />
            <span>Requests</span>
          </button>

          <button
            type="button"
            onClick={() => setMetric("cost")}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
              metric === "cost"
                ? "bg-[#059669] text-white shadow-md shadow-emerald-500/20"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
            }`}
          >
            <Coins size={13} strokeWidth={2} />
            <span>Cost</span>
          </button>
        </div>

        {/* Period Summary Indicator */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium block">
              Period {range.toUpperCase()} Total
            </span>
            <span className="font-mono font-bold text-sm text-gray-100">
              {metric === "tokens" && `${formatYAxisTokens(totalStats.tokens)} Tokens`}
              {metric === "requests" && `${totalStats.requests.toLocaleString()} Requests`}
              {metric === "cost" && `$${totalStats.cost.toFixed(4)} USD`}
            </span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-56 sm:h-72 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 12, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              {/* Linear gradient matching Gambar 1 glow curve */}
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.38} />
                <stop offset="60%" stopColor={strokeColor} stopOpacity={0.08} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* Subtle gridlines matching Gambar 1 */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.05)"
              vertical={true}
              horizontal={true}
            />

            <XAxis
              dataKey="date"
              stroke="#525866"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              dy={8}
              interval="preserveStartEnd"
              tickFormatter={(val, idx) => {
                // If there are many ticks, thin them gracefully on mobile
                if (data.length > 20 && idx % 3 !== 0 && idx !== data.length - 1) return "";
                return val;
              }}
            />

            <YAxis
              stroke="#525866"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={yAxisFormatter}
              width={56}
              dx={-4}
            />

            <Tooltip
              content={<CustomTooltip metric={metric} />}
              cursor={{
                stroke: "rgba(255, 255, 255, 0.2)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />

            <Area
              type="monotone"
              dataKey={metric === "tokens" ? "tokens" : metric === "requests" ? "requests" : "costUsd"}
              stroke={strokeColor}
              strokeWidth={2.4}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{
                r: 5,
                fill: strokeColor,
                stroke: "#ffffff",
                strokeWidth: 2,
              }}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>

        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#11141a]/60 backdrop-blur-xs rounded-xl text-center px-4">
            <Sparkles className="w-8 h-8 text-indigo-400 mb-2 opacity-60 animate-pulse" />
            <p className="text-gray-300 font-medium text-xs">Belum ada aktivitas traffic di range ini.</p>
            <p className="text-gray-500 text-[11px] mt-0.5">
              Gunakan API key di Claude Code / Cline / Cursor untuk melihat grafik traffic live.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
