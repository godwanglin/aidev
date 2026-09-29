import { prisma } from "./prisma";
import { sendLowBalanceAlert } from "./discord";

interface CachedPricing {
  rateInUsdPer1m: number;
  rateOutUsdPer1m: number;
  rateInUsdPer1k: number;
  rateOutUsdPer1k: number;
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
export async function getModelUsdRates(modelId: string): Promise<{
  rateInUsdPer1m: number;
  rateOutUsdPer1m: number;
  rateInUsdPer1k: number;
  rateOutUsdPer1k: number;
}> {
  const normModel = (modelId || "").toLowerCase().trim();
  const cached = pricingCache.get(normModel);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return {
      rateInUsdPer1m: cached.rateInUsdPer1m,
      rateOutUsdPer1m: cached.rateOutUsdPer1m,
      rateInUsdPer1k: cached.rateInUsdPer1k,
      rateOutUsdPer1k: cached.rateOutUsdPer1k,
    };
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
      select: { rateInUsdPer1m: true, rateOutUsdPer1m: true, rateInUsdPer1k: true, rateOutUsdPer1k: true },
    });

    if (combo) {
      const in1m = combo.rateInUsdPer1m ? Number(combo.rateInUsdPer1m) : Number(combo.rateInUsdPer1k) * 1000;
      const out1m = combo.rateOutUsdPer1m ? Number(combo.rateOutUsdPer1m) : Number(combo.rateOutUsdPer1k) * 1000;
      const res = {
        rateInUsdPer1m: in1m,
        rateOutUsdPer1m: out1m,
        rateInUsdPer1k: in1m / 1000,
        rateOutUsdPer1k: out1m / 1000,
      };
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
      select: { rateInUsdPer1m: true, rateOutUsdPer1m: true, rateInUsdPer1k: true, rateOutUsdPer1k: true },
    });

    if (pricing) {
      const in1m = pricing.rateInUsdPer1m ? Number(pricing.rateInUsdPer1m) : Number(pricing.rateInUsdPer1k) * 1000;
      const out1m = pricing.rateOutUsdPer1m ? Number(pricing.rateOutUsdPer1m) : Number(pricing.rateOutUsdPer1k) * 1000;
      const res = {
        rateInUsdPer1m: in1m,
        rateOutUsdPer1m: out1m,
        rateInUsdPer1k: in1m / 1000,
        rateOutUsdPer1k: out1m / 1000,
      };
      pricingCache.set(normModel, { ...res, cachedAt: Date.now() });
      return res;
    }
  } catch {}

  // Fallback defaults based on model family (per 1M tokens)
  let rateInUsdPer1m = 0.15;
  let rateOutUsdPer1m = 0.60;

  if (normModel.includes("claude-3-5-sonnet") || normModel.includes("claude-3.5-sonnet") || normModel.includes("opus")) {
    rateInUsdPer1m = 3.00;
    rateOutUsdPer1m = 15.00;
  } else if (normModel.includes("gpt-4o") && !normModel.includes("mini")) {
    rateInUsdPer1m = 2.50;
    rateOutUsdPer1m = 10.00;
  } else if (normModel.includes("gpt-4o-mini") || normModel.includes("haiku")) {
    rateInUsdPer1m = 0.15;
    rateOutUsdPer1m = 0.60;
  } else if (normModel.includes("deepseek")) {
    rateInUsdPer1m = 0.27;
    rateOutUsdPer1m = 1.10;
  } else if (normModel.includes("gemini-2.5-pro") || normModel.includes("gemini-3.1-pro")) {
    rateInUsdPer1m = 1.25;
    rateOutUsdPer1m = 5.00;
  }

  const res = {
    rateInUsdPer1m,
    rateOutUsdPer1m,
    rateInUsdPer1k: rateInUsdPer1m / 1000,
    rateOutUsdPer1k: rateOutUsdPer1m / 1000,
  };
  pricingCache.set(normModel, { ...res, cachedAt: Date.now() });
  return res;
}

/**
 * Calculates total balance cost for a request
 */
