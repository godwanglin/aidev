import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight /v1/usage handler.
 * Returns current user tier, credit balance, quota, and percentage of credit used.
 */
export async function handleUsage(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateApiKey(req.headers.get("authorization"), req.headers.get("x-api-key"));
  if (!auth.success || !auth.apiKey) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  const apiKey = auth.apiKey as any;
  const user = apiKey.user;
  if (!user) {
    return NextResponse.json({ error: "User associated with API key not found" }, { status: 404 });
  }

  const userTier = (user.subscriptionTier || "FREE").toUpperCase();
  const tierConfig = await prisma.subscriptionTierConfig.findUnique({
    where: { id: userTier },
  });

  const tierName = tierConfig?.name || userTier;
  const badgeColor = userTier === "PLUS" ? "gray" : (tierConfig?.badgeColor || (userTier === "ULTRA" ? "amber" : userTier === "PRO" ? "purple" : "gray"));

  const balance = Number(user.creditBalance ?? 0);
  const purchased = Number(user.purchasedCredits ?? 0);

  // Total monthly allocated credits: from user record or tier config
  const tierMonthlyCredits = Number(tierConfig?.monthlyCredits ?? 20000);
  const userAllocated = Number(user.monthlyCreditsAllocated ?? 0);
  const allocated = userAllocated > 0 ? userAllocated : tierMonthlyCredits;

  const userRemaining = Number(user.monthlyCreditsRemaining ?? 0);
  const remaining = userAllocated > 0 ? userRemaining : Math.min(balance, allocated);
  const used = Math.max(0, allocated - remaining);

  const percentageUsed = allocated > 0 ? Number(Math.min(100, Math.max(0, (used / allocated) * 100)).toFixed(1)) : 0;

  // Requests count today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  let requestsToday = 0;
  try {
    requestsToday = await prisma.requestLog.count({
      where: {
        apiKeyId: apiKey.id,
        createdAt: { gte: startOfDay },
      },
    });
  } catch {
    // Non-blocking
  }

  return NextResponse.json({
    tier: {
      id: userTier,
      name: tierName,
      badgeColor,
      expiresAt: user.subscriptionExpiresAt || null,
    },
    credits: {
      balance,
      allocated,
      remaining,
      used,
      purchased,
      percentageUsed,
    },
    requestsToday,
    user: {
      id: user.id,
      name: user.name || "User",
      email: user.email || "",
      role: user.role || "USER",
    },
  });
}
