import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({
        data: [],
        pagination: {
          page: 1,
          limit: 15,
          totalCount: 0,
          totalPages: 1,
          hasPrevPage: false,
          hasNextPage: false,
        },
      });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 15, 5), 100);
    const skip = (page - 1) * limit;

    const filter = searchParams.get("filter") || "";
    const status = searchParams.get("status") || "all";
    const model = searchParams.get("model") || "all";
    const method = searchParams.get("method") || "all";
    const range = searchParams.get("range") || "all";
    const minLatency = Number(searchParams.get("minLatency")) || 0;

    // STRICT USER FILTERING (ZERO DATA LEAKAGE)
    const whereClause: any = {
      apiKey: { userId: sessionUser.id },
    };

    // 1. Status Filter
    if (status === "200") {
      whereClause.statusCode = { gte: 200, lt: 300 };
    } else if (status === "errors") {
      whereClause.statusCode = { gte: 400 };
    } else if (status === "400") {
      whereClause.statusCode = 400;
    } else if (status === "401") {
      whereClause.statusCode = 401;
    } else if (status === "429") {
      whereClause.statusCode = 429;
    } else if (status === "500") {
      whereClause.statusCode = { gte: 500 };
    }

    // 2. Model Filter
    if (model !== "all" && model) {
      whereClause.model = model;
    }

    // 3. HTTP Method
    if (method !== "all" && method) {
      whereClause.method = method;
    }

    // 4. Time Range Filter
    if (range !== "all") {
      const now = new Date();
      let startTime = new Date();
      if (range === "24h") {
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (range === "7d") {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (range === "30d") {
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      whereClause.createdAt = { gte: startTime };
    }

    // 5. Min Latency
    if (minLatency > 0) {
      whereClause.durationMs = { gte: minLatency };
    }

    // 6. Text Search
    if (filter) {
      whereClause.OR = [
        { path: { contains: filter } },
        { model: { contains: filter } },
        { apiKey: { prefix: { contains: filter } } },
        { apiKey: { name: { contains: filter } } },
      ];
    }

    const [totalCount, logs] = await Promise.all([
      prisma.requestLog.count({ where: whereClause }),
      prisma.requestLog.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          apiKey: {
            select: { name: true, prefix: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return NextResponse.json({
      data: logs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
