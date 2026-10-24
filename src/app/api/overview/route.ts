import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

interface CachedOverview {
  data: any;
  expiresAt: number;
}

const overviewCache = new Map<string, CachedOverview>();

function generateBuckets(startDate: Date, endDate: Date, range: string) {
  const buckets: any[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (range === "24h") {
    // 24 hourly buckets
    const curr = new Date(start);
    curr.setMinutes(0, 0, 0);
    while (curr <= end) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, "0");
      const day = String(curr.getDate()).padStart(2, "0");
      const hour = String(curr.getHours()).padStart(2, "0");
      const key = `${year}-${month}-${day} ${hour}:00`;
      const dateLabel = curr.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
      const fullDate = curr.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      buckets.push({
        key,
        date: dateLabel,
        fullDate,
        timestamp: curr.getTime(),
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        requests: 0,
        costUsd: 0,
        latencySum: 0,
        avgLatencyMs: 0,
        errors: 0,
        successes: 0,
      });
      curr.setTime(curr.getTime() + 60 * 60 * 1000);
    }
  } else {
    // Daily buckets
    const curr = new Date(start);
    curr.setHours(0, 0, 0, 0);
    while (curr <= end) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, "0");
      const day = String(curr.getDate()).padStart(2, "0");
      const key = `${year}-${month}-${day}`;
      const dateLabel = curr.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const fullDate = curr.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      buckets.push({
        key,
        date: dateLabel,
        fullDate,
        timestamp: curr.getTime(),
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        requests: 0,
        costUsd: 0,
        latencySum: 0,
        avgLatencyMs: 0,
        errors: 0,
        successes: 0,
      });
      curr.setDate(curr.getDate() + 1);
    }
  }
  return buckets;
}

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({
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
        successRate: "100.0%",
        timeSeries: [],
        modelBreakdown: [],
        statusBreakdown: { successCount: 0, clientErrorCount: 0, serverErrorCount: 0, successRate: 100 },
        sparkSeriesTokens: [0, 0, 0, 0, 0, 0, 0],
        sparkSeriesRequests: [0, 0, 0, 0, 0, 0, 0],
        sparkSeriesCost: [0, 0, 0, 0, 0, 0, 0],
        recentLogs: [],
      });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "7d";
    const cacheKey = `${sessionUser.id}:${range}`;
    const nowMs = Date.now();

    const cached = overviewCache.get(cacheKey);
    if (cached && cached.expiresAt > nowMs) {
      return NextResponse.json(cached.data);
    }

    const now = new Date(nowMs);
    let startDate = new Date();

    if (range === "24h") {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (range === "14d") {
      startDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    } else if (range === "30d") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === "all") {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const userScope = { apiKey: { userId: sessionUser.id } };

    const whereTime = {
      ...userScope,
      createdAt: { gte: startDate },
    };

    const periodDuration = now.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - periodDuration);
    const wherePrevTime = {
      ...userScope,
      createdAt: { gte: prevStartDate, lt: startDate },
    };

    // Parallel fetch: current period stats + previous period stats + current logs for bucketing
    const [
      totalRequests,
      prevRequests,
      tokenAgg,
      prevTokenAgg,
      costAgg,
      prevCostAgg,
      latencyAgg,
      prevLatencyAgg,
      recentLogs,
      periodLogs,
    ] = await Promise.all([
      prisma.requestLog.count({ where: whereTime }),
      prisma.requestLog.count({ where: wherePrevTime }),
      prisma.requestLog.aggregate({
        where: whereTime,
        _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
      }),
      prisma.requestLog.aggregate({
        where: wherePrevTime,
        _sum: { totalTokens: true },
      }),
      prisma.requestLog.aggregate({
        where: whereTime,
        _sum: { costUsd: true },
      }),
      prisma.requestLog.aggregate({
        where: wherePrevTime,
        _sum: { costUsd: true },
      }),
      prisma.requestLog.aggregate({
        where: whereTime,
        _avg: { durationMs: true },
      }),
      prisma.requestLog.aggregate({
        where: wherePrevTime,
        _avg: { durationMs: true },
      }),
      prisma.requestLog.findMany({
        where: whereTime,
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          apiKey: { select: { name: true, prefix: true } },
        },
      }),
      prisma.requestLog.findMany({
        where: whereTime,
        select: {
          createdAt: true,
          totalTokens: true,
          promptTokens: true,
          completionTokens: true,
          costUsd: true,
          durationMs: true,
          statusCode: true,
          model: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Calculate Trends
    const calcTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? "+100%" : "0.0%";
      const pct = (((current - previous) / previous) * 100).toFixed(1);
      return pct.startsWith("-") || pct.startsWith("+") ? `${pct}%` : `+${pct}%`;
    };

    const totalTokens = tokenAgg._sum.totalTokens || 0;
    const promptTokens = tokenAgg._sum.promptTokens || 0;
    const completionTokens = tokenAgg._sum.completionTokens || 0;
    const prevTokens = prevTokenAgg._sum.totalTokens || 0;

    const totalCostUsd = Number(costAgg._sum.costUsd || 0);
    const prevCostUsd = Number(prevCostAgg._sum.costUsd || 0);

    const avgLatencyMs = Math.round(latencyAgg._avg.durationMs || 0);
    const prevAvgLatencyMs = Math.round(prevLatencyAgg._avg.durationMs || 0);

    const reqTrend = calcTrend(totalRequests, prevRequests);
    const tokenTrend = calcTrend(totalTokens, prevTokens);
    const costTrend = calcTrend(totalCostUsd, prevCostUsd);
    const latencyTrend = calcTrend(avgLatencyMs, prevAvgLatencyMs);

    // Build TimeSeries Buckets
    const buckets = generateBuckets(startDate, now, range);
    const bucketMap = new Map<string, any>();
    for (const b of buckets) {
      bucketMap.set(b.key, b);
    }

    // Model aggregation map
    const modelStatsMap = new Map<string, {
      model: string;
      count: number;
      tokens: number;
      promptTokens: number;
      completionTokens: number;
      costUsd: number;
      latencySum: number;
    }>();

    let clientErrorCount = 0;
    let serverErrorCount = 0;
    let successCount = 0;

    for (const log of periodLogs) {
      const logDate = new Date(log.createdAt);
      const year = logDate.getFullYear();
      const month = String(logDate.getMonth() + 1).padStart(2, "0");
      const day = String(logDate.getDate()).padStart(2, "0");

      let key = `${year}-${month}-${day}`;
      if (range === "24h") {
        const hour = String(logDate.getHours()).padStart(2, "0");
        key = `${year}-${month}-${day} ${hour}:00`;
      }

      const bucket = bucketMap.get(key);
      const pTokens = log.promptTokens || 0;
      const cTokens = log.completionTokens || 0;
      const tTokens = log.totalTokens || (pTokens + cTokens);
      const cUsd = Number(log.costUsd || 0);
      const duration = log.durationMs || 0;
      const isError = log.statusCode >= 400;

      if (log.statusCode >= 200 && log.statusCode < 400) {
        successCount++;
      } else if (log.statusCode >= 400 && log.statusCode < 500) {
        clientErrorCount++;
      } else if (log.statusCode >= 500) {
        serverErrorCount++;
      }

      if (bucket) {
        bucket.requests++;
        bucket.tokens += tTokens;
        bucket.promptTokens += pTokens;
        bucket.completionTokens += cTokens;
        bucket.costUsd += cUsd;
        bucket.latencySum += duration;
        if (isError) bucket.errors++;
        else bucket.successes++;
      }

      // Group by model
      const modelName = log.model || "other";
      const mEntry = modelStatsMap.get(modelName) || {
        model: modelName,
        count: 0,
        tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        latencySum: 0,
      };
      mEntry.count++;
      mEntry.tokens += tTokens;
      mEntry.promptTokens += pTokens;
      mEntry.completionTokens += cTokens;
      mEntry.costUsd += cUsd;
      mEntry.latencySum += duration;
      modelStatsMap.set(modelName, mEntry);
    }

    // Finalize buckets
    const timeSeries = buckets.map((b) => ({
      date: b.date,
      fullDate: b.fullDate,
      timestamp: b.timestamp,
      tokens: b.tokens,
      promptTokens: b.promptTokens,
      completionTokens: b.completionTokens,
      requests: b.requests,
      costUsd: Number(b.costUsd.toFixed(4)),
      avgLatencyMs: b.requests > 0 ? Math.round(b.latencySum / b.requests) : 0,
      errors: b.errors,
      successes: b.successes,
    }));

    // Finalize model breakdown
    const modelBreakdown = Array.from(modelStatsMap.values())
      .map((m) => ({
        model: m.model,
        count: m.count,
        tokens: m.tokens,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        costUsd: Number(m.costUsd.toFixed(4)),
        avgLatencyMs: m.count > 0 ? Math.round(m.latencySum / m.count) : 0,
        share: totalTokens > 0 ? Math.round((m.tokens / totalTokens) * 100) : 0,
        reqShare: totalRequests > 0 ? Math.round((m.count / totalRequests) * 100) : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    // Error & Success Rates
    const totalErrors = clientErrorCount + serverErrorCount;
    const errorRateNum = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const errorRate = `${errorRateNum.toFixed(2)}%`;
    const successRateNum = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100;
    const successRate = `${successRateNum.toFixed(1)}%`;

    // 7-bucket Sparklines for metric cards
    const bucketInterval = periodDuration / 7;
    const sparkSeriesTokens = [0, 0, 0, 0, 0, 0, 0];
    const sparkSeriesRequests = [0, 0, 0, 0, 0, 0, 0];
    const sparkSeriesCost = [0, 0, 0, 0, 0, 0, 0];
    const startMs = startDate.getTime();

    for (const log of periodLogs) {
      const idx = Math.min(Math.floor((new Date(log.createdAt).getTime() - startMs) / bucketInterval), 6);
      if (idx >= 0 && idx < 7) {
        sparkSeriesRequests[idx]++;
        sparkSeriesTokens[idx] += log.totalTokens || 0;
        sparkSeriesCost[idx] += Number(log.costUsd || 0);
      }
    }

    const responseData = {
      range,
      totalRequests,
      reqTrend,
      totalTokens,
      promptTokens,
      completionTokens,
      tokenTrend,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      costTrend,
      avgLatencyMs,
      latencyTrend,
      errorRate,
      errorCount: totalErrors,
      successRate,
      timeSeries,
      modelBreakdown,
      statusBreakdown: {
        successCount,
        clientErrorCount,
        serverErrorCount,
        successRate: Number(successRateNum.toFixed(1)),
      },
      sparkSeriesTokens,
      sparkSeriesRequests,
      sparkSeriesCost,
      recentLogs,
    };

    overviewCache.set(cacheKey, {
      data: responseData,
      expiresAt: nowMs + 10000,
    });

    return NextResponse.json(responseData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
