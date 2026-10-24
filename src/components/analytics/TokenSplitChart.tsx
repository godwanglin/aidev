"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";

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

interface TokenSplitChartProps {
  data: TimeSeriesPoint[];
}

function formatTokenVal(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

export default function TokenSplitChart({ data }: TokenSplitChartProps) {
  const totals = useMemo(() => {
    if (!data || data.length === 0) {
      return { prompt: 0, completion: 0, total: 0, promptPct: 0, completionPct: 0 };
    }
    const prompt = data.reduce((acc, p) => acc + (p.promptTokens || 0), 0);
    const completion = data.reduce((acc, p) => acc + (p.completionTokens || 0), 0);
    const total = prompt + completion;
    const promptPct = total > 0 ? Number(((prompt / total) * 100).toFixed(1)) : 0;
    const completionPct = total > 0 ? Number(((completion / total) * 100).toFixed(1)) : 0;
    return { prompt, completion, total, promptPct, completionPct };
  }, [data]);

  const isEmpty = !data || data.length === 0 || totals.total === 0;

  return (
    <div className="bg-[#11141a] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
            <Scale size={16} className="text-sky-400" />
            Input vs Output Token Dynamics
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Prompt context ingestion vs Model generated completion
          </p>
        </div>

        {/* Aggregate Badges */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs">
            <ArrowDownLeft size={12} className="text-sky-400" />
            <span className="text-gray-300">Prompt:</span>
            <span className="font-mono font-semibold text-sky-400">
              {formatTokenVal(totals.prompt)} ({totals.promptPct}%)
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
            <ArrowUpRight size={12} className="text-emerald-400" />
            <span className="text-gray-300">Completion:</span>
            <span className="font-mono font-semibold text-emerald-400">
              {formatTokenVal(totals.completion)} ({totals.completionPct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      {isEmpty ? (
        <div className="h-[210px] flex flex-col items-center justify-center text-center">
          <p className="text-xs text-gray-400">No token activity recorded in this period</p>
        </div>
      ) : (
        <div className="h-[210px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="promptGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
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
                tickFormatter={formatTokenVal}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0].payload as TimeSeriesPoint;
                  const prompt = pt.promptTokens || 0;
                  const comp = pt.completionTokens || 0;
                  const tot = prompt + comp;
                  return (
                    <div className="bg-[#141820]/95 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl text-xs min-w-[190px] pointer-events-none z-50">
                      <div className="text-gray-400 font-medium mb-2 pb-1.5 border-b border-white/10 flex items-center justify-between">
                        <span>{pt.fullDate || pt.date}</span>
                        <span className="text-[10px] font-mono text-gray-300">
                          {formatTokenVal(tot)} total
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sky-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                            Prompt (Input)
                          </span>
                          <span className="font-mono font-semibold text-white">
                            {prompt.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                            Completion (Output)
                          </span>
                          <span className="font-mono font-semibold text-white">
                            {comp.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="promptTokens"
                name="Prompt (Input)"
                stackId="1"
                stroke="#38bdf8"
                strokeWidth={2}
                fill="url(#promptGradient)"
              />
              <Area
                type="monotone"
                dataKey="completionTokens"
                name="Completion (Output)"
                stackId="1"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#completionGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
