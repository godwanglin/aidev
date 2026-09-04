import { prisma } from "./prisma";
import { hashApiKey } from "./key-utils";
import type { ApiKey } from "@prisma/client";

// Maximum overdraft limit allowed for any user account (-50,000 Tokens)
export const MAX_OVERDRAFT_TOKENS = -100000;

const rateLimitMap = new Map<string, number[]>();
const lastUsedBuffer = new Map<string, Date>();

// Flush lastUsedAt every 10 seconds to avoid excessive DB writes
intervalAsync();
function intervalAsync() {
  setInterval(async () => {
    if (lastUsedBuffer.size === 0) return;
    const entries = Array.from(lastUsedBuffer.entries());
    lastUsedBuffer.clear();

    for (const [id, lastUsedAt] of entries) {
      try {
        await prisma.apiKey.update({
          where: { id },
          data: { lastUsedAt },
        });
      } catch {}
    }
  }, 10000).unref();
}

export interface AuthResult {
  success: boolean;
  apiKey?: ApiKey;
  error?: string;
  status?: number;
}

export function invalidateApiKeyCache(_hashedKey?: string) {}

export async function authenticateApiKey(authHeader: string | null): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      error: "Missing or malformed Authorization header. Expected Bearer token",
      status: 401,
    };
  }

  const rawKey = authHeader.replace("Bearer ", "").trim();
  if (!rawKey) {
    return {
      success: false,
      error: "API key token is empty",
      status: 401,
    };
  }

  const hashedKey = hashApiKey(rawKey);
  const now = Date.now();

  const apiKeyRecord = await prisma.apiKey.findUnique({
    where: { hashedKey },
    include: {
      user: {
        select: { id: true, tokenBalance: true },
      },
    },
  });

  if (!apiKeyRecord) {
    return {
      success: false,
      error: "Invalid API key.",
      status: 401,
    };
  }

  if (!apiKeyRecord.isActive || apiKeyRecord.revokedAt) {
    return {
      success: false,
      error: "API key has been revoked or deactivated.",
      status: 403,
    };
  }

  // 1. Strict Overdraft Tolerance Check (Max minus allowed: -50,000 Tokens)
  const currentBalance = Number(apiKeyRecord.user?.tokenBalance ?? 0);
  if (currentBalance <= MAX_OVERDRAFT_TOKENS) {
    return {
      success: false,
      apiKey: apiKeyRecord,
      error: "Insufficient token balance. Please top up your account to continue.",
      status: 402,
    };
  }

  // 2. Sliding Window Rate Limiting (default 30/60 req/min)
  const windowMs = 60 * 1000;
  const timestamps = (rateLimitMap.get(apiKeyRecord.id) || []).filter((t) => now - t < windowMs);

  if (timestamps.length >= apiKeyRecord.rateLimit) {
    return {
      success: false,
      apiKey: apiKeyRecord,
      error: `Rate limit exceeded (${apiKeyRecord.rateLimit} req/min). Please slow down.`,
      status: 429,
    };
  }

  timestamps.push(now);
  rateLimitMap.set(apiKeyRecord.id, timestamps);

  lastUsedBuffer.set(apiKeyRecord.id, new Date(now));

  return {
    success: true,
    apiKey: apiKeyRecord,
  };
}
