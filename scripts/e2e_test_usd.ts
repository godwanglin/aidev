import { prisma } from "../src/lib/prisma";
import {
  calculateUsdCost,
  deductUserBalance,
  refundUserBalance,
  checkTierModelAccess,
  getModelUsdRates,
} from "../src/lib/billing";
import { idrToUsd, usdToIdr, tokensForUsd, formatUsd } from "../src/lib/billing-config";

async function runE2ETests() {
  console.log("=========================================");
  console.log("🚀 STARTING USD BILLING E2E TEST SUITE");
  console.log("=========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`, detail || "");
      failed++;
    }
  }

  // --- TEST 1: Currency Conversion Helpers ---
  console.log("--- 1. Testing Currency & Token Helpers ---");
  const testIdr = 160000;
  const convertedUsd = idrToUsd(testIdr);
  assert(convertedUsd === 10, `idrToUsd(160000) === 10 (got ${convertedUsd})`);

  const convertedIdr = usdToIdr(10);
  assert(convertedIdr === 160000, `usdToIdr(10) === 160000 (got ${convertedIdr})`);

  const tokens = tokensForUsd(1);
  assert(tokens > 0, `tokensForUsd(1) returns positive tokens (got ${tokens})`);

  // --- TEST 2: Model Pricing Rates & Cost Calculation ---
  console.log("\n--- 2. Testing Model USD Pricing & Calculation ---");
  const pricing = await getModelUsdRates("claude-3-5-sonnet");
  assert(pricing.rateInUsdPer1k > 0, "claude-3-5-sonnet has valid rateInUsdPer1k", pricing);
  assert(pricing.rateOutUsdPer1k > 0, "claude-3-5-sonnet has valid rateOutUsdPer1k", pricing);

  // 1,000 prompt tokens + 1,000 completion tokens
  const cost = await calculateUsdCost("claude-3-5-sonnet", 1000, 1000);
  const expectedCost = pricing.rateInUsdPer1k + pricing.rateOutUsdPer1k;
  assert(
    Math.abs(cost - expectedCost) < 0.000001,
    `calculateUsdCost matches rate sum: got ${cost}, expected ${expectedCost}`
  );

  // Test fallback pricing for unknown model
  const fallbackCost = await calculateUsdCost("unknown-model-xyz", 1000, 1000);
  assert(fallbackCost > 0, `fallbackCost is positive (got ${fallbackCost})`);

  // --- TEST 3: User Balance & Precision Operations ---
  console.log("\n--- 3. Testing User Balance Deduction & Refund ---");
  const testEmail = `test-usd-${Date.now()}@aidev.test`;
  const initialBalance = 5.00000000;

  const testUser = await prisma.user.create({
    data: {
      email: testEmail,
      name: "E2E Test User",
      passwordHash: "dummyhash",
      balanceUsd: initialBalance,
      purchasedBalanceUsd: initialBalance,
      monthlyBalanceAllocatedUsd: 1.0,
      monthlyBalanceRemainingUsd: 1.0,
      subscriptionTier: "FREE",
    },
  });
  assert(!!testUser.id, "Test user created successfully", testUser.id);

  // Deduct small USD cost (e.g. $0.0045)
  const deductAmount = 0.0045;
  await deductUserBalance(testUser.id, deductAmount);

  let updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
  const balanceAfterDeduct = Number(updatedUser?.balanceUsd);
  const expectedAfterDeduct = initialBalance - deductAmount;
  assert(
    Math.abs(balanceAfterDeduct - expectedAfterDeduct) < 0.00001,
    `Deduct $0.0045 from $5: got ${balanceAfterDeduct}, expected ${expectedAfterDeduct}`
  );

  // Refund the deducted cost
  await refundUserBalance(testUser.id, deductAmount);
  updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
  const balanceAfterRefund = Number(updatedUser?.balanceUsd);
  assert(
    Math.abs(balanceAfterRefund - initialBalance) < 0.00001,
    `Refund $0.0045 restored balance to $5: got ${balanceAfterRefund}`
  );

  // --- TEST 4: Tier Access Control ---
  console.log("\n--- 4. Testing Tier Model Access ---");
  const freeAccess = await checkTierModelAccess("FREE", "gemini-3.8-flash-high");
  assert(freeAccess.allowed === false, "FREE tier rejected for gemini-3.8-flash-high", freeAccess);

  const ultraAccess = await checkTierModelAccess("ULTRA", "gemini-3.8-flash-high");
  assert(ultraAccess.allowed === true, "ULTRA tier allowed for gemini-3.8-flash-high");

  const freeAllowedModel = await checkTierModelAccess("FREE", "deepseek-v4-pro");
  assert(freeAllowedModel.allowed === true, "FREE tier allowed for deepseek-v4-pro");

  // --- TEST 5: Subscription Tiers from Database ---
  console.log("\n--- 5. Testing SubscriptionTierConfig Table ---");
  const tiers = await prisma.subscriptionTierConfig.findMany({
    orderBy: { priceIdr: "asc" },
  });
  assert(tiers.length >= 4, `Found ${tiers.length} tiers in DB (FREE, PLUS, PRO, ULTRA)`);
  tiers.forEach((t) => {
    assert(
      Number(t.monthlyBalanceUsd) > 0,
      `Tier ${t.id} has positive monthlyBalanceUsd ($${t.monthlyBalanceUsd})`
    );
  });

  // --- TEST 6: RequestLog Decimal Logging ---
  console.log("\n--- 6. Testing RequestLog Cost Logging ---");
  const testApiKey = await prisma.apiKey.create({
    data: {
      userId: testUser.id,
      name: "E2E Test Key",
      prefix: "sk-test",
      hashedKey: `hash-${Date.now()}`,
    },
  });

  const sampleLog = await prisma.requestLog.create({
    data: {
      apiKeyId: testApiKey.id,
      path: "/v1/chat/completions",
      method: "POST",
      statusCode: 200,
      model: "claude-3-5-sonnet",
      promptTokens: 150,
      completionTokens: 350,
      totalTokens: 500,
      durationMs: 450,
      costUsd: 0.00570000,
    },
  });
  assert(Number(sampleLog.costUsd) === 0.0057, `RequestLog recorded costUsd accurately ($${sampleLog.costUsd})`);

  // Cleanup test user & cascade records
  await prisma.user.delete({ where: { id: testUser.id } });
  console.log("\n🧹 Test user cleaned up.");

  // --- SUMMARY ---
  console.log("\n=========================================");
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runE2ETests()
  .catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
