import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function matchesModel(allowedPattern: string, comboId: string, underlyingModelId: string): boolean {
  const p = allowedPattern.toLowerCase().trim();
  if (p === "*") return true;

  const cId = comboId.toLowerCase().trim();
  const uId = underlyingModelId.toLowerCase().trim();

  // Strip provider prefix if any, e.g. "ag/gemini-3.8-flash-high" -> "gemini-3.8-flash-high"
  const pStrip = p.includes("/") ? p.split("/").slice(1).join("/") : p;
  const uStrip = uId.includes("/") ? uId.split("/").slice(1).join("/") : uId;

  if (p === cId || p === uId || pStrip === cId || pStrip === uStrip) return true;
  if (cId === pStrip || uStrip === pStrip) return true;

  // Substring matching as in checkTierModelAccess in credits.ts
  if (cId.includes(p) || p.includes(cId) || (uId && (uId.includes(p) || p.includes(uId)))) {
    return true;
  }

  return false;
}

/**
 * Handler for GET and POST /v1/eligibility
 * Checks user subscription tier & model eligibility via API key.
 */
export async function handleEligibility(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateApiKey(req.headers.get("authorization"), req.headers.get("x-api-key"));
  if (!auth.success || !auth.apiKey) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
  }

  const user = (auth.apiKey as any).user;
  const userRole = user?.role || "USER";
  const isAdmin = userRole === "ADMIN";
  const userTier = (user?.subscriptionTier || "FREE").toUpperCase();
  const creditBalance = Number(user?.creditBalance ?? 0);

  // Fetch all active subscription tiers ordered by ascending price
  const tierConfigs = await prisma.subscriptionTierConfig.findMany({
    where: { isActive: true },
    orderBy: { priceIdr: "asc" },
  });

  const currentTierConfig = tierConfigs.find((t) => t.id === userTier) || {
    id: userTier,
    name: userTier,
    priceIdr: 0,
    monthlyCredits: BigInt(0),
    rpmLimit: 15,
    maxKeys: 2,
    routingPriority: "REGULAR",
    bonusPercentage: 0,
    allowedModelIds: "[]",
    badgeColor: "gray",
    description: null,
    isActive: true,
    updatedAt: new Date(),
  };

  let userAllowedList: string[] = [];
  if (userTier === "ULTRA" || isAdmin) {
    userAllowedList = ["*"];
  } else {
    try {
      userAllowedList = JSON.parse(currentTierConfig.allowedModelIds || "[]");
    } catch {
      userAllowedList = [];
    }
  }

  const isWildcardUser = isAdmin || userAllowedList.includes("*");

  // Fetch all active public combo models
  const dbCombos = await prisma.comboModel.findMany({
    where: { isActive: true, isPublic: true },
    include: {
      items: {
        where: { isActive: true },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const models: Array<{
    id: string;
    name: string;
    display_name: string;
    owned_by: string;
    eligible: boolean;
    minTier: string;
    minTierName: string;
    minTierBadgeColor: string;
    reason?: string;
  }> = [];

  const seenIds = new Set<string>();

  for (const c of dbCombos) {
    if (seenIds.has(c.comboId)) continue;
    seenIds.add(c.comboId);

    const firstItem = c.items[0]?.modelId || "";
    const firstItemLower = firstItem.toLowerCase();

    const ownedBy = firstItemLower.startsWith("cx/") || c.comboId.includes("gpt")
      ? "openai"
      : firstItemLower.startsWith("cc/") || c.comboId.includes("claude")
      ? "anthropic"
      : firstItemLower.startsWith("ag/") || c.comboId.includes("gemini")
      ? "google"
      : firstItemLower.startsWith("deepseek/") || c.comboId.includes("deepseek")
      ? "deepseek"
      : firstItemLower.startsWith("or/") || c.comboId.includes("openrouter")
      ? "openrouter"
      : "system";

    // 1. Determine minTier (the lowest tier that unlocks this model)
    let unlockingTier = tierConfigs.find((t) => {
      try {
        const list: string[] = JSON.parse(t.allowedModelIds || "[]");
        return list.some((pattern) => matchesModel(pattern, c.comboId, firstItem));
      } catch {
        return false;
      }
    });

    if (!unlockingTier) {
      unlockingTier = tierConfigs.find((t) => t.id === "ULTRA") || {
        id: "ULTRA",
        name: "Ultra Power / Team",
        priceIdr: 249000,
        badgeColor: "amber",
      } as any;
    }

    const minTierId = unlockingTier ? unlockingTier.id : "ULTRA";
    const minTierName =
      minTierId === "FREE"
        ? "Free"
        : minTierId === "PLUS"
        ? "Plus"
        : minTierId === "PRO"
        ? "Pro"
        : "Ultra";

    // 2. Determine eligibility for current user
    let isEligible = false;
    if (isWildcardUser) {
      isEligible = true;
    } else {
      isEligible = userAllowedList.some((pattern) => matchesModel(pattern, c.comboId, firstItem));
    }

    const reason = isEligible
      ? undefined
      : `Model '${c.name || c.comboId}' memerlukan paket langganan ${unlockingTier?.name || "Ultra"}. Silakan upgrade paket Anda di http://localhost:3000/billing`;

    models.push({
      id: c.comboId,
      name: c.name,
      display_name: c.name,
      owned_by: ownedBy,
      eligible: isEligible,
      minTier: minTierId,
      minTierName,
      minTierBadgeColor: unlockingTier?.badgeColor || "gray",
      reason,
    });
  }

  return NextResponse.json({
    user: {
      id: user?.id,
      name: user?.name || "User",
      email: user?.email,
      role: userRole,
      subscriptionTier: userTier,
      creditBalance,
    },
    tier: {
      id: currentTierConfig.id,
      name: currentTierConfig.name,
      badgeColor: currentTierConfig.badgeColor,
    },
    models,
  });
}
