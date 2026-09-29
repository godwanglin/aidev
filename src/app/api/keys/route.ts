import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { generateApiKey } from "@/lib/key-utils";
import { invalidateApiKeyCache } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 5), 50);
    const skip = (page - 1) * limit;

    const [totalCount, apiKeys, freshUser] = await Promise.all([
      prisma.apiKey.count({ where: { userId: user.id } }),
      prisma.apiKey.findMany({
        where: { userId: user.id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          prefix: true,
          isActive: true,
          rateLimit: true,
          lastUsedAt: true,
          createdAt: true,
          revokedAt: true,
          _count: {
            select: { requestLogs: true },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          subscriptionTier: true,
          subscriptionExpiresAt: true,
        },
      }),
    ]);

    const isExpired = Boolean(
      freshUser?.subscriptionTier &&
      freshUser.subscriptionTier !== "FREE" &&
      freshUser.subscriptionExpiresAt &&
      new Date(freshUser.subscriptionExpiresAt).getTime() <= Date.now()
    );

    const currentTierKey = isExpired ? "FREE" : (freshUser?.subscriptionTier || "FREE").toUpperCase();

    const tierConfig = await prisma.subscriptionTierConfig.findUnique({
      where: { id: currentTierKey },
    });

    const rpmLimit = tierConfig?.rpmLimit ?? (currentTierKey === "ULTRA" ? 120 : currentTierKey === "PRO" ? 60 : currentTierKey === "PLUS" ? 30 : 5);
    const maxKeys = tierConfig?.maxKeys ?? (currentTierKey === "ULTRA" ? -1 : currentTierKey === "PRO" ? 10 : currentTierKey === "PLUS" ? 5 : 2);
    const canCreate = maxKeys === -1 || totalCount < maxKeys;

    const totalPages = Math.ceil(totalCount / limit) || 1;

    return NextResponse.json({
      data: apiKeys,
      tier: {
        id: currentTierKey,
        name: tierConfig?.name || currentTierKey,
        rpmLimit,
        maxKeys,
        activeKeysCount: totalCount,
        canCreate,
      },
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

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
      },
    });

    const isExpired = Boolean(
      freshUser?.subscriptionTier &&
      freshUser.subscriptionTier !== "FREE" &&
      freshUser.subscriptionExpiresAt &&
      new Date(freshUser.subscriptionExpiresAt).getTime() <= Date.now()
    );

    const currentTierKey = isExpired ? "FREE" : (freshUser?.subscriptionTier || "FREE").toUpperCase();

    const tierConfig = await prisma.subscriptionTierConfig.findUnique({
      where: { id: currentTierKey },
    });

    const rpmLimit = tierConfig?.rpmLimit ?? (currentTierKey === "ULTRA" ? 120 : currentTierKey === "PRO" ? 60 : currentTierKey === "PLUS" ? 30 : 5);
    const maxKeys = tierConfig?.maxKeys ?? (currentTierKey === "ULTRA" ? -1 : currentTierKey === "PRO" ? 10 : currentTierKey === "PLUS" ? 5 : 2);

    // Enforce maximum keys limit per tier
    const currentKeysCount = await prisma.apiKey.count({
      where: { userId: user.id },
    });

    if (maxKeys !== -1 && currentKeysCount >= maxKeys) {
      return NextResponse.json(
        {
          error: `Batas kuota API Key untuk paket ${tierConfig?.name || currentTierKey} telah tercapai (${currentKeysCount}/${maxKeys} keys). Silakan upgrade paket langganan Anda untuk menambah kuota API Key.`,
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = body.name || "Default API Key";
    const rateLimit = rpmLimit; // Rate limit follows active subscription tier!

    const { rawKey, prefix, hashedKey } = generateApiKey();

    const newKey = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name,
        prefix,
        hashedKey,
        isActive: true,
        rateLimit,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        rateLimit: true,
        createdAt: true,
        _count: {
          select: { requestLogs: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: newKey.id,
        name: newKey.name,
        prefix: newKey.prefix,
        rawKey,
        rateLimit: newKey.rateLimit,
        createdAt: newKey.createdAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Key ID is required" }, { status: 400 });
    }

    const existing = await prisma.apiKey.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "API Key not found" }, { status: 404 });
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    invalidateApiKeyCache(existing.hashedKey);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
