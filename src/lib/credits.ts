import { prisma } from "./prisma";
import { sendLowBalanceAlert } from "./discord";

interface CachedPricing {
  rateInPer1k: number;
  rateOutPer1k: number;
  cachedAt: number;
}

interface CachedTier {
  id: string;
  allowedModelIds: string[];
  rpmLimit: number;
  maxKeys: number;
  cachedAt: number;
}

const pricingCache = new Map<string, CachedPricing>();
const tierCache = new Map<string, CachedTier>();
const alertThrottle = new Set<string>(); // Throttles low balance alerts to 1 per hour per user
const CACHE_TTL = 15000; // 15 seconds

export function clearPricingCache() {
  pricingCache.clear();
}

/**
 * Gets credit pricing rates for a given model
 */
export async function getModelCreditRates(modelId: string): Promise<{ rateInPer1k: number; rateOutPer1k: number }> {
  const normModel = (modelId || "").toLowerCase().trim();
  const cached = pricingCache.get(normModel);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { rateInPer1k: cached.rateInPer1k, rateOutPer1k: cached.rateOutPer1k };
  }

  try {
    // 1. Check ComboModel directly first
    const combo = await prisma.comboModel.findFirst({
      where: {
        OR: [
          { comboId: normModel },
          { comboId: { contains: normModel } },
        ],
      },
      select: { rateInPer1k: true, rateOutPer1k: true },
    });

    if (combo) {
      const res = { rateInPer1k: combo.rateInPer1k, rateOutPer1k: combo.rateOutPer1k };
      pricingCache.set(normModel, { ...res, cachedAt: Date.now() });
      return res;
    }

    // 2. Fallback to ModelPricing table
    const pricing = await prisma.modelPricing.findFirst({
      where: {
        OR: [
          { modelId: normModel },
          { modelId: { contains: normModel } },
        ],
      },
    });

    if (pricing) {
      const res = { rateInPer1k: pricing.rateInPer1k, rateOutPer1k: pricing.rateOutPer1k };
      pricingCache.set(normModel, { ...res, cachedAt: Date.now() });
      return res;
    }
  } catch {}

  // Fallback defaults based on model family
  let rateInPer1k = 25;
  let rateOutPer1k = 100;

  if (normModel.includes("claude-3-5-sonnet") || normModel.includes("claude-3.5-sonnet") || normModel.includes("opus")) {
    rateInPer1k = 500;
    rateOutPer1k = 2500;
  } else if (normModel.includes("gpt-4o") && !normModel.includes("mini")) {
    rateInPer1k = 400;
    rateOutPer1k = 1600;
  } else if (normModel.includes("gpt-4o-mini") || normModel.includes("haiku")) {
    rateInPer1k = 30;
    rateOutPer1k = 120;
  } else if (normModel.includes("deepseek")) {
    rateInPer1k = 45;
    rateOutPer1k = 180;
  } else if (normModel.includes("gemini-2.5-pro") || normModel.includes("gemini-3.1-pro")) {
    rateInPer1k = 50;
    rateOutPer1k = 200;
  }

  pricingCache.set(normModel, { rateInPer1k, rateOutPer1k, cachedAt: Date.now() });
  return { rateInPer1k, rateOutPer1k };
}

/**
 * Calculates total credits cost for a request
 */
export async function calculateCreditsCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): Promise<number> {
  const { rateInPer1k, rateOutPer1k } = await getModelCreditRates(modelId);
  const inCost = (promptTokens / 1000) * rateInPer1k;
  const outCost = (completionTokens / 1000) * rateOutPer1k;
  const total = Math.max(1, Math.ceil(inCost + outCost));
  return total;
}

/**
 * Checks if user's subscription tier allows accessing the requested model
 */
