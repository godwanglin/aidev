-- Aidev billing migration: Credits -> official USD balance
-- IMPORTANT: Set this value before production execution.
-- Historical rule was 1 IDR = 10 CR, therefore old CR -> USD is:
-- old_credits / 10 / IDR_PER_USD
SET @IDR_PER_USD = 16000;

-- Preserve historical balances while converting them to USD.
ALTER TABLE `User`
  CHANGE COLUMN `creditBalance` `balanceUsd` DECIMAL(18,8) NOT NULL DEFAULT 0,
  CHANGE COLUMN `purchasedCredits` `purchasedBalanceUsd` DECIMAL(18,8) NOT NULL DEFAULT 0,
  CHANGE COLUMN `monthlyCreditsAllocated` `monthlyBalanceAllocatedUsd` DECIMAL(18,8) NOT NULL DEFAULT 0,
  CHANGE COLUMN `monthlyCreditsRemaining` `monthlyBalanceRemainingUsd` DECIMAL(18,8) NOT NULL DEFAULT 0;

UPDATE `User`
SET
  `balanceUsd` = ROUND(`balanceUsd` / 10 / @IDR_PER_USD, 8),
  `purchasedBalanceUsd` = ROUND(`purchasedBalanceUsd` / 10 / @IDR_PER_USD, 8),
  `monthlyBalanceAllocatedUsd` = ROUND(`monthlyBalanceAllocatedUsd` / 10 / @IDR_PER_USD, 8),
  `monthlyBalanceRemainingUsd` = ROUND(`monthlyBalanceRemainingUsd` / 10 / @IDR_PER_USD, 8);

ALTER TABLE `RequestLog`
  CHANGE COLUMN `creditsCost` `costUsd` DECIMAL(18,8) NULL DEFAULT 0;

UPDATE `RequestLog`
SET `costUsd` = ROUND(`costUsd` / 10 / @IDR_PER_USD, 8)
WHERE `costUsd` IS NOT NULL;

ALTER TABLE `Order`
  CHANGE COLUMN `creditAmount` `balanceAmountUsd` DECIMAL(18,8) NOT NULL DEFAULT 0;

UPDATE `Order`
SET `balanceAmountUsd` = ROUND(`balanceAmountUsd` / 10 / @IDR_PER_USD, 8)
WHERE `balanceAmountUsd` IS NOT NULL;

ALTER TABLE `ComboModel`
  CHANGE COLUMN `rateInPer1k` `rateInUsdPer1k` DECIMAL(18,8) NOT NULL DEFAULT 0,
  CHANGE COLUMN `rateOutPer1k` `rateOutUsdPer1k` DECIMAL(18,8) NOT NULL DEFAULT 0,
  CHANGE COLUMN `costPerImage` `imageCostUsd` DECIMAL(18,8) NOT NULL DEFAULT 0;

UPDATE `ComboModel`
SET
  `rateInUsdPer1k` = ROUND(`rateInUsdPer1k` / 10 / @IDR_PER_USD, 8),
  `rateOutUsdPer1k` = ROUND(`rateOutUsdPer1k` / 10 / @IDR_PER_USD, 8),
  `imageCostUsd` = ROUND(`imageCostUsd` / 10 / @IDR_PER_USD, 8);

ALTER TABLE `SubscriptionTierConfig`
  CHANGE COLUMN `monthlyCredits` `monthlyBalanceUsd` DECIMAL(18,8) NOT NULL;

UPDATE `SubscriptionTierConfig`
SET `monthlyBalanceUsd` = ROUND(`monthlyBalanceUsd` / 10 / @IDR_PER_USD, 8);

ALTER TABLE `ModelPricing`
  CHANGE COLUMN `rateInPer1k` `rateInUsdPer1k` DECIMAL(18,8) NOT NULL DEFAULT 0,
  CHANGE COLUMN `rateOutPer1k` `rateOutUsdPer1k` DECIMAL(18,8) NOT NULL DEFAULT 0;

UPDATE `ModelPricing`
SET
  `rateInUsdPer1k` = ROUND(`rateInUsdPer1k` / 10 / @IDR_PER_USD, 8),
  `rateOutUsdPer1k` = ROUND(`rateOutUsdPer1k` / 10 / @IDR_PER_USD, 8);