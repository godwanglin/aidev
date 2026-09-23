import { prisma } from "./prisma";
import { hashApiKey } from "./key-utils";
import type { ApiKey } from "@prisma/client";

// Maximum overdraft limit allowed for any user account (-50,000 Tokens)
export const MAX_OVERDRAFT_TOKENS = -100000;

const globalForAuth = globalThis as unknown as {
  authIntervalStarted?: boolean;
  rateLimitMap?: Map<string, number[]>;
  lastUsedBuffer?: Map<string, Date>;
};

const rateLimitMap = globalForAuth.rateLimitMap ?? new Map<string, number[]>();
globalForAuth.rateLimitMap = rateLimitMap;

const lastUsedBuffer = globalForAuth.lastUsedBuffer ?? new Map<string, Date>();
globalForAuth.lastUsedBuffer = lastUsedBuffer;

// Flush lastUsedAt and prune expired rate limits every 10s
if (!globalForAuth.authIntervalStarted) {
  globalForAuth.authIntervalStarted = true;
  setInterval(async () => {
    if (lastUsedBuffer.size > 0) {
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
    }

    // Prune expired rate limit entries to prevent memory leak
    const now = Date.now();
    for (const [keyId, timestamps] of rateLimitMap.entries()) {
      const active = timestamps.filter((t) => now - t < 60000);
      if (active.length === 0) {
        rateLimitMap.delete(keyId);
      } else {
        rateLimitMap.set(keyId, active);
      }
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

export async function authenticateApiKey(authHeader: string | null, xApiKey?: string | null): Promise<AuthResult> {
  const token = (xApiKey && xApiKey.trim()) || (authHeader && authHeader.trim()) || "";
  if (!token) {
    return {
      success: false,
      error: "Missing Authorization or x-api-key header. Expected Bearer token or x-api-key",
      status: 401,
    };
  }

  const rawKey = token.startsWith("Bearer ") ? token.replace(/^Bearer\s+/i, "").trim() : token.trim();
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
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          tokenBalance: true,
          creditBalance: true,
          subscriptionTier: true,
          subscriptionExpiresAt: true,
        },
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

  // 1. Strict Credit Balance Check (Exempt ADMIN role)
  const isAdmin = apiKeyRecord.user?.role === "ADMIN";
  const currentCredits = Number(apiKeyRecord.user?.creditBalance ?? 0);
  console.log(`[DEBUG auth.ts check] key=${apiKeyRecord.name} role=${apiKeyRecord.user?.role} creditBalance=${apiKeyRecord.user?.creditBalance} currentCredits=${currentCredits} isLeq0=${currentCredits <= 0}`);
  if (!isAdmin && currentCredits <= 0) {
    return {
      success: false,
      apiKey: apiKeyRecord,
      error: "Saldo credit Anda telah habis (0 CR). Silakan top up saldo atau perbarui paket langganan Anda di http://localhost:3000/billing",
      status: 402,
    };
  }

  // 2. Sliding Window Rate Limiting (exempt ADMIN role)
  if (!isAdmin) {
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
  }

  lastUsedBuffer.set(apiKeyRecord.id, new Date(now));

  return {
    success: true,
    apiKey: apiKeyRecord,
  };
}
