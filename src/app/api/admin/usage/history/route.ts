import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { telemetryStore } from "@/lib/telemetry-store";

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

    // Support single log detail on-demand (keeps list lightweight and ultra-fast)
    const logId = searchParams.get("logId") || searchParams.get("id");
    if (logId) {
      const singleLog = await prisma.upstreamLog.findUnique({
        where: { id: logId },
        include: {
          connection: {
            select: { name: true, accountEmail: true },
          },
        },
      });

      if (!singleLog) {
        return NextResponse.json({ error: "Log not found" }, { status: 404 });
      }

      // Enrich single log with user details if available
      let clientUser: any = null;
      if (singleLog.clientUserId) {
        const u = await prisma.user.findUnique({
          where: { id: singleLog.clientUserId },
          select: { id: true, email: true, name: true, role: true, subscriptionTier: true },
        });
        if (u) {
          clientUser = {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            tier: u.subscriptionTier,
          };
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          log: {
            ...singleLog,
            clientUser,
          },
        },
      });
    }

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit")) || 50, 100));
    const skip = (page - 1) * limit;

    const provider = searchParams.get("provider") || "ALL";
    const connectionId = searchParams.get("connectionId") || searchParams.get("accountId");
    const model = searchParams.get("model") || "";
    const status = searchParams.get("status") || "ALL";

    const where: any = {};
    if (provider !== "ALL") {
      const p = provider.toUpperCase();
      if (p === "OPENAI_CODEX" || p === "CODEX") {
        where.provider = { in: ["OPENAI_CODEX", "CODEX", "OPENAI"] };
      } else if (p === "GEMINI" || p === "GEMINI_CLI" || p === "GOOGLE") {
        where.provider = { in: ["GEMINI", "GEMINI_CLI", "GOOGLE"] };
      } else if (p === "OLLAMA" || p === "OLLAMA_CLOUD") {
        where.provider = { in: ["OLLAMA", "OLLAMA_CLOUD"] };
      } else if (p === "ANTHROPIC" || p === "CLAUDE") {
        where.provider = { in: ["ANTHROPIC", "CLAUDE"] };
      } else {
        where.provider = p;
      }
    }
    if (connectionId && connectionId !== "ALL") {
      where.connectionId = connectionId;
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

    // CRITICAL PERFORMANCE OPTIMIZATION:
    // Exclude rawBody and rawResponse (which can be 100MB+ in total!) from the list query projection.
    // Full payload is loaded on-demand when inspecting a specific log item.
    const [logs, stats24h, totalCount] = await Promise.all([
      prisma.upstreamLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          connectionId: true,
          provider: true,
          model: true,
          clientApiKeyId: true,
          clientUserId: true,
          clientUserEmail: true,
          reasoningEffort: true,
          rawHeaders: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          tokensSavedRtk: true,
          latencyMs: true,
          statusCode: true,
          isFailover: true,
          failoverReason: true,
          createdAt: true,
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

    if (logs.length > 0) {
      // Enrich logs with clientUser, clientApiKey, and cached telemetry if present
      try {
        const userIds = [...new Set(logs.map((l: any) => l.clientUserId).filter(Boolean))] as string[];
        const keyIds = [...new Set(logs.map((l: any) => l.clientApiKeyId).filter(Boolean))] as string[];

        const [users, apiKeys] = await Promise.all([
          userIds.length > 0
            ? prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, email: true, name: true, role: true, subscriptionTier: true },
              })
            : [],
          keyIds.length > 0
            ? prisma.apiKey.findMany({
                where: { id: { in: keyIds } },
                select: { id: true, name: true, prefix: true, user: { select: { email: true, name: true } } },
              })
            : [],
        ]);

        const userMap = new Map(users.map((u) => [u.id, u]));
        const keyMap = new Map(apiKeys.map((k) => [k.id, k]));
        const { telemetryStore } = await import("@/lib/telemetry-store");

        for (const log of logs as any[]) {
          const cached = telemetryStore.get(log.id);
          const user = log.clientUserId ? userMap.get(log.clientUserId) : null;
          const key = log.clientApiKeyId ? keyMap.get(log.clientApiKeyId) : null;

          log.clientUser = {
            id: user?.id || log.clientUserId || null,
            email: user?.email || log.clientUserEmail || key?.user?.email || cached?.clientAccount?.email || "Direct API",
            name: user?.name || key?.user?.name || cached?.clientAccount?.name || null,
            role: user?.role || "USER",
            tier: user?.subscriptionTier || "FREE",
            keyPrefix: key?.prefix || null,
            keyName: key?.name || null,
          };

          if (!log.reasoningEffort && cached?.reasoningEffort) {
            log.reasoningEffort = cached.reasoningEffort;
          }
          if (!log.rawHeaders && cached?.rawHeaders) {
            log.rawHeaders = cached.rawHeaders;
          }
          // If recent item is in fast cache, attach its bounded preview
          if (cached?.rawBody) {
            log.rawBody = cached.rawBody;
          }
          if (cached?.rawResponse) {
            log.rawResponse = cached.rawResponse;
          }
        }
      } catch {}
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return NextResponse.json({
      success: true,
      data: {
        logs,
        totalCount,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
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

    let deletedCount = 0;
    if (scope === "all") {
      const count = await prisma.upstreamLog.count();
      await prisma.$executeRawUnsafe("TRUNCATE TABLE UpstreamLog;");
      deletedCount = count;
    } else {
      const deleted = await prisma.upstreamLog.deleteMany({ where });
      deletedCount = deleted.count;
    }

    try {
      telemetryStore.clear();
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Successfully cleared ${deletedCount.toLocaleString()} telemetry log(s) from database.`,
      count: deletedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
