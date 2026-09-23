import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") || "ALL";
    const model = searchParams.get("model") || "";
    const status = searchParams.get("status") || "ALL";
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    const where: any = {};
    if (provider !== "ALL") {
      where.provider = provider.toUpperCase();
    }
    if (model) {
      where.model = { contains: model };
    }
    if (status === "SUCCESS") {
      where.statusCode = { gte: 200, lt: 300 };
    } else if (status === "ERROR") {
      where.statusCode = { gte: 400 };
    } else if (status === "429") {
      where.statusCode = 429;
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [logs, stats24h, totalCount] = await Promise.all([
      prisma.upstreamLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          connection: {
            select: { name: true, accountEmail: true },
          },
        },
      }),
      prisma.upstreamLog.aggregate({
        where: { createdAt: { gte: twentyFourHoursAgo } },
        _count: true,
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
        },
        _avg: {
          latencyMs: true,
        },
      }),
      prisma.upstreamLog.count({ where }),
    ]);

    const success24h = await prisma.upstreamLog.count({
      where: {
        createdAt: { gte: twentyFourHoursAgo },
        statusCode: { gte: 200, lt: 300 },
      },
    });

    const successRate = stats24h._count > 0 ? (success24h / stats24h._count) * 100 : 100;

    // Ensure tokensSavedRtk is properly populated even if in-memory Prisma client omitted it
    if (logs.length > 0) {
      const needsRtk = logs.some((l: any) => l.tokensSavedRtk === undefined);
      if (needsRtk) {
        try {
          const ids = logs.map((l: any) => `'${l.id}'`).join(",");
          const rawSavings: any[] = await prisma.$queryRawUnsafe(
            `SELECT id, tokensSavedRtk FROM UpstreamLog WHERE id IN (${ids})`
          );
          const map = new Map(rawSavings.map((r: any) => [r.id, Number(r.tokensSavedRtk) || 0]));
          for (const log of logs as any[]) {
            log.tokensSavedRtk = map.get(log.id) || 0;
          }
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        logs,
        totalCount,
        stats: {
          totalRequests24h: stats24h._count,
          totalPromptTokens24h: stats24h._sum.promptTokens || 0,
          totalCompletionTokens24h: stats24h._sum.completionTokens || 0,
          totalTokens24h: stats24h._sum.totalTokens || 0,
          avgLatencyMs: Math.round(stats24h._avg.latencyMs || 0),
          successRate: Number(successRate.toFixed(1)),
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "all";

    let where: any = {};
    const now = new Date();
    if (scope === "older_than_24h") {
      where = { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } };
    } else if (scope === "older_than_7d") {
      where = { createdAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
    }

    const deleted = await prisma.upstreamLog.deleteMany({ where });

    return NextResponse.json({
      success: true,
      message: `Successfully cleared ${deleted.count.toLocaleString()} telemetry log(s) from database.`,
      count: deleted.count,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
