import { prisma } from "./prisma";

export interface UserDiscountResult {
  discountPct: number;
  reason: string | null;
}

let cachedConfig: any = null;
let configExpiresAt = 0;

export function invalidateConfigCache() {
  cachedConfig = null;
  configExpiresAt = 0;
}

async function getGlobalConfig() {
  const now = Date.now();
  if (cachedConfig && configExpiresAt > now) {
    return cachedConfig;
  }
  cachedConfig = await prisma.systemSetting.upsert({
    where: { id: "global_config" },
    update: {},
    create: { id: "global_config" },
  });
  configExpiresAt = now + 10000;
  return cachedConfig;
}

export async function calculateUserDiscount(userId: string): Promise<UserDiscountResult> {
  const config = await getGlobalConfig();

  const [loyaltyActive, topupCount] = await Promise.all([
    prisma.loyaltyDiscount.findFirst({
      where: {
        userId,
        expiresAt: { gte: new Date() },
      },
      orderBy: { discountPct: "desc" },
    }),
    prisma.tokenTopup.count({ where: { userId } }),
  ]);

  const now = new Date();

  if (config.promoDiscountActive && config.promoExpiresAt && config.promoExpiresAt > now) {
    const promoStart = config.promoStartedAt || config.updatedAt;
    const usedPromoCount = await prisma.order.count({
      where: {
        userId,
        status: "PAID",
        discountPct: { gt: 0 },
        discountReason: { contains: "Flash Sale" },
        paidAt: { gte: promoStart },
      },
    });

    if (usedPromoCount === 0) {
      return {
        discountPct: config.promoDiscountPct,
        reason: `Special Flash Sale (${config.promoDiscountPct}% OFF - 1x Use per Period)`,
      };
    }
  }

  if (config.firstTopupDiscountActive && topupCount === 0) {
    return {
      discountPct: config.firstTopupDiscountPct,
      reason: `First-Time Buyer Promo (${config.firstTopupDiscountPct}% OFF)`,
    };
  }

  if (loyaltyActive) {
    return {
      discountPct: loyaltyActive.discountPct,
      reason: `${loyaltyActive.reason} (${loyaltyActive.discountPct}% OFF)`,
    };
  }

  if (config.highUsageDiscountActive) {
    const tokenAgg = await prisma.requestLog.aggregate({
      where: { apiKey: { userId } },
      _sum: { totalTokens: true },
    });
    const consumed = tokenAgg._sum.totalTokens || 0;

    if (consumed >= config.highUsageThresholdTokens) {
      const expiresAt = new Date(now.getTime() + config.highUsageDays * 24 * 60 * 60 * 1000);
      await prisma.loyaltyDiscount.create({
        data: {
          userId,
          discountPct: config.highUsageDiscountPct,
          expiresAt,
          reason: "VIP High-Usage Reward",
        },
      });

      return {
        discountPct: config.highUsageDiscountPct,
        reason: `VIP High-Usage Reward (${config.highUsageDiscountPct}% OFF for ${config.highUsageDays} Days)`,
      };
    }
  }

  return {
    discountPct: 0,
    reason: null,
  };
}
