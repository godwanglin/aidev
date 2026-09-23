import { prisma } from "../prisma";
import { decryptCredential } from "../crypto";
import { sendProviderDownAlert } from "../discord";

export interface HealthCheckResult {
  connectionId: string;
  name: string;
  provider: string;
  statusCode: number;
  latencyMs: number;
  status: "NORMAL" | "EXHAUSTED" | "ERROR";
  reason?: string;
  autoDisabled: boolean;
}

/**
 * Executes an automated health check ping across all active provider accounts
 */
export async function runHealthCheck(): Promise<{
  totalChecked: number;
  healthyCount: number;
  disabledCount: number;
  results: HealthCheckResult[];
}> {
  const connections = await prisma.providerConnection.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      provider: true,
      authType: true,
      apiKeyEncrypted: true,
      accessTokenEnc: true,
      baseUrl: true,
      accountEmail: true,
      customHeaders: true,
    },
  });

  const results: HealthCheckResult[] = [];
  let healthyCount = 0;
  let disabledCount = 0;

  for (const conn of connections) {
    const startTime = Date.now();
    let statusCode = 200;
    let reason: string | undefined;
    let isHealthy = true;

    try {
      // Decrypt credentials
      let key = "";
      if (conn.authType === "OAUTH") {
        key = conn.accessTokenEnc ? decryptCredential(conn.accessTokenEnc) : "";
      } else {
        key = conn.apiKeyEncrypted ? decryptCredential(conn.apiKeyEncrypted) : "";
      }

      if (!key) {
        statusCode = 401;
        reason = "Credential missing or failed to decrypt";
        isHealthy = false;
      } else {
        // Perform probe based on provider
        const probeResult = await performProbe(conn, key);
        statusCode = probeResult.statusCode;
        reason = probeResult.reason;
        isHealthy = probeResult.isHealthy;
      }
    } catch (err: any) {
      statusCode = 500;
      reason = err.message || "Unknown health check probe error";
      isHealthy = false;
    }

    const latencyMs = Date.now() - startTime;
    let autoDisabled = false;

    if (!isHealthy || statusCode === 401 || statusCode === 429) {
      // Auto-disable exhausted or invalid connection
      autoDisabled = true;
      disabledCount++;
      const syncStatus = statusCode === 429 ? "EXHAUSTED" : "ERROR";

      await prisma.providerConnection.update({
        where: { id: conn.id },
        data: {
          isActive: false,
          syncStatus,
          lastSyncedAt: new Date(),
        },
      });

      // Send Discord Alert
      sendProviderDownAlert({
        connectionName: conn.name,
        provider: conn.provider,
        accountEmail: conn.accountEmail,
        statusCode,
        reason: reason || (statusCode === 429 ? "Upstream quota exhausted / rate-limited" : "Invalid or expired credentials"),
      }).catch(() => {});

      results.push({
        connectionId: conn.id,
        name: conn.name,
        provider: conn.provider,
        statusCode,
        latencyMs,
        status: syncStatus,
        reason,
        autoDisabled: true,
      });
    } else {
      healthyCount++;
      await prisma.providerConnection.update({
        where: { id: conn.id },
        data: {
          syncStatus: "NORMAL",
          lastSyncedAt: new Date(),
        },
      });

      results.push({
        connectionId: conn.id,
        name: conn.name,
        provider: conn.provider,
        statusCode: 200,
        latencyMs,
        status: "NORMAL",
        autoDisabled: false,
      });
    }
  }

  return {
    totalChecked: connections.length,
    healthyCount,
    disabledCount,
    results,
  };
}

/**
 * Minimal probe implementation
 */
async function performProbe(conn: any, key: string): Promise<{ statusCode: number; isHealthy: boolean; reason?: string }> {
  const prov = conn.provider.toUpperCase();

  // 1. Antigravity Cloud Code
  if (prov === "ANTIGRAVITY" || prov === "GEMINI_CLI") {
    try {
      const res = await fetch("https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "User-Agent": "google-cloud-code-vscode/1.0",
        },
        body: JSON.stringify({}),
      });
      if (res.status === 401 || res.status === 403) {
        return { statusCode: res.status, isHealthy: false, reason: "OAuth token expired or permission denied" };
      }
      if (res.status === 429) {
        return { statusCode: 429, isHealthy: false, reason: "Quota limit exhausted" };
      }
      return { statusCode: 200, isHealthy: true };
    } catch (e: any) {
      return { statusCode: 502, isHealthy: false, reason: e.message };
    }
  }

  // 2. OpenAI Codex OAuth
  if (prov === "OPENAI_CODEX" || (prov === "OPENAI" && conn.authType === "OAUTH")) {
    try {
      const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 401) {
        return { statusCode: 401, isHealthy: false, reason: "Codex OAuth token expired or revoked" };
      }
      if (res.status === 429) {
        return { statusCode: 429, isHealthy: false, reason: "Codex rate limit exceeded" };
      }
      if (!res.ok) {
        return { statusCode: res.status, isHealthy: false, reason: `Codex probe returned HTTP ${res.status}` };
      }
      const data = await res.json().catch(() => ({}));
      const isLimitReached = data.rate_limit?.limit_reached === true;
      if (isLimitReached) {
        return { statusCode: 429, isHealthy: false, reason: "Codex usage limit reached" };
      }
      return { statusCode: 200, isHealthy: true };
    } catch (e: any) {
      return { statusCode: 504, isHealthy: false, reason: e.message || "Codex probe timed out" };
    }
  }

  // 3. OpenAI / Custom OpenAI Compatible
  let targetUrl = conn.baseUrl || "https://api.openai.com/v1";
  if (targetUrl.endsWith("/")) targetUrl = targetUrl.slice(0, -1);
  const modelsUrl = `${targetUrl}/models`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
  };

  if (prov === "ANTHROPIC" || prov === "CLAUDE_CODE") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(modelsUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 401 || res.status === 403) {
      return { statusCode: res.status, isHealthy: false, reason: "API key unauthorized or revoked" };
    }
    if (res.status === 429) {
      return { statusCode: 429, isHealthy: false, reason: "Rate limit / quota exceeded" };
    }
    return { statusCode: 200, isHealthy: true };
  } catch (e: any) {
    // Timeout or network unreachable
    return { statusCode: 504, isHealthy: false, reason: e.message || "Probe request timed out" };
  }
}
