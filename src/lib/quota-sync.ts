import { prisma } from "@/lib/prisma";
import { decryptCredential } from "@/lib/crypto";
import { refreshOAuthToken } from "@/lib/oauth/service";

export interface SyncResult {
  connectionId: string;
  provider: string;
  status: "NORMAL" | "LOW_QUOTA" | "EXHAUSTED" | "ERROR";
  accountEmail?: string | null;
  quotaLimitTokens?: bigint | null;
  quotaUsedTokens?: bigint | null;
  quotaRemainingUsd?: number | null;
  latencyMs?: number;
  error?: string;
}

/**
 * Synchronizes quota and account health for a single provider connection.
 */
export async function syncConnectionQuota(connectionId: string): Promise<SyncResult> {
  const connection = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    return { connectionId, provider: "UNKNOWN", status: "ERROR", error: "Connection not found" };
  }

  const apiKey = connection.apiKeyEncrypted ? decryptCredential(connection.apiKeyEncrypted) : "";
  let status: "NORMAL" | "LOW_QUOTA" | "EXHAUSTED" | "ERROR" = "NORMAL";
  let accountEmail = connection.accountEmail;
  let quotaLimitTokens = connection.quotaLimitTokens;
  let quotaUsedTokens = connection.quotaUsedTokens;
  let quotaRemainingUsd = connection.quotaRemainingUsd ? Number(connection.quotaRemainingUsd) : null;
  let errorMsg: string | undefined;

  const startTime = Date.now();

  try {
    const providerUpper = connection.provider.toUpperCase();

    switch (providerUpper) {
      case "ANTIGRAVITY": {
        let token = connection.accessTokenEnc ? decryptCredential(connection.accessTokenEnc) : "";
        if (!token && connection.refreshTokenEnc) {
          try {
            token = await refreshOAuthToken(connection.id);
          } catch {}
        }
        if (token) {
          let res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401 && connection.refreshTokenEnc) {
            try {
              token = await refreshOAuthToken(connection.id);
              res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                headers: { Authorization: `Bearer ${token}` },
              });
            } catch {}
          }
          if (res.status === 200) {
            const data = await res.json();
            if (data.email) accountEmail = data.email;
            status = "NORMAL";
          } else if (res.status === 429) {
            status = "LOW_QUOTA";
            errorMsg = "Google API rate limit reached";
          } else {
            status = "ERROR";
            errorMsg = `Google OAuth HTTP ${res.status}`;
          }
        } else {
          status = "ERROR";
          errorMsg = "No access or refresh token found";
        }
        break;
      }

      case "OPENAI":
      case "OPENAI_CODEX": {
        let token = apiKey;
        if (connection.authType === "OAUTH") {
          token = connection.accessTokenEnc ? decryptCredential(connection.accessTokenEnc) : "";
          if (!token && connection.refreshTokenEnc) {
            try {
              token = await refreshOAuthToken(connection.id);
            } catch {}
          }
        }
        if (token) {
          if (connection.authType === "OAUTH") {
            let accountId: string | null = null;
            if (token.includes(".")) {
              try {
                const parts = token.split(".");
                const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
                accountId = payload["https://api.openai.com/auth"]?.chatgpt_account_id || null;
              } catch {}
            }
            const headers: Record<string, string> = {
              Authorization: `Bearer ${token}`,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept: "application/json",
            };
            if (accountId) headers["ChatGPT-Account-Id"] = accountId;

            const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
              headers,
              signal: AbortSignal.timeout(6000),
            });

            if (res.status === 200) {
              const data = await res.json();
              if (data.email) accountEmail = data.email;
              const rl = data.rate_limit;
              if (rl?.limit_reached || rl?.allowed === false) {
                status = "LOW_QUOTA";
              } else {
                status = "NORMAL";
              }
            } else if (res.status === 401 && connection.refreshTokenEnc) {
              try {
                token = await refreshOAuthToken(connection.id);
                const retryRes = await fetch("https://chatgpt.com/backend-api/wham/usage", {
                  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                  signal: AbortSignal.timeout(6000),
                });
                status = retryRes.ok ? "NORMAL" : "ERROR";
              } catch {
                status = "ERROR";
                errorMsg = "OAuth token expired and refresh failed";
              }
            } else if (res.status === 429) {
              status = "LOW_QUOTA";
              errorMsg = "Rate limit reached";
            } else {
              status = "ERROR";
              errorMsg = `Codex HTTP ${res.status}`;
            }
          } else {
            const res = await fetch("https://api.openai.com/v1/models", {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (res.status === 200) {
              status = "NORMAL";
            } else if (res.status === 429) {
              status = "LOW_QUOTA";
              errorMsg = "Rate limit or quota reached";
            } else if (res.status === 401 || res.status === 403) {
              status = "ERROR";
              errorMsg = "Invalid or expired credentials";
            } else {
              status = "ERROR";
              errorMsg = `HTTP ${res.status}`;
            }
          }
        } else {
          status = "ERROR";
          errorMsg = "Missing credentials";
        }
        break;
      }

      case "ANTHROPIC":
      case "CLAUDE_CODE": {
        let token = apiKey;
        if (connection.authType === "OAUTH" && connection.accessTokenEnc) {
          token = decryptCredential(connection.accessTokenEnc);
        }
        if (token) {
          try {
            const res = await fetch("https://api.anthropic.com/v1/models", {
              headers: {
                "x-api-key": token,
                "anthropic-version": "2023-06-01",
              },
            });
            if (res.status === 200 || res.status === 404) {
              status = "NORMAL";
            } else if (res.status === 429) {
              status = "LOW_QUOTA";
              errorMsg = "Rate limited";
            } else if (res.status === 401 || res.status === 403) {
              status = "ERROR";
              errorMsg = "Invalid credentials";
            } else {
              status = "NORMAL";
            }
          } catch {
            status = "NORMAL";
          }
        }
        break;
      }

      case "DEEPSEEK": {
        if (apiKey) {
          const res = await fetch("https://api.deepseek.com/user/balance", {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(6000),
          });

          if (res.status === 200) {
            const data = await res.json();
            const info = data.balance_infos?.[0];
            const total = parseFloat(info?.total_balance || "0");
            quotaRemainingUsd = total;
            if (!data.is_available || total <= 0) {
              status = "EXHAUSTED";
              errorMsg = "DeepSeek balance exhausted ($0.00)";
            } else if (total <= 1.0) {
              status = "LOW_QUOTA";
            } else {
              status = "NORMAL";
            }
          } else if (res.status === 401 || res.status === 403) {
            status = "ERROR";
            errorMsg = "Invalid DeepSeek API key";
          } else {
            status = "ERROR";
            errorMsg = `DeepSeek API HTTP ${res.status}`;
          }
        } else {
          status = "ERROR";
          errorMsg = "Missing API key";
        }
        break;
      }

      case "OLLAMA":
      case "OLLAMA_CLOUD": {
        if (apiKey) {
          const res = await fetch("https://ollama.com/api/usage", {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(6000),
          });

          if (res.status === 200) {
            status = "NORMAL";
          } else if (res.status === 429) {
            status = "EXHAUSTED";
            errorMsg = "Ollama Cloud usage limit reached (HTTP 429)";
          } else if (res.status === 401 || res.status === 403) {
            status = "ERROR";
            errorMsg = "Invalid Ollama Cloud API key";
          } else {
            try {
              const tagsRes = await fetch("https://ollama.com/api/tags", {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(5000),
              });
              status = tagsRes.ok ? "NORMAL" : "ERROR";
            } catch {
              status = "NORMAL";
            }
          }
        }
        break;
      }

      case "OPENROUTER": {
        if (apiKey) {
          const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });

          if (res.status === 200) {
            const json = await res.json();
            if (json.data) {
              const usage = json.data.usage || 0;
              const limit = json.data.limit;
              if (limit !== null && limit !== undefined) {
                const remaining = Math.max(0, limit - usage);
                quotaRemainingUsd = remaining;
                if (remaining <= 0) {
                  status = "EXHAUSTED";
                } else if (remaining < 1.0) {
                  status = "LOW_QUOTA";
                } else {
                  status = "NORMAL";
                }
              } else {
                status = "NORMAL";
              }
            }
          } else if (res.status === 401) {
            status = "ERROR";
            errorMsg = "Unauthorized API key";
          } else {
            status = "ERROR";
          }
        }
        break;
      }

      case "GEMINI":
      case "GOOGLE": {
        if (apiKey) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(6000),
            });
            if (res.status === 200) {
              status = "NORMAL";
            } else if (res.status === 429) {
              status = "LOW_QUOTA";
              errorMsg = "Gemini API rate limit reached";
            } else if (res.status === 400 || res.status === 403) {
              status = "ERROR";
              errorMsg = "Invalid Gemini API key or unauthorized";
            } else {
              status = "ERROR";
              errorMsg = `Gemini API HTTP ${res.status}`;
            }
          } catch (err: any) {
            status = "ERROR";
            errorMsg = err.message || "Network error checking Gemini API";
          }
        } else {
          status = "ERROR";
          errorMsg = "Missing API key";
        }
        break;
      }

      case "CUSTOM": {
        if (connection.baseUrl) {
          try {
            const url = `${connection.baseUrl.replace(/\/$/, "")}/models`;
            const res = await fetch(url, {
              headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            });
            status = res.ok ? "NORMAL" : res.status === 429 ? "LOW_QUOTA" : "NORMAL";
          } catch {
            status = "NORMAL";
          }
        }
        break;
      }

      default: {
        status = "NORMAL";
        break;
      }
    }
  } catch (err: any) {
    status = "ERROR";
    errorMsg = err.message || "Network error during sync";
  }

  const latencyMs = Math.max(1, Date.now() - startTime);

  // Update record in database
  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: {
      syncStatus: status,
      accountEmail: accountEmail || connection.accountEmail,
      quotaRemainingUsd: quotaRemainingUsd !== null ? quotaRemainingUsd : connection.quotaRemainingUsd,
      lastSyncedAt: new Date(),
    },
  });

  return {
    connectionId,
    provider: connection.provider,
    status,
    accountEmail,
    quotaRemainingUsd,
    latencyMs,
    error: errorMsg,
  };
}

/**
 * Synchronizes all active provider connections in sequence.
 */
export async function syncAllActiveConnections(): Promise<SyncResult[]> {
  const connections = await prisma.providerConnection.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const results: SyncResult[] = [];
  for (const conn of connections) {
    const res = await syncConnectionQuota(conn.id);
    results.push(res);
  }
  return results;
}
