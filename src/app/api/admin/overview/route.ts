import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Fetch provider connections summary
    const connections = await prisma.providerConnection.findMany({
      select: {
        id: true,
        provider: true,
        isActive: true,
        syncStatus: true,
        cooldownUntil: true,
      },
    });

    const byProviderMap = new Map<string, { count: number; healthy: number }>();
    let healthy = 0;
    let rateLimited = 0;
    let exhausted = 0;

    for (const conn of connections) {
      const entry = byProviderMap.get(conn.provider) || { count: 0, healthy: 0 };
      entry.count++;

      const isCoolingDown = conn.cooldownUntil && new Date(conn.cooldownUntil) > now;
      const isHealthy = conn.isActive && conn.syncStatus === "NORMAL" && !isCoolingDown;

      if (isHealthy) {
        entry.healthy++;
        healthy++;
      } else if (isCoolingDown || conn.syncStatus === "LOW_QUOTA") {
        rateLimited++;
      } else if (conn.syncStatus === "EXHAUSTED") {
        exhausted++;
      }

      byProviderMap.set(conn.provider, entry);
    }

    const byProvider = Array.from(byProviderMap.entries()).map(([provider, stats]) => ({
      provider,
      ...stats,
    }));

    // Fetch upstream logs for last 24h
    const [upstreamStats, recentEvents] = await Promise.all([
      prisma.upstreamLog.aggregate({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        _count: true,
        _sum: {
          promptTokens: true,
          completionTokens: true,
        },
      }),
      prisma.upstreamLog.findMany({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          provider: true,
          model: true,
          statusCode: true,
          isFailover: true,
          latencyMs: true,
          createdAt: true,
        },
      }),
    ]);

    // Calculate health score (% of 200 responses)
    let healthScore = 100;
    if (upstreamStats._count > 0) {
      const successCount = await prisma.upstreamLog.count({
        where: {
          createdAt: { gte: twentyFourHoursAgo },
          statusCode: { gte: 200, lt: 300 },
        },
      });
      healthScore = (successCount / upstreamStats._count) * 100;
    }

    // Fetch ticket counts
    const [openTickets, inProgressTickets, totalTickets] = await Promise.all([
      prisma.supportTicket.count({ where: { status: "OPEN" } }),
      prisma.supportTicket.count({ where: { status: "IN_PROGRESS" } }),
      prisma.supportTicket.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        providers: {
          total: connections.length,
          healthy,
          rateLimited,
          exhausted,
          byProvider,
        },
        upstream: {
          totalRequests24h: upstreamStats._count,
          totalTokensIn24h: upstreamStats._sum.promptTokens || 0,
          totalTokensOut24h: upstreamStats._sum.completionTokens || 0,
          healthScore,
          recentEvents,
        },
        tickets: {
          open: openTickets,
          inProgress: inProgressTickets,
          total: totalTickets,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