export async function calculateUsdCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): Promise<number> {
  const rates = await getModelUsdRates(modelId);
  const inCost = (promptTokens / 1_000_000) * (rates.rateInUsdPer1m ?? (rates.rateInUsdPer1k * 1000));
  const outCost = (completionTokens / 1_000_000) * (rates.rateOutUsdPer1m ?? (rates.rateOutUsdPer1k * 1000));
  const total = Math.max(0.00000001, Number((inCost + outCost).toFixed(8)));
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

  function cleanModel(m: string): string {
    const s = (m || "").toLowerCase().trim();
    return s.includes("/") ? s.split("/").slice(1).join("/") : s;
  }

  function matchesExactModel(allowed: string, target: string): boolean {
    if (allowed === "*") return true;
    const a = allowed.toLowerCase().trim();
    const t = target.toLowerCase().trim();
    if (a === t) return true;
    return cleanModel(a) === cleanModel(t);
  }

  const isModelMatch = allowedList.some((allowed) => matchesExactModel(allowed, targetModel));

  if (isModelMatch) {
    return { allowed: true };
  }

  // Model not allowed in current tier. Find which tier unlocks it.
  const unlockingTier = allTiers.find((t) => {
    try {
      const list = JSON.parse(t.allowedModelIds || "[]").map((m: string) => m.toLowerCase());
      return list.includes("*") || list.some((allowed: string) => matchesExactModel(allowed, targetModel));
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
export async function deductUserBalance(userId: string, amountUsd: number) {
  if (!userId || amountUsd <= 0) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        balanceUsd: true,
        monthlyBalanceAllocatedUsd: true,
        monthlyBalanceRemainingUsd: true,
        subscriptionTier: true,
      },
    });

    if (!user) return;

    const remainingMonthly = Number(user.monthlyBalanceRemainingUsd);
    const monthlyDecrement = Math.min(remainingMonthly, amountUsd);
    const currentBalance = user.balanceUsd;
    const newBalance = Math.max(0, Number(currentBalance) - amountUsd);
    const newMonthlyRemaining = Math.max(0, remainingMonthly - monthlyDecrement);

    console.log(`[DEBUG deductUserBalance] userId=${userId} currentBalance=${currentBalance} amountUsd=${amountUsd} newBalance=${newBalance}`);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        balanceUsd: newBalance,
        monthlyBalanceRemainingUsd: newMonthlyRemaining,
      },
      select: {
        id: true,
        email: true,
        balanceUsd: true,
        monthlyBalanceAllocatedUsd: true,
        subscriptionTier: true,
      },
    });

    // Check for Low Balance (<10%) alert
    const newBal = Number(updated.balanceUsd);
    const allocated = Number(updated.monthlyBalanceAllocatedUsd) || 0;
    if (newBal > 0 && newBal < allocated * 0.1) {
      const throttleKey = `low-bal-${user.id}`;
      if (!alertThrottle.has(throttleKey)) {
        alertThrottle.add(throttleKey);
        setTimeout(() => alertThrottle.delete(throttleKey), 3600000); // 1 hour cooldown

        sendLowBalanceAlert({
          userEmail: updated.email,
          remainingUsd: newBal,
          tier: updated.subscriptionTier,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[USD Deduction Error]", err);
  }
}

/**
 * Refunds credits back to user balance in real-time (e.g. upon upstream error, empty response, or failed turn)
 */
export async function refundUserBalance(userId: string, amountUsd: number) {
  if (!userId || amountUsd <= 0) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        balanceUsd: true,
        monthlyBalanceRemainingUsd: true,
      },
    });

    if (!user) return;

    const currentBalance = user.balanceUsd;
    const newBalance = Number(currentBalance) + amountUsd;
    const newMonthlyRemaining = Number(user.monthlyBalanceRemainingUsd) + amountUsd;

    console.log(`[REFUND refundUserBalance] userId=${userId} refunded=${amountUsd} newBalance=${newBalance}`);

    await prisma.user.update({
      where: { id: userId },
      data: {
        balanceUsd: newBalance,
        monthlyBalanceRemainingUsd: newMonthlyRemaining,
      },
    });
  } catch (err) {
    console.error("[REFUND ERROR] Failed to refund USD balance:", err);
  }
}

