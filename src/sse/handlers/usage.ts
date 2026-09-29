import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight /v1/usage handler.
 * Returns current user tier, USD balance, quota, and percentage of balance used.
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

  const balance = Number(user.balanceUsd ?? 0);
  const purchased = Number(user.purchasedBalanceUsd ?? 0);

  // Total monthly allocated USD: from user record or tier config
  const tierMonthlyBalanceUsd = Number(tierConfig?.monthlyBalanceUsd ?? 0);
  const userAllocated = Number(user.monthlyBalanceAllocatedUsd ?? 0);
  const allocated = userAllocated > 0 ? userAllocated : tierMonthlyBalanceUsd;

  const userRemaining = Number(user.monthlyBalanceRemainingUsd ?? 0);
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

  const balanceVal = Number(balance.toFixed(2));
  const allocatedVal = Number(allocated.toFixed(2));
  const remainingVal = Number(remaining.toFixed(2));
  const usedVal = Number(used.toFixed(2));
  const purchasedVal = Number(purchased.toFixed(2));

  return NextResponse.json({
    tier: {
      id: userTier,
      name: tierName,
      badgeColor,
      expiresAt: user.subscriptionExpiresAt || null,
    },
    balance: {
      balance: balanceVal,
      allocated: allocatedVal,
      remaining: remainingVal,
      used: usedVal,
      purchased: purchasedVal,
      percentageUsed,
    },
    // Backward compatibility alias for coding agents expecting "credits"
    credits: {
      balance: balanceVal,
      allocated: allocatedVal,
      remaining: remainingVal,
      used: usedVal,
      purchased: purchasedVal,
      percentageUsed,
    },
    // Top-level aliases common in various client tools
    total_available: balanceVal,
    total_granted: allocatedVal,
    total_used: usedVal,
    requestsToday,
    user: {
      id: user.id,
      name: user.name || "User",
      email: user.email || "",
      role: user.role || "USER",
    },
  });
}
