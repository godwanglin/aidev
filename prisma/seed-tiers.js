const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log("Seeding subscription tiers...");

  const tiers = [
    {
      id: "FREE",
      name: "Free Tier",
      priceIdr: 0,
      monthlyCredits: BigInt(20000),
      rpmLimit: 15,
      maxKeys: 2,
      routingPriority: "REGULAR",
      bonusPercentage: 0,
      badgeColor: "gray",
      description: "Paket awal gratis untuk mencoba coding dan eksplorasi ringan.",
      allowedModelIds: JSON.stringify([
        "deepseek-v4-pro",
        "ag/gemini-3.8-flash-high",
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
      monthlyCredits: BigInt(650000),
      rpmLimit: 30,
      maxKeys: 5,
      routingPriority: "FAST_LANE",
      bonusPercentage: 0,
      badgeColor: "blue",
      description: "Untuk developer aktif yang butuh kecepatan dan model coding standar.",
      allowedModelIds: JSON.stringify([
        "deepseek-v4-pro",
        "gpt-5.5",
        "ag/gemini-3.8-flash-high",
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
      monthlyCredits: BigInt(1200000),
      rpmLimit: 60,
      maxKeys: 10,
      routingPriority: "FAST_LANE",
      bonusPercentage: 30,
      badgeColor: "purple",
      description: "Akses flagship Claude 3.5 Sonnet & GPT-4o + Bonus Rescue 30%.",
      allowedModelIds: JSON.stringify([
        "deepseek-v4-pro",
        "gpt-5.5",
        "ag/gemini-3.8-flash-high",
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
      monthlyCredits: BigInt(3500000),
      rpmLimit: 120,
      maxKeys: -1,
      routingPriority: "DEDICATED",
      bonusPercentage: 50,
      badgeColor: "amber",
      description: "Akses tanpa batas seluruh model, zero cooldown, dan bonus rescue 50%.",
      allowedModelIds: JSON.stringify(["*"]), // Wildcard all
    },
  ];

  for (const tier of tiers) {
    await prisma.subscriptionTierConfig.upsert({
      where: { id: tier.id },
      create: tier,
      update: tier,
    });
    console.log(`- Tier ${tier.name} (${tier.id}) upserted.`);
  }

  console.log("Seeding model pricing...");
  const pricings = [
    { modelId: "ag/gemini-3.8-flash-high", name: "Gemini 3.8 Flash High (AG)", rateInPer1k: 25, rateOutPer1k: 100 },
    { modelId: "ag/gemini-2.5-flash", name: "Gemini 2.5 Flash (AG)", rateInPer1k: 25, rateOutPer1k: 100 },
    { modelId: "gem/gemini-2.5-flash", name: "Gemini 2.5 Flash", rateInPer1k: 25, rateOutPer1k: 100 },
    { modelId: "gem/gemini-2.5-pro", name: "Gemini 2.5 Pro", rateInPer1k: 50, rateOutPer1k: 200 },
    { modelId: "gpt-4o-mini", name: "GPT-4o Mini", rateInPer1k: 30, rateOutPer1k: 120 },
    { modelId: "gpt-4o", name: "GPT-4o (Omni)", rateInPer1k: 400, rateOutPer1k: 1600 },
    { modelId: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", rateInPer1k: 500, rateOutPer1k: 2500 },
    { modelId: "claude-3-haiku", name: "Claude 3 Haiku", rateInPer1k: 50, rateOutPer1k: 250 },
    { modelId: "deepseek/deepseek-chat", name: "DeepSeek V3", rateInPer1k: 45, rateOutPer1k: 180 },
    { modelId: "combo/free-coding", name: "Combo Free Coding Stack", rateInPer1k: 10, rateOutPer1k: 50 },
  ];

  for (const p of pricings) {
    await prisma.modelPricing.upsert({
      where: { modelId: p.modelId },
      create: p,
      update: p,
    });
    console.log(`- Pricing for ${p.modelId}: In ${p.rateInPer1k} CR, Out ${p.rateOutPer1k} CR`);
  }

  // Also ensure existing users have at least 200,000 creditBalance if currently 0
  await prisma.user.updateMany({
    where: { creditBalance: BigInt(0) },
    data: { creditBalance: BigInt(200000), monthlyCreditsRemaining: BigInt(200000), monthlyCreditsAllocated: BigInt(200000) }
  });

  console.log("Seeding complete!");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