export async function checkTierModelAccess(
  userTier: string,
  modelId: string
): Promise<{ allowed: boolean; requiredTier?: string; reason?: string }> {
  const tierKey = (userTier || "FREE").toUpperCase();
  const targetModel = (modelId || "").toLowerCase().trim();

  // Ultra tier has unconditional wildcard access
  if (tierKey === "ULTRA") {
    return { allowed: true };
  }

  // Fetch all tier configs
  let allTiers = await prisma.subscriptionTierConfig.findMany({
    orderBy: { priceIdr: "asc" },
  });

  if (!allTiers || allTiers.length === 0) {
    return { allowed: true }; // Fallback allow if uninitialized
  }

  const userTierConfig = allTiers.find((t) => t.id === tierKey);
  if (!userTierConfig) {
    return { allowed: true };
  }

  let allowedList: string[] = [];
  try {
    allowedList = JSON.parse(userTierConfig.allowedModelIds || "[]").map((m: string) => m.toLowerCase());
  } catch {
    allowedList = [];
  }

  if (allowedList.includes("*")) {
    return { allowed: true };
  }

  const isModelMatch = allowedList.some((allowed) => {
    return targetModel === allowed || targetModel.includes(allowed) || allowed.includes(targetModel);
  });

  if (isModelMatch) {
    return { allowed: true };
  }

  // Model not allowed in current tier. Find which tier unlocks it.
  const unlockingTier = allTiers.find((t) => {
    try {
      const list = JSON.parse(t.allowedModelIds || "[]").map((m: string) => m.toLowerCase());
      return list.includes("*") || list.some((allowed: string) => targetModel.includes(allowed) || allowed.includes(targetModel));
    } catch {
      return false;
    }
  });

  const reqTier = unlockingTier ? unlockingTier.name : "PRO atau ULTRA";
  return {
    allowed: false,
    requiredTier: unlockingTier?.id || "PRO",
    reason: `Model '${modelId}' memerlukan paket langganan ${reqTier}. Silakan upgrade paket Anda di http://localhost:3000/billing`,
  };
}

/**
 * Deducts credits from user balance in real-time
 */
export async function deductUserCredits(userId: string, credits: number) {
  if (!userId || credits <= 0) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        creditBalance: true,
        monthlyCreditsAllocated: true,
        monthlyCreditsRemaining: true,
        subscriptionTier: true,
      },
    });

    if (!user) return;

    const remainingMonthly = Number(user.monthlyCreditsRemaining);
    const monthlyDecrement = Math.min(remainingMonthly, credits);
    const currentCreditBal = user.creditBalance;
    const newCreditBal = currentCreditBal > BigInt(credits) ? currentCreditBal - BigInt(credits) : BigInt(0);
    const newMonthlyRemaining = BigInt(remainingMonthly) > BigInt(monthlyDecrement) ? BigInt(remainingMonthly) - BigInt(monthlyDecrement) : BigInt(0);

    console.log(`[DEBUG deductUserCredits] userId=${userId} currentCreditBal=${currentCreditBal} credits=${credits} newCreditBal=${newCreditBal}`);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        creditBalance: newCreditBal,
        monthlyCreditsRemaining: newMonthlyRemaining,
      },
      select: {
        id: true,
        email: true,
        creditBalance: true,
        monthlyCreditsAllocated: true,
        subscriptionTier: true,
      },
    });

    // Check for Low Balance (<10%) alert
    const newBal = Number(updated.creditBalance);
    const allocated = Number(updated.monthlyCreditsAllocated) || 20000;
    if (newBal > 0 && newBal < allocated * 0.1) {
      const throttleKey = `low-bal-${user.id}`;
      if (!alertThrottle.has(throttleKey)) {
        alertThrottle.add(throttleKey);
        setTimeout(() => alertThrottle.delete(throttleKey), 3600000); // 1 hour cooldown

        sendLowBalanceAlert({
          userEmail: updated.email,
          remainingCredits: newBal,
          tier: updated.subscriptionTier,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[Credits Deduction Error]", err);
  }
}

/**
 * Refunds credits back to user balance in real-time (e.g. upon upstream error, empty response, or failed turn)
 */
export async function refundUserCredits(userId: string, credits: number) {
  if (!userId || credits <= 0) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        creditBalance: true,
        monthlyCreditsRemaining: true,
      },
    });

    if (!user) return;

    const currentCreditBal = user.creditBalance;
    const newCreditBal = currentCreditBal + BigInt(credits);
    const newMonthlyRemaining = user.monthlyCreditsRemaining + BigInt(credits);

    console.log(`[REFUND refundUserCredits] userId=${userId} refunded=${credits} newCreditBal=${newCreditBal}`);

    await prisma.user.update({
      where: { id: userId },
      data: {
        creditBalance: newCreditBal,
        monthlyCreditsRemaining: newMonthlyRemaining,
      },
    });
  } catch (err) {
    console.error("[REFUND ERROR] Failed to refund user credits:", err);
  }
}

