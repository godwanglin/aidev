import { prisma } from "@/lib/prisma";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { getProviderOAuthConfig } from "@/lib/oauth/config";
import { adminLogger } from "@/lib/admin-logger";

/**
 * Lead time before token expiry to trigger proactive refresh (10 minutes).
 */
export const REFRESH_LEAD_MS = 10 * 60 * 1000;

/**
 * In-memory Promise deduplication lock map.
 * Ensures two simultaneous requests for the same connection do not trigger
 * parallel refresh calls against the upstream OAuth provider.
 */
const refreshLocks = new Map<string, Promise<string>>();

export function withRefreshLock(
  connectionId: string,
  refreshFn: () => Promise<string>
): Promise<string> {
  const existing = refreshLocks.get(connectionId);
  if (existing) {
    return existing;
  }

  const pending = refreshFn().finally(() => {
    refreshLocks.delete(connectionId);
  });

  refreshLocks.set(connectionId, pending);
  return pending;
}

export interface RefreshResult {
  connectionId: string;
  provider: string;
  name: string;
  status: "REFRESHED" | "SKIPPED" | "FAILED";
  expiresAt?: string;
  error?: string;
}

export interface BatchRefreshSummary {
  timestamp: string;
  totalChecked: number;
  refreshed: number;
  skipped: number;
  failed: number;
  details: RefreshResult[];
}

/**
 * Execute upstream HTTP call to exchange a refresh token for a new access token.
 * Specialized per provider based on 9Router's tokenRefresh profiles.
 */
async function callUpstreamRefreshToken(
  provider: string,
  refreshToken: string,
  config: any
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const p = provider.toUpperCase();

  // 1. Anthropic / Claude Code (JSON payload, PKCE client without secret)
  if (p === "CLAUDE_CODE" || p === "CLAUDE" || p === "ANTHROPIC") {
    const res = await fetch(config.tokenUrl || "https://claude.ai/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.defaultClientId || "claude-code-client",
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: Number(data.expires_in) || 3600,
    };
  }

  // 2. Antigravity / Gemini CLI / Google Cloud
  if (p === "ANTIGRAVITY" || p === "GEMINI_CLI" || p === "GOOGLE") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.defaultClientId,
    });

    if (config.defaultClientSecret) {
      body.set("client_secret", config.defaultClientSecret);
    }

    const res = await fetch(config.tokenUrl || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 3600,
    };
  }

  // 3. OpenAI Codex (form-urlencoded, PKCE public client)
  if (p === "OPENAI_CODEX" || p === "OPENAI" || p === "CODEX") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.defaultClientId || "app_EMoamEEZ73f0CkXaXp7hrann",
    });

    if (config.defaultClientSecret) {
      body.set("client_secret", config.defaultClientSecret);
    }

    const res = await fetch(config.tokenUrl || "https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 3600,
    };
  }

  // 4. Qoder / Kimi / xAI / Grok / Cline / ClinePass / CodeBuddy / Xiaomi MiMo / Generic OAuth
  const bodyParams = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.defaultClientId || "",
  });

  if (config.defaultClientSecret) {
    bodyParams.set("client_secret", config.defaultClientSecret);
  }

  let res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: bodyParams.toString(),
  });

  // If endpoint rejects form-encoded (HTTP 415), fallback to JSON payload
  if (res.status === 415) {
    const jsonPayload: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.defaultClientId || "",
    };
    if (config.defaultClientSecret) {
      jsonPayload.client_secret = config.defaultClientSecret;
    }

    res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(jsonPayload),
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: Number(data.expires_in) || 3600,
  };
}

/**
 * Refreshes an individual provider connection with concurrency deduplication lock.
 * If force is false, it only refreshes if tokenExpiresAt < 10 minutes from now.
 */
