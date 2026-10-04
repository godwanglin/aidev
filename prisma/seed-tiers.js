const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * OFFICIAL USD BILLING SEED
 *
 * All balances and rates below are stored in USD.
 * IDR only appears in `priceIdr` (what the customer pays locally).
 *
 * IDR_PER_USD is the operator-controlled rate used for the local-currency
 * reference only. Change it here or via the IDR_PER_USD env var.
 */
const IDR_PER_USD = Number(process.env.IDR_PER_USD || 16000);

function idrToUsd(idr) {
  return Number((idr / IDR_PER_USD).toFixed(8));
}

function usd(value) {
  return Number(Number(value).toFixed(8));
}

async function seed() {
  console.log(`Seeding subscription tiers (1 USD = Rp ${IDR_PER_USD.toLocaleString("id-ID")})...`);

  const tiers = [
    {
      id: "FREE",
      name: "Free Tier",
      priceIdr: 0,
      monthlyBalanceUsd: usd(1.0),
      rpmLimit: 15,
      maxKeys: 2,
      routingPriority: "REGULAR",
      bonusPercentage: 0,
      badgeColor: "gray",
      description: "Paket awal gratis untuk mencoba coding dan eksplorasi ringan.",
      features: JSON.stringify([
        "Saldo awal $1.00 USD gratis",
        "Batas 15 Request Per Menit (RPM)",
        "Maksimal 2 API Keys",
        "Jalur Regular Routing",
        "Akses model standar & opensource",
        "Community & standard support",
      ]),
      allowedModelIds: JSON.stringify([
        "deepseek-v4-pro",
        "ag/gemini-2.5-flash",
        "gem/gemini-2.5-flash",
        "gem/gemini-2.5-flash-lite",
        "combo/free-coding",
        "openrouter/free",
        "deepseek/deepseek-chat",
        "poolside/laguna-s-2.1:free",
        "cohere/north-mini-code:free",
      ]),
    },
    {
      id: "PLUS",
      name: "Plus Developer",
      priceIdr: 49000,
      monthlyBalanceUsd: usd(idrToUsd(49000)),
      rpmLimit: 30,
      maxKeys: 5,
      routingPriority: "FAST_LANE",
      bonusPercentage: 0,
      badgeColor: "blue",
      description: "Untuk developer aktif yang butuh kecepatan dan model coding standar.",
      features: JSON.stringify([
        "Saldo $3.0625 USD per bulan",
        "Batas 30 Request Per Menit (RPM)",
        "Maksimal 5 API Keys",
        "Jalur Fast Lane Priority",
        "Akses model coding standar",
        "Dukungan teknis prioritas",
      ]),
      allowedModelIds: JSON.stringify([
        "deepseek-v4-pro",
        "gpt-5.5",
        "gpt-6.1-sol",
        "cx/gpt-6.1-sol",
        "ag/gemini-2.5-flash",
        "gem/gemini-2.5-flash",
        "gem/gemini-2.5-flash-lite",
        "gem/gemini-2.5-pro",
        "gpt-4o-mini",
        "claude-3-haiku",
        "deepseek/deepseek-chat",
        "combo/free-coding",
        "openrouter/free",
      ]),
    },
    {
      id: "PRO",
      name: "Pro Developer",
      priceIdr: 99000,
      monthlyBalanceUsd: usd(idrToUsd(99000)),
      rpmLimit: 60,
      maxKeys: 10,
      routingPriority: "FAST_LANE",
      bonusPercentage: 30,
      badgeColor: "purple",
      description: "Akses flagship Claude 3.5 Sonnet & GPT-4o + Bonus Rescue 30%.",
      features: JSON.stringify([
        "Saldo $6.1875 USD per bulan",
        "Batas 60 Request Per Menit (RPM)",
        "Maksimal 10 API Keys",
        "Jalur Fast Lane Priority",
        "Akses model Pro (GPT-5.5, Claude Sonnet)",
        "1x Emergency Rescue Bonus +30%",
        "Support prioritas 24/7",
      ]),
      allowedModelIds: JSON.stringify([
        "deepseek-v4-pro",
        "gpt-5.5",
        "gpt-6.1-sol",
        "cx/gpt-6.1-sol",
        "ag/gemini-2.5-flash",
        "gem/gemini-2.5-flash",
        "gem/gemini-2.5-pro",
        "gpt-4o-mini",
        "gpt-4o",
        "claude-3-5-sonnet",
        "claude-3-haiku",
        "deepseek/deepseek-chat",
        "combo/free-coding",
        "openrouter/free",
      ]),
    },
    {
      id: "ULTRA",
      name: "Ultra Power / Team",
      priceIdr: 249000,
      monthlyBalanceUsd: usd(idrToUsd(249000)),
      rpmLimit: 120,
      maxKeys: -1,
      routingPriority: "DEDICATED",
      bonusPercentage: 50,
      badgeColor: "amber",
      description: "Akses tanpa batas seluruh model, zero cooldown, dan bonus rescue 50%.",
      features: JSON.stringify([
        "Saldo $15.5625 USD per bulan",
        "Batas 120 Request Per Menit (RPM)",
        "Unlimited API Keys",
        "Dedicated Lane + Zero Cooldown",
        "Akses penuh seluruh model Flagship",
        "1x Emergency Rescue Bonus +50%",
        "Direct SLA & Dedicated Support",
      ]),
      allowedModelIds: JSON.stringify(["*"]),
    },
  ];

  for (const tier of tiers) {
    await prisma.subscriptionTierConfig.upsert({
      where: { id: tier.id },
      create: tier,
      update: tier,
    });
    console.log(
      `- Tier ${tier.name} (${tier.id}) upserted: $${tier.monthlyBalanceUsd} USD / bulan`
    );
  }

  console.log("Seeding top-up packages (paket ketengan)...");
  const topupPackages = [
    {
      name: "Starter",
      priceIdr: 15000,
      bonusPercentage: 0,
      tag: "Starter",
      badgeColor: "gray",
      sortOrder: 1,
      isActive: true,
    },
    {
      name: "Popular",
      priceIdr: 50000,
      bonusPercentage: 0,
      tag: "Popular",
      badgeColor: "blue",
      sortOrder: 2,
      isActive: true,
    },
    {
      name: "Super Value",
      priceIdr: 100000,
      bonusPercentage: 5,
      tag: "Bonus +5%",
      badgeColor: "purple",
      sortOrder: 3,
      isActive: true,
    },
    {
      name: "Power User",
      priceIdr: 250000,
      bonusPercentage: 10,
      tag: "Power User (+10%)",
      badgeColor: "amber",
      sortOrder: 4,
      isActive: true,
    },
  ];

  for (const pkg of topupPackages) {
    const existing = await prisma.topupPackage.findFirst({
      where: { priceIdr: pkg.priceIdr },
    });
    if (!existing) {
      await prisma.topupPackage.create({ data: pkg });
      console.log(`- Created topup package: ${pkg.name} (Rp ${pkg.priceIdr.toLocaleString("id-ID")})`);
    } else {
      await prisma.topupPackage.update({
        where: { id: existing.id },
        data: pkg,
      });
      console.log(`- Updated topup package: ${pkg.name} (Rp ${pkg.priceIdr.toLocaleString("id-ID")})`);
    }
  }

  console.log("Seeding model pricing (USD per 1M tokens)...");
  const pricings = [
    { modelId: "ag/gemini-3.8-flash-high", name: "Gemini 3.8 Flash High (AG)", rateInUsdPer1m: 0.15, rateOutUsdPer1m: 0.60, rateInUsdPer1k: 0.00015, rateOutUsdPer1k: 0.0006 },
    { modelId: "ag/gemini-2.5-flash", name: "Gemini 2.5 Flash (AG)", rateInUsdPer1m: 0.15, rateOutUsdPer1m: 0.60, rateInUsdPer1k: 0.00015, rateOutUsdPer1k: 0.0006 },
    { modelId: "gem/gemini-2.5-flash", name: "Gemini 2.5 Flash", rateInUsdPer1m: 0.15, rateOutUsdPer1m: 0.60, rateInUsdPer1k: 0.00015, rateOutUsdPer1k: 0.0006 },
    { modelId: "gem/gemini-2.5-pro", name: "Gemini 2.5 Pro", rateInUsdPer1m: 0.30, rateOutUsdPer1m: 1.20, rateInUsdPer1k: 0.0003, rateOutUsdPer1k: 0.0012 },
    { modelId: "gpt-4o-mini", name: "GPT-4o Mini", rateInUsdPer1m: 0.20, rateOutUsdPer1m: 0.80, rateInUsdPer1k: 0.0002, rateOutUsdPer1k: 0.0008 },
    { modelId: "gpt-4o", name: "GPT-4o (Omni)", rateInUsdPer1m: 2.50, rateOutUsdPer1m: 10.00, rateInUsdPer1k: 0.0025, rateOutUsdPer1k: 0.01 },
    { modelId: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", rateInUsdPer1m: 3.00, rateOutUsdPer1m: 15.00, rateInUsdPer1k: 0.003, rateOutUsdPer1k: 0.015 },
    { modelId: "claude-3-haiku", name: "Claude 3 Haiku", rateInUsdPer1m: 0.30, rateOutUsdPer1m: 1.50, rateInUsdPer1k: 0.0003, rateOutUsdPer1k: 0.0015 },
    { modelId: "deepseek/deepseek-chat", name: "DeepSeek V3", rateInUsdPer1m: 0.30, rateOutUsdPer1m: 1.20, rateInUsdPer1k: 0.0003, rateOutUsdPer1k: 0.0012 },
    { modelId: "combo/free-coding", name: "Combo Free Coding Stack", rateInUsdPer1m: 0.06, rateOutUsdPer1m: 0.24, rateInUsdPer1k: 0.00006, rateOutUsdPer1k: 0.00024 },
  ];

  for (const p of pricings) {
    await prisma.modelPricing.upsert({
      where: { modelId: p.modelId },
      create: p,
      update: p,
    });
    console.log(
      `- Pricing ${p.modelId}: in $${p.rateInUsdPer1m} / out $${p.rateOutUsdPer1m} per 1M tokens`
    );
  }

  // Ensure every existing user has a non-zero starter balance.
  await prisma.user.updateMany({
    where: { balanceUsd: 0 },
    data: {
      balanceUsd: usd(1.0),
      monthlyBalanceAllocatedUsd: usd(1.0),
      monthlyBalanceRemainingUsd: usd(1.0),
    },
  });

  console.log("Seeding complete!");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
