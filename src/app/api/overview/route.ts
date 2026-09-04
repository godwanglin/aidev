import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

interface CachedOverview {
  data: any;
  expiresAt: number;
}

const overviewCache = new Map<string, CachedOverview>();

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
        rawAvgTokens: 0,
        avgMillionTokens: "0.0000M",
        avgTrend: "0.0%",
        errorRate: "0.00%",
        sparkSeries: [0, 0, 0, 0, 0, 0, 0],
        modelBreakdown: [],
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
    } else if (range === "30d") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
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

    const [
      totalRequests,
      prevRequests,
      tokenAgg,
      prevTokenAgg,
      errorCount,
      rawModelGroups,
      recentLogs,
      bucketLogs
    ] = await Promise.all([
      prisma.requestLog.count({ where: whereTime }),
      prisma.requestLog.count({ where: wherePrevTime }),
      prisma.requestLog.aggregate({
        where: whereTime,
        _sum: { totalTokens: true },
      }),
      prisma.requestLog.aggregate({
        where: wherePrevTime,
        _sum: { totalTokens: true },
      }),
      prisma.requestLog.count({
        where: { ...whereTime, statusCode: { gte: 400 } },
      }),
      prisma.requestLog.groupBy({
        by: ["model"],
        where: whereTime,
        _count: { id: true },
        _sum: { totalTokens: true },
        orderBy: { _count: { id: "desc" } },
      }),
      prisma.requestLog.findMany({
        where: whereTime,
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          apiKey: { select: { name: true, prefix: true } },
        },
      }),
      prisma.requestLog.findMany({
        where: whereTime,
        select: { createdAt: true },
      }),
    ]);

    const reqTrend =
      prevRequests === 0
        ? totalRequests > 0
          ? "+100%"
          : "0.0%"
        : `${(((totalRequests - prevRequests) / prevRequests) * 100).toFixed(1)}%`;

    const totalTokens = tokenAgg._sum.totalTokens || 0;
    const prevTokens = prevTokenAgg._sum.totalTokens || 0;
    const tokenTrend =
      prevTokens === 0
        ? totalTokens > 0
          ? "+100%"
          : "0.0%"
        : `${(((totalTokens - prevTokens) / prevTokens) * 100).toFixed(1)}%`;

    const errorRateNum = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    const errorRate = `${errorRateNum.toFixed(2)}%`;

    const rawAvgTokens = totalRequests > 0 ? totalTokens / totalRequests : 0;
    const avgMillionTokens = (rawAvgTokens / 1000000).toFixed(4);

    const prevAvgTokens = prevRequests > 0 ? prevTokens / prevRequests : 0;
    const avgTrend =
      prevAvgTokens === 0
        ? rawAvgTokens > 0
          ? "+100%"
          : "0.0%"
        : `${(((rawAvgTokens - prevAvgTokens) / prevAvgTokens) * 100).toFixed(1)}%`;

    const modelBreakdown = rawModelGroups.map((g) => ({
      model: g.model || "other",
      count: g._count.id,
      tokens: g._sum.totalTokens || 0,
      share: totalRequests > 0 ? Math.round((g._count.id / totalRequests) * 100) : 0,
    }));

    const bucketInterval = periodDuration / 7;
    const sparkSeries = [0, 0, 0, 0, 0, 0, 0];
    const startMs = startDate.getTime();

    for (const log of bucketLogs) {
      const idx = Math.min(Math.floor((log.createdAt.getTime() - startMs) / bucketInterval), 6);
      if (idx >= 0 && idx < 7) {
        sparkSeries[idx]++;
      }
    }

    const responseData = {
      range,
      totalRequests,
      reqTrend: reqTrend.startsWith("-") || reqTrend.startsWith("+") ? reqTrend : `+${reqTrend}`,
      totalTokens,
      tokenTrend: tokenTrend.startsWith("-") || tokenTrend.startsWith("+") ? tokenTrend : `+${tokenTrend}`,
      rawAvgTokens,
      avgMillionTokens: `${avgMillionTokens}M`,
      avgTrend: avgTrend.startsWith("-") || avgTrend.startsWith("+") ? avgTrend : `+${avgTrend}`,
      errorRate,
      sparkSeries,
      modelBreakdown,
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