export async function refreshConnectionToken(
  connectionId: string,
  force: boolean = false
): Promise<string> {
  return withRefreshLock(connectionId, async () => {
    const conn = await prisma.providerConnection.findUnique({
      where: { id: connectionId },
    });

    if (!conn) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Non-OAuth connection: simply return decrypted API key
    if (conn.authType !== "OAUTH") {
      return conn.apiKeyEncrypted ? decryptCredential(conn.apiKeyEncrypted) : "";
    }

    // Check if token is still fresh and force is false
    const now = Date.now();
    const expiryMs = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
    const isExpiring = !expiryMs || expiryMs - now < REFRESH_LEAD_MS;

    if (!force && !isExpiring && conn.accessTokenEnc) {
      return decryptCredential(conn.accessTokenEnc);
    }

    if (!conn.refreshTokenEnc) {
      throw new Error(`No refresh token available for connection "${conn.name}" (${conn.provider})`);
    }

    const config = getProviderOAuthConfig(conn.provider);
    if (!config) {
      throw new Error(`OAuth configuration not found for provider "${conn.provider}"`);
    }

    const rawRefreshToken = decryptCredential(conn.refreshTokenEnc);
    if (!rawRefreshToken) {
      throw new Error("Corrupted or empty refresh token in database");
    }

    try {
      adminLogger.log({
        scope: "AUTH_REFRESH",
        level: "info",
        message: `🔄 Refreshing OAuth token for "${conn.name}" (${conn.provider}) · Force: ${force}`,
        details: { connectionId, name: conn.name, provider: conn.provider, force },
      });

      const { accessToken, refreshToken: newRefreshToken, expiresIn } =
        await callUpstreamRefreshToken(conn.provider, rawRefreshToken, config);

      const accessTokenEnc = encryptCredential(accessToken);
      const refreshTokenEnc = encryptCredential(newRefreshToken || rawRefreshToken);
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

      await prisma.providerConnection.update({
        where: { id: connectionId },
        data: {
          accessTokenEnc,
          refreshTokenEnc,
          tokenExpiresAt,
          syncStatus: "NORMAL",
          lastSyncedAt: new Date(),
        },
      });

      adminLogger.log({
        scope: "AUTH_REFRESH",
        level: "success",
        message: `✅ OAuth token refreshed for "${conn.name}" (${conn.provider}) · Expires in ${expiresIn}s`,
        details: { connectionId, name: conn.name, provider: conn.provider, expiresIn },
      });

      return accessToken;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      adminLogger.log({
        scope: "AUTH_REFRESH",
        level: "error",
        message: `❌ OAuth token refresh failed for "${conn.name}" (${conn.provider}): ${errMsg.slice(0, 120)}`,
        details: { connectionId, name: conn.name, provider: conn.provider, error: errMsg },
      });
      const isUnrecoverable =
        errMsg.includes("invalid_grant") ||
        errMsg.includes("revoked") ||
        errMsg.includes("expired") ||
        errMsg.includes("invalid_request");

      if (isUnrecoverable) {
        await prisma.providerConnection.update({
          where: { id: connectionId },
          data: {
            syncStatus: "EXHAUSTED",
            lastSyncedAt: new Date(),
          },
        });
      }

      throw err;
    }
  });
}

/**
 * Scans all active OAuth connections in the database and proactively refreshes
 * any token that will expire within the REFRESH_LEAD_MS window (or has expired).
 */
export async function runAllOAuthTokenRefreshes(): Promise<BatchRefreshSummary> {
  const connections = await prisma.providerConnection.findMany({
    where: {
      authType: "OAUTH",
      isActive: true,
    },
  });

  const now = Date.now();
  const results: RefreshResult[] = [];
  let refreshedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const conn of connections) {
    const expiryMs = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
    const needsRefresh = !expiryMs || expiryMs - now < REFRESH_LEAD_MS;

    if (!needsRefresh) {
      skippedCount++;
      results.push({
        connectionId: conn.id,
        provider: conn.provider,
        name: conn.name,
        status: "SKIPPED",
        expiresAt: conn.tokenExpiresAt ? conn.tokenExpiresAt.toISOString() : undefined,
      });
      continue;
    }

    try {
      await refreshConnectionToken(conn.id, true);
      refreshedCount++;
      results.push({
        connectionId: conn.id,
        provider: conn.provider,
        name: conn.name,
        status: "REFRESHED",
      });
    } catch (err: any) {
      failedCount++;
      results.push({
        connectionId: conn.id,
        provider: conn.provider,
        name: conn.name,
        status: "FAILED",
        error: err?.message || String(err),
      });
    }
  }

  if (refreshedCount > 0 || failedCount > 0) {
    adminLogger.log({
      scope: "BG_TOKEN_REFRESH",
      level: failedCount > 0 ? "warn" : "info",
      message: `⏰ Background OAuth scan: ${connections.length} checked · ${refreshedCount} refreshed · ${failedCount} failed`,
      details: { totalChecked: connections.length, refreshed: refreshedCount, skipped: skippedCount, failed: failedCount },
    });
  }

  return {
    timestamp: new Date().toISOString(),
    totalChecked: connections.length,
    refreshed: refreshedCount,
    skipped: skippedCount,
    failed: failedCount,
    details: results,
  };
}

// Global runtime timer state
let isRefresherRunning = false;
let refresherTimer: NodeJS.Timeout | null = null;

/**
 * Boots the background OAuth token refresher loop.
 * Runs an initial check after 5 seconds, then every 5 minutes (300,000 ms).
 */
export function startOAuthTokenRefresher(): void {
  if (isRefresherRunning) return;
  isRefresherRunning = true;

  console.log("[OAuth Refresher] Initializing background token refresh worker...");

  // Initial delayed check
  setTimeout(async () => {
    try {
      const summary = await runAllOAuthTokenRefreshes();
      if (summary.refreshed > 0 || summary.failed > 0) {
        console.log(
          `[OAuth Refresher] Initial run complete: ${summary.refreshed} refreshed, ${summary.failed} failed, ${summary.skipped} skipped`
        );
      }
    } catch (err) {
      console.error("[OAuth Refresher] Error during initial token scan:", err);
    }
  }, 5000).unref?.();

  // Recurring 5-minute interval
  refresherTimer = setInterval(async () => {
    try {
      const summary = await runAllOAuthTokenRefreshes();
      if (summary.refreshed > 0 || summary.failed > 0) {
        console.log(
          `[OAuth Refresher] Interval run: ${summary.refreshed} refreshed, ${summary.failed} failed, ${summary.skipped} skipped`
        );
      }
    } catch (err) {
      console.error("[OAuth Refresher] Error during background token scan:", err);
    }
  }, 5 * 60 * 1000);

  refresherTimer.unref?.();
}
