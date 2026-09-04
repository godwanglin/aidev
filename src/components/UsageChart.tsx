"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface UsageChartProps {
  modelBreakdown?: Array<{
    model: string;
    count: number;
    tokens: number;
    share: number;
  }>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip">
        <div className="font-semibold text-xs text-ink mb-1">{label}</div>
        <div className="flex items-center gap-2 text-xs mb-1">
          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
          <span className="text-muted">Total Requests:</span>
          <span className="font-mono font-medium text-ink">
            {payload[0].value.toLocaleString()}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

export default function UsageChart({ modelBreakdown }: UsageChartProps) {
  const chartData =
    modelBreakdown && modelBreakdown.length > 0
      ? modelBreakdown.map((m) => ({
          model: m.model,
          requests: m.count,
          tokens: m.tokens,
        }))
      : [];

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-44 text-muted text-xs gap-1 border border-dashed border-line rounded">
        <span>No proxy request records in this time filter.</span>
        <span className="text-blue">Send requests to /v1/chat/completions to populate data.</span>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 10, left: -10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="model"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={4}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f1f5f9" }} />
          <Bar
            dataKey="requests"
            name="Requests by Model"
            fill="#2563eb"
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
