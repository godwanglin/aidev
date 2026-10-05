import { prisma } from "@/lib/prisma";
import { decryptCredential } from "@/lib/crypto";
import { refreshConnectionToken } from "@/lib/oauth/refresh-manager";

export interface CodexResetCreditItem {
  status: string;
  grantedAt: string | null;
  expiresAt: string | null;
}

export interface CodexResetCreditsResult {
  availableCount: number;
  credits: CodexResetCreditItem[];
}

export interface ConsumeResetCreditResult {
  ok: boolean;
  noCredit: boolean;
  status: number;
  code: string | null;
  windowsReset: number;
  message: string | null;
  raw?: any;
}

const CODEX_RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const CODEX_CONSUME_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume";

function toIsoDate(value: any): string | null {
  if (!value) return null;
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

function toFiniteNumber(value: any, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

interface CachedResetCredits {
  data: CodexResetCreditsResult;
  timestamp: number;
}
const resetCreditsCache = new Map<string, CachedResetCredits>();
const RESET_CREDITS_CACHE_TTL = 60 * 1000; // 60 seconds

/**
 * Fetch available Codex reset credits and expiry dates for a connection
 */
export async function getCodexRateLimitResetCredits(
  accessToken: string,
  chatgptAccountId?: string | null
): Promise<CodexResetCreditsResult> {
  if (!accessToken) {
    throw new Error("No Codex access token available. Please re-authorize the connection.");
  }

  const cacheKey = `${accessToken.slice(0, 30)}_${chatgptAccountId || ""}`;
  const cached = resetCreditsCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < RESET_CREDITS_CACHE_TTL) {
    return cached.data;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "OpenAI-Beta": "codex-1",
    originator: "codex_cli_rs",
  };
  if (chatgptAccountId) {
    headers["ChatGPT-Account-ID"] = chatgptAccountId;
  }

  let response: Response;
  try {
    response = await fetch(CODEX_RESET_CREDITS_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000), // 5 seconds max timeout
    });
  } catch (netErr: any) {
    // If timeout or network failure, return last cached if available or fallback safely
    if (cached) return cached.data;
    throw new Error(`Codex reset credits network error: ${netErr.message || "Request timed out"}`);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err =
      data?.error?.message ||
      data?.message ||
      data?.detail ||
      `Codex reset credits API unavailable (${response.status})`;
    throw new Error(err);
  }

  const creditsRaw = Array.isArray(data?.credits) ? data.credits : [];
  const credits: CodexResetCreditItem[] = creditsRaw.map((credit: any) => ({
    status: String(credit?.status || "unknown"),
    grantedAt: toIsoDate(credit?.granted_at ?? credit?.grantedAt),
    expiresAt: toIsoDate(credit?.expires_at ?? credit?.expiresAt),
  }));

  // Sort by expiration ascending
  credits.sort((a, b) => {
    const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });

  const result: CodexResetCreditsResult = {
    availableCount: Math.max(0, toFiniteNumber(data?.available_count ?? data?.availableCount, 0)),
    credits,
  };

  resetCreditsCache.set(cacheKey, {
    data: result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Consume one Codex rate-limit reset credit (refreshes 5h and weekly rate limits)
 */
export async function consumeCodexRateLimitResetCredit(
  accessToken: string,
  redeemRequestId?: string
): Promise<ConsumeResetCreditResult> {
  if (!accessToken) {
    throw new Error("No Codex access token available. Please re-authorize the connection.");
  }

  const reqId = redeemRequestId || crypto.randomUUID();
  const response = await fetch(CODEX_CONSUME_CREDITS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      originator: "codex_cli_rs",
    },
    body: JSON.stringify({ redeem_request_id: reqId }),
  });

  let data: any = null;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const code = data?.code || null;
  const windowsReset = toFiniteNumber(data?.windows_reset, 0);
  const success = response.ok && (code === "reset" || windowsReset > 0);

  return {
    ok: success,
    noCredit: response.ok && code === "no_credit",
    status: response.status,
    code,
    windowsReset,
    message: data?.message || data?.error?.message || null,
    raw: data,
  };
}

/**
 * Resolves a ProviderConnection, decrypts its token, and optionally handles OAuth refresh
 */
export async function getValidCodexToken(connectionId: string): Promise<{
  connection: any;
  accessToken: string;
}> {
  const connection = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    throw new Error("Connection not found");
  }

  const p = connection.provider.toUpperCase();
  if (p !== "OPENAI_CODEX" && p !== "CODEX") {
    throw new Error("Reset credits are only available for OpenAI Codex connections.");
  }

  let accessToken = "";
  if (connection.authType === "OAUTH" && connection.refreshTokenEnc) {
    try {
      // Proactively refresh if token expires within 10 mins
      accessToken = await refreshConnectionToken(connection.id, false);
    } catch {
      // Fallback to decrypted access token
      if (connection.accessTokenEnc) {
        accessToken = decryptCredential(connection.accessTokenEnc);
      }
    }
  } else if (connection.accessTokenEnc) {
    accessToken = decryptCredential(connection.accessTokenEnc);
  } else if (connection.apiKeyEncrypted) {
    accessToken = decryptCredential(connection.apiKeyEncrypted);
  }

  if (!accessToken) {
    throw new Error("No valid credentials found for this Codex connection.");
  }

  return { connection, accessToken };
}
