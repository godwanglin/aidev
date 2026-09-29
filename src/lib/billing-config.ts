/**
 * Official USD billing configuration.
 *
 * IDR is intentionally not part of the billing engine. Payment adapters may
 * convert IDR to USD at order creation time using the operator-defined rate.
 */
export const BILLING_CURRENCY = "USD" as const;
export const BILLING_DECIMALS = 8;

/**
 * Operator-controlled exchange rate: how many IDR equal 1 USD.
 * Change this to match your pricing, or set the IDR_PER_USD env var.
 */
export const IDR_PER_USD = Number(
  process.env.NEXT_PUBLIC_IDR_PER_USD || process.env.IDR_PER_USD || 16000
);

/**
 * Legacy quota parity: 1 CR = 10 tokens and 1 CR = Rp 0.01, therefore
 * 1 token = Rp 0.01 worth of balance. Kept so the token quota keeps the
 * same purchasing power it had under the old credit system.
 */
export const TOKENS_PER_IDR = 100;

export function tokensForUsd(amountUsd: number | string | null | undefined): number {
  return Math.round(usdToIdr(amountUsd) * TOKENS_PER_IDR);
}

export function usd(value: number | string | null | undefined): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, Number(amount.toFixed(BILLING_DECIMALS))) : 0;
}

/** Convert a local-currency (IDR) amount into the official USD balance unit. */
export function idrToUsd(idr: number | string | null | undefined): number {
  const amount = Number(idr || 0);
  if (!Number.isFinite(amount) || amount <= 0 || IDR_PER_USD <= 0) return 0;
  return usd(amount / IDR_PER_USD);
}

/** Convert a USD balance back to IDR for local pricing display. */
export function usdToIdr(amountUsd: number | string | null | undefined): number {
  const amount = usd(amountUsd);
  return Math.round(amount * IDR_PER_USD);
}

export function formatUsd(value: number | string | null | undefined): string {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export function formatBalance(value: number | string | null | undefined, prefix = "$"): string {
  const amount = Number(value || 0);
  return `${prefix}${amount.toFixed(2)}`;
}

export function formatCost(value: number | string | null | undefined): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return "$0.00";
  return `$${amount.toFixed(amount < 0.001 ? 6 : 4)}`;
}

/**
 * Central USD defaults. Never reintroduce legacy credit numbers here.
 */
export const DEFAULT_RATE_IN_USD_PER_1K = 0.00015;
export const DEFAULT_RATE_OUT_USD_PER_1K = 0.0006;
export const DEFAULT_IMAGE_COST_USD = 0.005;
export const DEFAULT_MONTHLY_BALANCE_USD = 5;

export const TIER_HIERARCHY: Record<string, number> = {
  FREE: 0,
  PLUS: 1,
  PRO: 2,
  ULTRA: 3,
};

export function getTierLevel(tier: string | null | undefined): number {
  if (!tier) return 0;
  return TIER_HIERARCHY[tier.toUpperCase()] ?? 0;
}

export function isDowngrade(currentTier: string | null | undefined, targetTier: string | null | undefined): boolean {
  return getTierLevel(targetTier) < getTierLevel(currentTier);
}

export function isUpgrade(currentTier: string | null | undefined, targetTier: string | null | undefined): boolean {
  return getTierLevel(targetTier) > getTierLevel(currentTier);
}

export function rateInDefault(): number {
  return DEFAULT_RATE_IN_USD_PER_1K;
}
export function rateOutDefault(): number {
  return DEFAULT_RATE_OUT_USD_PER_1K;
}
export function imageCostDefault(): number {
  return DEFAULT_IMAGE_COST_USD;
}