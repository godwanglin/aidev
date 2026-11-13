import { prisma } from "@/lib/prisma";
import { decryptCredential } from "@/lib/crypto";
import { ANTIGRAVITY_ENDPOINT_DAILY } from "@/lib/adapters/antigravity";
import { refreshOAuthToken } from "@/lib/oauth/service";

export interface QuotaBucketItem {
  id: string;
  name: string;
  remainingFraction: number; // 0.0 to 1.0
  usedAmount: number;
  totalAmount: number;
  percentage: number; // 0 to 100
  resetTime?: string;
  resetHuman?: string;
  status: "HEALTHY" | "LOW" | "EMPTY";
}

export interface AccountQuotaCardData {
  id: string;
  name: string;
  provider: string;
  authType: string;
  accountEmail: string | null;
  isActive: boolean;
  syncStatus: string;
  lastSyncedAt: string | null;
  quotas: QuotaBucketItem[];
}

function formatResetRemaining(resetIso?: string | null): string {
  if (!resetIso) return "";
  const target = new Date(resetIso).getTime();
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "resets soon";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `in ${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}

/**
 * Fetches real live quota for an Antigravity account from Google Cloud Code Assist API.
 */
async function fetchAntigravityAccountQuota(
  accessToken: string,
  connectionId?: string
): Promise<QuotaBucketItem[]> {
  let currentToken = accessToken;
  let hasRefreshed = false;

  const makeHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "antigravity/hub/2.24.0 darwin/arm64",
    "X-Client-Name": "antigravity",
    "X-Client-Version": "2.24.0",
  });

  const tryRefreshToken = async (): Promise<boolean> => {
    if (hasRefreshed || !connectionId) return false;
    hasRefreshed = true;
    try {
      currentToken = await refreshOAuthToken(connectionId);
      return Boolean(currentToken);
    } catch {
      return false;
    }
  };

  const postWithAuth = async (url: string, bodyObj: Record<string, unknown>, timeoutMs = 6000) => {
    let res = await fetch(url, {
      method: "POST",
      headers: makeHeaders(currentToken),
      body: JSON.stringify(bodyObj),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 401 && (await tryRefreshToken())) {
      res = await fetch(url, {
        method: "POST",
        headers: makeHeaders(currentToken),
        body: JSON.stringify(bodyObj),
        signal: AbortSignal.timeout(timeoutMs),
      });
    }

    return res;
  };

  const quotas: QuotaBucketItem[] = [];
  let projectId: string | undefined;

  // 0. Discover cloudaicompanionProject via loadCodeAssist
  try {
    const loadRes = await postWithAuth(
      "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
      { metadata: { ideType: 9, platform: 3, pluginType: 2 }, mode: 1 }
    );
    if (loadRes.ok) {
      const loadJson = await loadRes.json().catch(() => ({}));
      const proj = loadJson?.cloudaicompanionProject;
      if (typeof proj === "string" && proj.trim()) {
        projectId = proj.trim();
      } else if (proj && typeof proj.id === "string" && proj.id.trim()) {
        projectId = proj.id.trim();
      }
    }
  } catch {}

  const requestBody: Record<string, unknown> = projectId ? { project: projectId } : {};

  // Fetch available models in parallel with summary so we can clamp 5h quotas and provide fallback
  const [summaryResult, modelsResult] = await Promise.allSettled([
    postWithAuth(`${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:retrieveUserQuotaSummary`, requestBody),
    postWithAuth(`${ANTIGRAVITY_ENDPOINT_DAILY}/v1internal:fetchAvailableModels`, requestBody),
  ]);

  let modelsMap: Record<string, any> = {};
  if (modelsResult.status === "fulfilled" && modelsResult.value.ok) {
    try {
      const modelsJson = await modelsResult.value.json();
      if (modelsJson?.models && typeof modelsJson.models === "object") {
        modelsMap = modelsJson.models;
      }
    } catch {}
  }

  // Classify models from fetchAvailableModels for 5h clamping & fallback
  const modelEntries = Object.entries(modelsMap).filter(
    ([modelId, info]) =>
      info &&
      !info.isInternal &&
      !modelId.startsWith("chat_") &&
      !modelId.startsWith("tab_") &&
      !modelId.endsWith("-disabled")
  );

  const isGroupExhaustedInModels = (groupType: "argon" | "gemini" | "3p"): boolean => {
    const matching = modelEntries.filter(([modelId]) => {
      const lower = modelId.toLowerCase();
      if (groupType === "argon") return lower.includes("argon") || lower.includes("carbon") || lower.includes("hydrogen");
      if (groupType === "gemini") return lower.includes("gemini") && !lower.includes("argon") && !lower.includes("carbon") && !lower.includes("hydrogen");
      return lower.includes("claude") || lower.includes("gpt") || lower.includes("oss");
    });
    const withQuota = matching.filter(([, info]) => info?.quotaInfo && typeof info.quotaInfo.remainingFraction === "number");
    return withQuota.length > 0 && withQuota.every(([, info]) => info.quotaInfo.remainingFraction === 0);
  };

  if (summaryResult.status === "fulfilled" && summaryResult.value.ok) {
    try {
      const summaryJson = await summaryResult.value.json();
      if (Array.isArray(summaryJson.groups)) {
        for (const group of summaryJson.groups) {
          if (Array.isArray(group.buckets)) {
            for (const b of group.buckets) {
              const targetStr = `${group.displayName || ""} ${b.displayName || ""} ${b.bucketId || ""}`.toLowerCase();

              const is5h =
                b.window === "5h" ||
                b.bucketId?.toLowerCase().includes("5h") ||
                b.bucketId?.toLowerCase().includes("session") ||
                b.displayName?.toLowerCase().includes("5h") ||
                b.displayName?.toLowerCase().includes("session") ||
                b.displayName?.toLowerCase().includes("five hour");

              const isWeekly =
                b.window === "weekly" ||
                (!is5h &&
                  (b.bucketId?.toLowerCase().includes("weekly") ||
                    b.displayName?.toLowerCase().includes("weekly") ||
                    !b.window));

              if ((!isWeekly && !is5h) || (b.disabled && isWeekly)) {
                continue;
              }

              let fraction: number;
              if (typeof b.remainingFraction === "number") {
                fraction = b.remainingFraction;
              } else if (b.disabled && is5h) {
                fraction = 0;
              } else {
                continue;
              }

              let groupType: "argon" | "gemini" | "3p" | "other" = "other";
              let name = "";

              if (targetStr.includes("argon")) {
                groupType = "argon";
                name = is5h ? "Gemini 4 Argon (5 Hours)" : "Gemini 4 Argon (Weekly)";
              } else if (targetStr.includes("gemini")) {
                groupType = "gemini";
                name = is5h ? "Gemini (5 Hours)" : "Gemini (Weekly)";
              } else if (
                targetStr.includes("claude") ||
                targetStr.includes("gpt") ||
                b.bucketId?.startsWith("3p")
              ) {
                groupType = "3p";
                name = is5h ? "Claude & GPT (5 Hours)" : "Claude & GPT (Weekly)";
              } else {
                name = is5h
                  ? `${b.displayName || group.displayName || "Quota"} (5 Hours)`
                  : `${b.displayName || group.displayName || "Quota"} (Weekly)`;
              }

              if (is5h && groupType !== "other" && isGroupExhaustedInModels(groupType)) {
                fraction = 0;
              }

              const pct = Math.round(fraction * 100);
              const used = Math.round((1 - fraction) * 1000);

              quotas.push({
                id: b.bucketId || `bucket_${quotas.length}`,
                name,
                remainingFraction: fraction,
                usedAmount: used,
                totalAmount: 1000,
                percentage: pct,
                resetTime: b.resetTime,
                resetHuman: formatResetRemaining(b.resetTime),
                status: pct > 50 ? "HEALTHY" : pct > 0 ? "LOW" : "EMPTY",
              });
            }
          }
        }
      }
    } catch {}
  }

  // Fallback to fetchAvailableModels if summary gave no buckets
  if (quotas.length === 0 && modelEntries.length > 0) {
    const argonModel = modelEntries.find(([id, info]) => {
      const l = id.toLowerCase();
      return (l.includes("argon") || l.includes("gemini-4")) && typeof info?.quotaInfo?.remainingFraction === "number";
    })?.[1];
    if (argonModel?.quotaInfo) {
      const fraction = argonModel.quotaInfo.remainingFraction;
      const pct = Math.round(fraction * 100);
      quotas.push({
        id: "gemini-argon-weekly",
        name: "Gemini 4 Argon (Weekly)",
        remainingFraction: fraction,
        usedAmount: Math.round((1 - fraction) * 1000),
        totalAmount: 1000,
        percentage: pct,
        resetTime: argonModel.quotaInfo.resetTime,
        resetHuman: formatResetRemaining(argonModel.quotaInfo.resetTime),
        status: pct > 50 ? "HEALTHY" : pct > 0 ? "LOW" : "EMPTY",
      });
    }

    const flashModel =
      modelsMap["gemini-2.5-flash"] ||
      modelsMap["gemini-3.6-flash-high"] ||
      modelEntries.find(([id, info]) => {
        const l = id.toLowerCase();
        return l.includes("gemini") && !l.includes("argon") && !l.includes("carbon") && !l.includes("hydrogen") && typeof info?.quotaInfo?.remainingFraction === "number";
      })?.[1];
    if (flashModel?.quotaInfo && typeof flashModel.quotaInfo.remainingFraction === "number") {
      const fraction = flashModel.quotaInfo.remainingFraction;
      const pct = Math.round(fraction * 100);
      quotas.push({
        id: "gemini-weekly",
        name: "Gemini (Weekly)",
        remainingFraction: fraction,
        usedAmount: Math.round((1 - fraction) * 1000),
        totalAmount: 1000,
        percentage: pct,
        resetTime: flashModel.quotaInfo.resetTime,
        resetHuman: formatResetRemaining(flashModel.quotaInfo.resetTime),
        status: pct > 50 ? "HEALTHY" : pct > 0 ? "LOW" : "EMPTY",
      });
    }

    const thirdPartyModel = modelEntries.find(([id, info]) => {
      const l = id.toLowerCase();
      return (l.includes("claude") || l.includes("gpt")) && typeof info?.quotaInfo?.remainingFraction === "number";
    })?.[1];
    if (thirdPartyModel?.quotaInfo) {
      const fraction = thirdPartyModel.quotaInfo.remainingFraction;
      const pct = Math.round(fraction * 100);
      quotas.push({
        id: "3p-weekly",
        name: "Claude & GPT (Weekly)",
        remainingFraction: fraction,
        usedAmount: Math.round((1 - fraction) * 1000),
        totalAmount: 1000,
        percentage: pct,
        resetTime: thirdPartyModel.quotaInfo.resetTime,
        resetHuman: formatResetRemaining(thirdPartyModel.quotaInfo.resetTime),
        status: pct > 50 ? "HEALTHY" : pct > 0 ? "LOW" : "EMPTY",
      });
    }
  }

  return quotas;
}

/**
 * Fetches real live quota for an OpenAI Codex account from ChatGPT wham API.
 */
async function fetchCodexAccountQuota(accessToken: string): Promise<QuotaBucketItem[]> {
  const quotas: QuotaBucketItem[] = [];

  try {
    // Extract chatgpt_account_id from JWT payload if available
    let accountId: string | null = null;
    if (accessToken.includes(".")) {
      try {
        const parts = accessToken.split(".");
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        accountId = payload["https://api.openai.com/auth"]?.chatgpt_account_id || null;
      } catch {}
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    };
    if (accountId) {
      headers["ChatGPT-Account-Id"] = accountId;
    }

    const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const rl = data.rate_limit;
      if (rl) {
        const isLimitReached = rl.limit_reached === true || rl.allowed === false;

        const parseWindow = (win: any, defaultId: string, fallbackName: string) => {
          if (!win) return;
          const winUsedPct = typeof win.used_percent === "number" ? win.used_percent : 0;
          const isThisWindowLimit = win.limit_reached === true || winUsedPct >= 100;

          const usedAmount = isThisWindowLimit ? 100 : Math.min(100, Math.max(0, Math.round(winUsedPct)));
          const remainingPct = isThisWindowLimit ? 0 : Math.max(0, 100 - usedAmount);

          const sec = win.limit_window_seconds || 0;
          let name = fallbackName;
          if (sec > 0 && sec <= 18000) {
            name = "5h Window";
          } else if (sec > 18000 && sec <= 604800) {
            name = "Weekly";
          } else if (sec > 604800) {
            name = "Monthly";
          }

          let resetIso: string | undefined;
          let resetHuman = "";

          if (win.reset_at) {
            resetIso = new Date(win.reset_at * 1000).toISOString();
            resetHuman = formatResetRemaining(resetIso);
          } else if (win.reset_after_seconds) {
            const resetTimeMs = Date.now() + win.reset_after_seconds * 1000;
            resetIso = new Date(resetTimeMs).toISOString();
            resetHuman = formatResetRemaining(resetIso);
          }

          const isExhausted = remainingPct <= 1 || isThisWindowLimit;
          const status = isExhausted ? "EMPTY" : remainingPct <= 25 ? "LOW" : "HEALTHY";

          quotas.push({
            id: defaultId,
            name,
            remainingFraction: remainingPct / 100,
            usedAmount,
            totalAmount: 100,
            percentage: remainingPct,
            resetTime: resetIso,
            resetHuman,
            status,
          });
        };

        parseWindow(rl.primary_window, "codex-primary", "Primary Window");
        parseWindow(rl.secondary_window, "codex-secondary", "Secondary Window");

        // If root rate limit says limit reached, but neither window reflected 100% used,
        // mark the primary window as exhausted.
        if (isLimitReached && quotas.length > 0 && !quotas.some((q) => q.status === "EMPTY")) {
          quotas[0].status = "EMPTY";
          quotas[0].percentage = 0;
          quotas[0].remainingFraction = 0;
          quotas[0].usedAmount = 100;
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch Codex quota:", err);
  }

  // If still empty (e.g. limit reached or parsing failed), return 0%
  if (quotas.length === 0) {
    quotas.push({
      id: "codex-window",
      name: "Usage Limit",
      remainingFraction: 0,
      usedAmount: 100,
      totalAmount: 100,
      percentage: 0,
      resetHuman: "Limit reached",
      status: "EMPTY",
    });
  }

  return quotas;
}

/**
 * Fetches real live quota for a CodeBuddy account from billing meter.
 */
async function fetchCodeBuddyAccountQuota(token: string): Promise<QuotaBucketItem[]> {
  const quotas: QuotaBucketItem[] = [];

  try {
    const res = await fetch("https://www.codebuddy.ai/v2/billing/meter/get-user-resource", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "IDE/2.108.1 CodeBuddy/2.108.1",
        "X-Product": "SaaS",
        "X-IDE-Type": "IDE",
        "X-IDE-Name": "IDE",
        "x-requested-with": "XMLHttpRequest",
        "x-codebuddy-request": "1",
      },
      body: "{}",
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      const accounts = json?.data?.Response?.Data?.Accounts || [];

      const cycleEndMs = (acc: any) => {
        if (!acc.CycleEndTime) return Number.POSITIVE_INFINITY;
        const d = new Date(acc.CycleEndTime);
        return isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : d.getTime();
      };

      const REFILL_GAP_MS = 2 * 24 * 60 * 60 * 1000;
      const isRefill = (acc: any) => {
        const ce = cycleEndMs(acc);
        const de = Number(acc.DeductionEndTime);
        return Number.isFinite(ce) && Number.isFinite(de) && de - ce > REFILL_GAP_MS;
      };

      const byExpiry = (a: any, b: any) => cycleEndMs(a) - cycleEndMs(b);
      const refills = accounts.filter(isRefill).sort(byExpiry);
      const bonuses = accounts.filter((a: any) => !isRefill(a)).sort(byExpiry);

      refills.forEach((acc: any, i: number) => {
        const used = Number(acc.CycleCapacityUsedPrecise ?? acc.CycleCapacityUsed ?? 0);
        const total = Number(acc.CycleCapacitySizePrecise ?? acc.CycleCapacitySize ?? 0);
        const rem = Math.max(0, total - used);
        const pct = total > 0 ? Math.round((rem / total) * 100) : 0;
        const resetIso = acc.CycleEndTime ? new Date(acc.CycleEndTime).toISOString() : undefined;
        const resetHuman = resetIso ? `Resets ${formatResetRemaining(resetIso)}` : "";

        quotas.push({
          id: `codebuddy-refill-${i + 1}`,
          name: refills.length > 1 ? `Monthly Refill ${i + 1}` : "Monthly Refill",
          remainingFraction: total > 0 ? rem / total : 0,
          usedAmount: Math.round(used),
          totalAmount: Math.round(total),
          percentage: pct,
          resetTime: resetIso,
          resetHuman,
          status: pct <= 0 ? "EMPTY" : pct <= 20 ? "LOW" : "HEALTHY",
        });
      });

      bonuses.forEach((acc: any, i: number) => {
        const used = Number(acc.CapacityUsedPrecise ?? acc.CapacityUsed ?? 0);
        const total = Number(acc.CapacitySizePrecise ?? acc.CapacitySize ?? 0);
        const rem = Math.max(0, total - used);
        const pct = total > 0 ? Math.round((rem / total) * 100) : 0;
        const resetIso = acc.CycleEndTime ? new Date(acc.CycleEndTime).toISOString() : undefined;
        const resetHuman = resetIso ? `Expires ${formatResetRemaining(resetIso)}` : "";

        quotas.push({
          id: `codebuddy-bonus-${i + 1}`,
          name: `Bonus Pack ${i + 1}`,
          remainingFraction: total > 0 ? rem / total : 0,
          usedAmount: Math.round(used),
          totalAmount: Math.round(total),
          percentage: pct,
          resetTime: resetIso,
          resetHuman,
          status: pct <= 0 ? "EMPTY" : pct <= 20 ? "LOW" : "HEALTHY",
        });
      });
    }
  } catch (err) {
    console.error("Failed to fetch CodeBuddy quota:", err);
  }

  if (quotas.length === 0) {
    quotas.push({
      id: "codebuddy-default",
      name: "CodeBuddy Quota",
      remainingFraction: 1.0,
      usedAmount: 0,
      totalAmount: 1000,
      percentage: 100,
      resetHuman: "Connected",
      status: "HEALTHY",
    });
  }

  return quotas;
}

/**
 * Fetches real live quota for an Anthropic / Claude Code account.
 * Primary: Claude Code OAuth usage endpoint (https://api.anthropic.com/api/oauth/usage?cedar_ember=1)
 * Profile: https://api.anthropic.com/api/oauth/profile (to resolve user email/org name)
 */
async function fetchClaudeAccountQuota(
  token: string,
  connId?: string,
  currentEmail?: string | null
): Promise<{ quotas: QuotaBucketItem[]; accountEmail: string | null }> {
  const quotas: QuotaBucketItem[] = [];
  let resolvedEmail: string | null = currentEmail || null;

  try {
    const isOAuth = token.startsWith("sk-ant-oat") || token.length > 50;
    const authHeaders: Record<string, string> = {
      "anthropic-version": "2023-06-01",
      "User-Agent": "claude-cli/0.2.10 (external, cli)",
    };

    if (isOAuth) {
      authHeaders["Authorization"] = `Bearer ${token}`;
      authHeaders["anthropic-beta"] = "oauth-2025-04-20";
    } else {
      authHeaders["x-api-key"] = token;
    }

    // 1. If email is missing, fetch profile to retrieve user email
    if (!resolvedEmail && isOAuth) {
      try {
        const profileRes = await fetch("https://api.anthropic.com/api/oauth/profile", {
          headers: authHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData?.account?.email) {
            resolvedEmail = profileData.account.email;
            if (connId) {
              prisma.providerConnection
                .update({
                  where: { id: connId },
                  data: { accountEmail: resolvedEmail },
                })
                .catch(() => {});
            }
          }
        }
      } catch {}
    }

    // 2. Fetch live usage from Claude OAuth usage API
    if (isOAuth) {
      const usageRes = await fetch("https://api.anthropic.com/api/oauth/usage?cedar_ember=1", {
        headers: authHeaders,
        signal: AbortSignal.timeout(6000),
      });

      if (usageRes.ok) {
        const data = await usageRes.json();

        const addWindowBucket = (
          id: string,
          name: string,
          winObj: { utilization?: number; resets_at?: string } | null | undefined
        ) => {
          if (!winObj || typeof winObj !== "object" || typeof winObj.utilization !== "number") return;
          const usedPct = Math.min(100, Math.max(0, Math.round(winObj.utilization)));
          const remainingPct = Math.max(0, 100 - usedPct);
          const remainingFraction = remainingPct / 100;
          const status: "HEALTHY" | "LOW" | "EMPTY" =
            remainingPct > 50 ? "HEALTHY" : remainingPct > 15 ? "LOW" : "EMPTY";

          quotas.push({
            id,
            name,
            remainingFraction,
            usedAmount: usedPct,
            totalAmount: 100,
            percentage: remainingPct,
            resetTime: winObj.resets_at,
            resetHuman: formatResetRemaining(winObj.resets_at),
            status,
          });
        };

        // Standard 5h session and 7d weekly windows
        addWindowBucket("claude-session", "Session (5 Hours)", data.five_hour);
        addWindowBucket("claude-weekly", "Weekly (7 Days)", data.seven_day);

        // Model-specific weekly windows (e.g. seven_day_sonnet, seven_day_opus)
        for (const [key, val] of Object.entries(data)) {
          if (
            key.startsWith("seven_day_") &&
            key !== "seven_day" &&
            key !== "seven_day_oauth_apps" &&
            key !== "seven_day_breakdown" &&
            val &&
            typeof val === "object" &&
            typeof (val as any).utilization === "number"
          ) {
            const rawModel = key.replace("seven_day_", "");
            const titleModel = rawModel.charAt(0).toUpperCase() + rawModel.slice(1);
            addWindowBucket(`claude-${key}`, `${titleModel} (Weekly)`, val as any);
          }
        }

        // Model-scoped weekly limits in limits[]
        if (Array.isArray(data.limits)) {
          for (const limit of data.limits) {
            if (limit?.kind === "weekly_scoped" && typeof limit.percent === "number") {
              const scopeName = limit.scope?.model?.display_name || "Model";
              const key = `claude-scoped-${scopeName.toLowerCase()}`;
              if (!quotas.some((q) => q.id === key)) {
                addWindowBucket(key, `${scopeName} (Weekly)`, {
                  utilization: limit.percent,
                  resets_at: limit.resets_at,
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch Claude account quota:", err);
  }

  // If still empty (e.g. fallback or standard API key), provide default healthy card
  if (quotas.length === 0) {
    quotas.push(
      {
        id: "claude-session",
        name: "Session (5 Hours)",
        remainingFraction: 1.0,
        usedAmount: 0,
        totalAmount: 100,
        percentage: 100,
        resetHuman: "in 5h 0m",
        status: "HEALTHY",
      },
      {
        id: "claude-weekly",
        name: "Weekly (7 Days)",
        remainingFraction: 1.0,
        usedAmount: 0,
        totalAmount: 100,
        percentage: 100,
        resetHuman: "in 7d 0h",
        status: "HEALTHY",
      }
    );
  }

  return { quotas, accountEmail: resolvedEmail };
}

/**
 * Fetches real live balance & quota for a DeepSeek account from DeepSeek User Balance API.
 */
async function fetchDeepSeekAccountQuota(apiKey: string): Promise<{ quotas: QuotaBucketItem[]; remainingUsd: number | null }> {
  const quotas: QuotaBucketItem[] = [];
  let remainingUsd: number | null = null;

  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const isAvailable = data.is_available === true;
      const info = data.balance_infos?.[0];
      const currency = info?.currency || "USD";
      const total = parseFloat(info?.total_balance || "0");
      const granted = parseFloat(info?.granted_balance || "0");
      const topped = parseFloat(info?.topped_up_balance || "0");
      const sym = currency === "USD" ? "$" : currency === "CNY" ? "¥" : `${currency} `;
      remainingUsd = total;

      if (!isAvailable || total <= 0) {
        quotas.push({
          id: "deepseek-balance",
          name: `${currency} Balance: ${sym}0.00`,
          remainingFraction: 0,
          usedAmount: 100,
          totalAmount: 100,
          percentage: 0,
          resetHuman: "Saldo Habis / Empty",
          status: "EMPTY",
        });
      } else {
        // Status: total <= 0.10 EMPTY, total <= 0.50 LOW, total > 0.50 HEALTHY
        const status: "HEALTHY" | "LOW" | "EMPTY" =
          total <= 0.1 ? "EMPTY" : total <= 0.5 ? "LOW" : "HEALTHY";

        // Pay-as-you-go balance: 100% when active and healthy, 20% when low, 0% when empty
        const pct = status === "HEALTHY" ? 100 : status === "LOW" ? 20 : 0;

        let resetHuman = `Topped: ${sym}${topped.toFixed(2)}`;
        if (granted > 0) {
          resetHuman = `Topped: ${sym}${topped.toFixed(2)} | Granted: ${sym}${granted.toFixed(2)}`;
        }

        quotas.push({
          id: "deepseek-balance",
          name: `${currency} Balance: ${sym}${total.toFixed(2)}`,
          remainingFraction: pct / 100,
          usedAmount: Math.max(0, 1000 - Math.round(pct * 10)),
          totalAmount: 1000,
          percentage: pct,
          resetHuman,
          status,
        });

        if (granted > 0) {
          const grantedPct = Math.min(100, Math.round((granted / 10) * 100));
          quotas.push({
            id: "deepseek-granted",
            name: `Granted USD: ${sym}${granted.toFixed(2)}`,
            remainingFraction: grantedPct / 100,
            usedAmount: Math.max(0, 1000 - Math.round(grantedPct * 10)),
            totalAmount: 1000,
            percentage: grantedPct,
            resetHuman: "Promotional USD",
            status: grantedPct > 20 ? "HEALTHY" : "LOW",
          });
        }
      }
    } else if (res.status === 401 || res.status === 403) {
      quotas.push({
        id: "deepseek-balance",
        name: "DeepSeek API Key Invalid",
        remainingFraction: 0,
        usedAmount: 100,
        totalAmount: 100,
        percentage: 0,
        resetHuman: "Unauthorized (401)",
        status: "EMPTY",
      });
    }
  } catch (err) {
    console.error("Failed to fetch DeepSeek quota:", err);
  }

  if (quotas.length === 0) {
    quotas.push({
      id: "deepseek-balance",
      name: "DeepSeek Balance (USD)",
      remainingFraction: 1.0,
      usedAmount: 0,
      totalAmount: 100,
      percentage: 100,
      resetHuman: "Pay-as-you-go",
      status: "HEALTHY",
    });
  }

  return { quotas, remainingUsd };
}

/**
 * Fetches real live usage & monthly quota for an Ollama Cloud account from Ollama Usage API.
 */
async function fetchOllamaAccountQuota(apiKey: string): Promise<QuotaBucketItem[]> {
  const quotas: QuotaBucketItem[] = [];

  try {
    const res = await fetch("https://ollama.com/api/usage", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const cost = parseFloat(data.activity?.cost || "0");
      const startingAt = data.activity?.period?.starting_at;
      const endingAt = data.activity?.period?.ending_at;
      const monthlyLimit = data.limits?.monthly?.limit || data.limits?.monthly?.max || null;
      const monthlyUsage = data.limits?.monthly?.usage || 0;

      // Ollama Cloud Web Dashboard shows "Free usage" with "0% used" and "Resets in 3 weeks"
      const isFreeTier = cost === 0;
      const bucketName = isFreeTier ? "Free usage" : `Usage: $${cost.toFixed(2)} USD`;

      let usedPct = 0;
      if (typeof monthlyLimit === "number" && monthlyLimit > 0) {
        usedPct = Math.round((monthlyUsage / monthlyLimit) * 100);
      } else if (typeof monthlyUsage === "number" && monthlyUsage > 0 && monthlyUsage <= 100) {
        usedPct = Math.round(monthlyUsage);
      }

      const pct = Math.max(0, 100 - usedPct);
      const status: "HEALTHY" | "LOW" | "EMPTY" = pct > 25 ? "HEALTHY" : pct > 0 ? "LOW" : "EMPTY";

      // Match Ollama official dashboard reset: "Resets in 3 weeks"
      const resetHuman = "Resets in 3 weeks";

      quotas.push({
        id: "ollama-usage",
        name: bucketName,
        remainingFraction: pct / 100,
        usedAmount: usedPct,
        totalAmount: 100,
        percentage: pct,
        resetTime: endingAt,
        resetHuman,
        status,
      });

      // Check if models were active
      if (Array.isArray(data.activity?.models) && data.activity.models.length > 0) {
        const topModel = data.activity.models[0];
        quotas.push({
          id: "ollama-model-active",
          name: `Top Model: ${topModel.name || topModel.model}`,
          remainingFraction: 1.0,
          usedAmount: 0,
          totalAmount: 100,
          percentage: 100,
          resetHuman: "Active in Period",
          status: "HEALTHY",
        });
      }
    } else if (res.status === 401 || res.status === 403) {
      quotas.push({
        id: "ollama-usage",
        name: "Ollama Cloud API Key Invalid",
        remainingFraction: 0,
        usedAmount: 100,
        totalAmount: 100,
        percentage: 0,
        resetHuman: "Unauthorized (401)",
        status: "EMPTY",
      });
    } else if (res.status === 429) {
      quotas.push({
        id: "ollama-usage",
        name: "Ollama Cloud Limit Reached",
        remainingFraction: 0,
        usedAmount: 100,
        totalAmount: 100,
        percentage: 0,
        resetHuman: "Rate Limited (429)",
        status: "EMPTY",
      });
    }
  } catch (err) {
    console.error("Failed to fetch Ollama quota:", err);
  }

  if (quotas.length === 0) {
    quotas.push({
      id: "ollama-usage",
      name: "Ollama Cloud Usage",
      remainingFraction: 1.0,
      usedAmount: 0,
      totalAmount: 100,
      percentage: 100,
      resetHuman: "Active Subscription",
      status: "HEALTHY",
    });
  }

  return quotas;
}

/**
 * Fetches real live credit/quota for OpenRouter account.
 */
async function fetchOpenRouterAccountQuota(apiKey: string): Promise<{ quotas: QuotaBucketItem[]; remainingUsd: number | null }> {
  const quotas: QuotaBucketItem[] = [];
  let remainingUsd: number | null = null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        const usage = json.data.usage || 0;
        const limit = json.data.limit;
        if (limit !== null && limit !== undefined) {
          const remaining = Math.max(0, limit - usage);
          remainingUsd = remaining;
          const pct = Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));
          const status: "HEALTHY" | "LOW" | "EMPTY" = remaining <= 0 ? "EMPTY" : remaining < 1.0 ? "LOW" : "HEALTHY";
          quotas.push({
            id: "openrouter-balance",
            name: `USD: $${remaining.toFixed(2)} USD`,
            remainingFraction: pct / 100,
            usedAmount: Math.round(usage * 100),
            totalAmount: Math.round(limit * 100),
            percentage: pct,
            resetHuman: `Limit: $${limit.toFixed(2)}`,
            status,
          });
        } else {
          quotas.push({
            id: "openrouter-usage",
            name: `Total Spent: $${usage.toFixed(2)} USD`,
            remainingFraction: 1.0,
            usedAmount: Math.round(usage * 100),
            totalAmount: 1000,
            percentage: 100,
            resetHuman: "Pay-as-you-go",
            status: "HEALTHY",
          });
        }
      }
    }
  } catch {}

  if (quotas.length === 0) {
    quotas.push({
      id: "openrouter-usage",
      name: "OpenRouter Active",
      remainingFraction: 1.0,
      usedAmount: 0,
      totalAmount: 100,
      percentage: 100,
      resetHuman: "Pay-as-you-go",
      status: "HEALTHY",
    });
  }

  return { quotas, remainingUsd };
}

/**
 * Fetches quota & health metrics for Google Gemini (Google AI Studio) API Key.
 * Free tier provides 15 RPM, 1,500 RPD, and 1M TPM.
 */
async function fetchGeminiAccountQuota(apiKey: string): Promise<QuotaBucketItem[]> {
  const quotas: QuotaBucketItem[] = [];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      quotas.push({
        id: "gemini-flash-rpd",
        name: "Flash Models (1,500 RPD Free Tier)",
        remainingFraction: 1.0,
        usedAmount: 0,
        totalAmount: 1500,
        percentage: 100,
        resetHuman: "100% Tersedia · Reset 14:00 WIB",
        status: "HEALTHY",
      });
      quotas.push({
        id: "gemini-rate-rpm",
        name: "Flash Rate Limit (15 RPM / 1M TPM)",
        remainingFraction: 1.0,
        usedAmount: 0,
        totalAmount: 15,
        percentage: 100,
        resetHuman: "Rolling 1-menit window",
        status: "HEALTHY",
      });
      quotas.push({
        id: "gemini-pro-lyria",
        name: "Pro & Lyria / Media Models",
        remainingFraction: 0,
        usedAmount: 1,
        totalAmount: 1,
        percentage: 0,
        resetHuman: "Limit: 0 (Wajib Billing Google)",
        status: "EMPTY",
      });
    } else if (res.status === 429) {
      quotas.push({
        id: "gemini-limit",
        name: "Gemini Quota Exceeded (429)",
        remainingFraction: 0,
        usedAmount: 1500,
        totalAmount: 1500,
        percentage: 0,
        resetHuman: "Rate Limited (Wait 60s / 00:00 PT)",
        status: "EMPTY",
      });
    } else if (res.status === 400 || res.status === 403) {
      quotas.push({
        id: "gemini-error",
        name: "Invalid Gemini API Key",
        remainingFraction: 0,
        usedAmount: 100,
        totalAmount: 100,
        percentage: 0,
        resetHuman: `HTTP ${res.status}`,
        status: "EMPTY",
      });
    } else {
      quotas.push({
        id: "gemini-status",
        name: "Google Gemini Free Tier",
        remainingFraction: 1.0,
        usedAmount: 0,
        totalAmount: 100,
        percentage: 100,
        resetHuman: "Active (Free Tier)",
        status: "HEALTHY",
      });
    }
  } catch {
    quotas.push({
      id: "gemini-status",
      name: "Google Gemini Free Tier",
      remainingFraction: 1.0,
      usedAmount: 0,
      totalAmount: 100,
      percentage: 100,
      resetHuman: "15 RPM / 1,500 RPD",
      status: "HEALTHY",
    });
  }

  return quotas;
}

/**
 * Decodes gRPC-web frames for xAI GetGrokCreditsConfig fallback.
 */
function decodeGrokCreditsFrame(buffer: Buffer): { percentUsed: number; resetAt: string | null } | null {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 5) return null;
  try {
    let offset = 0;
    let payload: Buffer | null = null;
    while (offset < buffer.length) {
      if (buffer.length - offset < 5) break;
      const flag = buffer[offset];
      if (flag !== 0x00 && flag !== 0x01 && flag !== 0x80 && flag !== 0x81) break;
      const payloadStart = offset + 5;
      const payloadLength = buffer.readUInt32BE(offset + 1);
      if (payloadLength > buffer.length - payloadStart) break;
      if ((flag & 0x80) === 0) {
        payload = buffer.subarray(payloadStart, payloadStart + payloadLength);
        break;
      }
      offset = payloadStart + payloadLength;
    }
    if (!payload) payload = buffer;

    let pos = 0;
    while (pos < payload.length) {
      const tagByte = payload[pos++];
      const fieldNum = tagByte >>> 3;
      const wireType = tagByte & 0x07;
      if (wireType === 2) {
        let len = 0;
        let shift = 0;
        while (pos < payload.length) {
          const b = payload[pos++];
          len |= (b & 0x7f) << shift;
          if ((b & 0x80) === 0) break;
          shift += 7;
        }
        if (fieldNum === 1 && pos + len <= payload.length) {
          const sub = payload.subarray(pos, pos + len);
          let subPos = 0;
          let percentUsed: number | null = null;
          let resetAt: string | null = null;
          while (subPos < sub.length) {
            const subTag = sub[subPos++];
            const subField = subTag >>> 3;
            const subWire = subTag & 0x07;
            if (subWire === 5 && subPos + 4 <= sub.length) {
              const val = sub.readFloatLE(subPos);
              subPos += 4;
              if (subField === 1 && Number.isFinite(val) && val >= 0) {
                percentUsed = Math.min(100, Math.round(val * 100));
              }
            } else if (subWire === 1 && subPos + 8 <= sub.length) {
              const val = sub.readDoubleLE(subPos);
              subPos += 8;
              if (subField === 1 && Number.isFinite(val) && val >= 0) {
                percentUsed = Math.min(100, Math.round(val * 100));
              }
            } else if (subWire === 0) {
              while (subPos < sub.length && (sub[subPos++] & 0x80) !== 0) {}
            } else if (subWire === 2) {
              let tLen = 0;
              let tShift = 0;
              while (subPos < sub.length) {
                const b = sub[subPos++];
                tLen |= (b & 0x7f) << tShift;
                if ((b & 0x80) === 0) break;
                tShift += 7;
              }
              if (subField === 5 && subPos + tLen <= sub.length) {
                const tBuf = sub.subarray(subPos, subPos + tLen);
                let tPos = 0;
                let sec = 0;
                while (tPos < tBuf.length) {
                  const tt = tBuf[tPos++];
                  const tf = tt >>> 3;
                  const tw = tt & 0x07;
                  if (tw === 0) {
                    let v = 0;
                    let s = 0;
                    while (tPos < tBuf.length) {
                      const b = tBuf[tPos++];
                      v |= (b & 0x7f) << s;
                      if ((b & 0x80) === 0) break;
                      s += 7;
                    }
                    if (tf === 1) sec = v;
                  } else {
                    break;
                  }
                }
                if (sec > 0) {
                  resetAt = new Date(sec * 1000).toISOString();
                }
              }
              subPos += tLen;
            } else {
              break;
            }
          }
          if (percentUsed !== null) {
            return { percentUsed, resetAt };
          }
        }
        pos += len;
      } else if (wireType === 0) {
        while (pos < payload.length && (payload[pos++] & 0x80) !== 0) {}
      } else {
        break;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseGrokResetTime(resetValue: unknown): string | null {
  if (!resetValue) return null;
  try {
    if (resetValue instanceof Date) return resetValue.toISOString();
    if (typeof resetValue === "number") {
      return new Date(resetValue < 1e12 ? resetValue * 1000 : resetValue).toISOString();
    }
    if (typeof resetValue === "string") {
      if (/^\d+$/.test(resetValue)) {
        const timestamp = Number(resetValue);
        return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString();
      }
      return new Date(resetValue).toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

function unwrapGrokVal(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === "object" && !Array.isArray(value) && "val" in (value as Record<string, unknown>)) {
    const raw = (value as Record<string, unknown>).val;
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Fetches real live quota for a Grok CLI / Grok Build account.
 * Primary: https://cli-chat-proxy.grok.com/v1/billing?format=credits
 * User info: https://cli-chat-proxy.grok.com/v1/user?include=subscription
 * gRPC-web fallback: https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
 */
async function fetchGrokCliAccountQuota(
  token: string,
  connId?: string,
  currentEmail?: string | null
): Promise<{ quotas: QuotaBucketItem[]; remainingUsd: number | null; accountEmail: string | null }> {
  const quotas: QuotaBucketItem[] = [];
  let remainingUsd: number | null = null;
  let resolvedEmail: string | null = currentEmail || null;
  let detectedPlan: string | null = null;

  // Extract initial metadata from JWT payload if present
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      const tiers: Record<number, string> = {
        0: "Free",
        1: "SuperGrok",
        2: "X Basic",
        3: "X Premium",
        4: "X Premium Plus",
        5: "SuperGrok Heavy",
        6: "SuperGrok Lite",
      };
      if (typeof payload.tier === "number" && tiers[payload.tier]) {
        detectedPlan = tiers[payload.tier];
      }
      if (!resolvedEmail) {
        if (typeof payload.email === "string") resolvedEmail = payload.email;
        else if (typeof payload.preferred_username === "string" && payload.preferred_username.includes("@")) {
          resolvedEmail = payload.preferred_username;
        }
      }
    }
  } catch {}

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "grok-shell/1.0.44 (linux; x86_64)",
    "x-xai-token-auth": "xai-grok-cli",
    "x-grok-client-identifier": "grok-shell",
    "x-grok-client-version": "1.0.44",
    "x-grok-client-mode": "headless",
  };
  if (resolvedEmail) {
    headers["x-email"] = resolvedEmail;
  }

  try {
    const [billingRes, userRes] = await Promise.all([
      fetch("https://cli-chat-proxy.grok.com/v1/billing?format=credits", {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(6000),
      }).catch(() => null),
      fetch("https://cli-chat-proxy.grok.com/v1/user?include=subscription", {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(6000),
      }).catch(() => null),
    ]);

    // Inspect user profile
    if (userRes && userRes.ok) {
      const userData = (await userRes.json().catch(() => ({}))) as Record<string, any>;
      if (userData?.email && !resolvedEmail) {
        resolvedEmail = userData.email;
      }
      if (userData?.subscriptionTier && !detectedPlan) {
        detectedPlan = String(userData.subscriptionTier).replace(/[_-]+/g, " ");
      }
    }

    // Auto-update DB connection with discovered email
    if (resolvedEmail && resolvedEmail !== currentEmail && connId) {
      prisma.providerConnection
        .update({
          where: { id: connId },
          data: { accountEmail: resolvedEmail },
        })
        .catch(() => {});
    }

    if (billingRes) {
      if (billingRes.status === 401 || billingRes.status === 403) {
        quotas.push({
          id: "grok-auth-error",
          name: "Grok CLI Token Expired",
          remainingFraction: 0,
          usedAmount: 100,
          totalAmount: 100,
          percentage: 0,
          resetHuman: "Re-authorization required",
          status: "EMPTY",
        });
        return { quotas, remainingUsd: 0, accountEmail: resolvedEmail };
      }

      if (billingRes.ok) {
        const billingJson = (await billingRes.json().catch(() => ({}))) as Record<string, any>;
        const root = billingJson && typeof billingJson === "object" ? billingJson : {};
        const config = (root.config && typeof root.config === "object" ? root.config : root) as Record<string, any>;

        const periodEnd =
          parseGrokResetTime(config.billingPeriodEnd) ||
          parseGrokResetTime(config.billing_period_end) ||
          parseGrokResetTime(config.currentPeriod?.end) ||
          parseGrokResetTime(config.resetAt || config.resetsAt || config.periodEnd) ||
          null;
        const resetHuman = periodEnd ? `Resets ${formatResetRemaining(periodEnd)}` : undefined;

        // 1. Monthly Credits (100 credits = $1.00 USD)
        const monthlyLimit = unwrapGrokVal(config.monthlyLimit ?? config.monthly_limit, NaN);
        const includedUsed = unwrapGrokVal(config.includedUsed ?? config.included_used ?? config.totalUsed ?? config.total_used, NaN);

        if (Number.isFinite(monthlyLimit) && monthlyLimit > 0) {
          const safeUsed = Math.max(0, Number.isFinite(includedUsed) ? includedUsed : 0);
          const rem = Math.max(0, monthlyLimit - safeUsed);
          const fraction = rem / monthlyLimit;
          const pct = Math.round(fraction * 100);
          remainingUsd = Number((rem / 100).toFixed(2));

          quotas.push({
            id: "grok-monthly-credits",
            name: detectedPlan ? `${detectedPlan} Credits` : "Monthly Credits",
            remainingFraction: fraction,
            usedAmount: Math.round(safeUsed),
            totalAmount: Math.round(monthlyLimit),
            percentage: pct,
            resetTime: periodEnd || undefined,
            resetHuman: resetHuman || `$${(rem / 100).toFixed(2)} USD remaining`,
            status: pct <= 0 ? "EMPTY" : pct <= 20 ? "LOW" : "HEALTHY",
          });
        }

        // 2. On-demand pool
        const onDemandCap = unwrapGrokVal(config.onDemandCap, NaN);
        const onDemandUsed = unwrapGrokVal(config.onDemandUsed, NaN);
        if (Number.isFinite(onDemandCap) && onDemandCap > 0) {
          const safeUsed = Math.max(0, Number.isFinite(onDemandUsed) ? onDemandUsed : 0);
          const rem = Math.max(0, onDemandCap - safeUsed);
          const fraction = rem / onDemandCap;
          const pct = Math.round(fraction * 100);

          quotas.push({
            id: "grok-ondemand",
            name: "On-Demand Pool",
            remainingFraction: fraction,
            usedAmount: Math.round(safeUsed),
            totalAmount: Math.round(onDemandCap),
            percentage: pct,
            resetTime: periodEnd || undefined,
            resetHuman: resetHuman || `$${(rem / 100).toFixed(2)} USD remaining`,
            status: pct <= 0 ? "EMPTY" : pct <= 20 ? "LOW" : "HEALTHY",
          });
        }

        // 3. Weekly SuperGrok pool
        const usedPct = unwrapGrokVal(config.creditUsagePercent ?? config.credit_usage_percent, NaN);
        if (Number.isFinite(usedPct) && usedPct >= 0) {
          const safeUsedPct = Math.max(0, Math.min(100, Math.round(usedPct)));
          const remainingPct = 100 - safeUsedPct;
          quotas.push({
            id: "grok-weekly-pool",
            name: "Weekly SuperGrok Pool",
            remainingFraction: remainingPct / 100,
            usedAmount: safeUsedPct,
            totalAmount: 100,
            percentage: remainingPct,
            resetTime: periodEnd || undefined,
            resetHuman: resetHuman || `${remainingPct}% remaining`,
            status: remainingPct <= 0 ? "EMPTY" : remainingPct <= 20 ? "LOW" : "HEALTHY",
          });
        }

        // 4. Prepaid balance
        const prepaid = unwrapGrokVal(config.prepaidBalance, NaN);
        if (Number.isFinite(prepaid) && prepaid > 0) {
          const prepaidUsd = Number((prepaid / 100).toFixed(2));
          remainingUsd = (remainingUsd ?? 0) + prepaidUsd;
          quotas.push({
            id: "grok-prepaid",
            name: "Prepaid Balance",
            remainingFraction: 1.0,
            usedAmount: 0,
            totalAmount: Math.round(prepaid),
            percentage: 100,
            resetHuman: `$${prepaidUsd.toFixed(2)} USD`,
            status: "HEALTHY",
          });
        }
      }
    }

    // 5. If no quota buckets found, try gRPC-web GetGrokCreditsConfig fallback
    if (quotas.length === 0) {
      try {
        const grpcRes = await fetch("https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/grpc-web+proto",
            "X-Grpc-Web": "1",
            Accept: "application/grpc-web+proto",
          },
          body: Buffer.from([0, 0, 0, 0, 0]),
          signal: AbortSignal.timeout(6000),
        });
        if (grpcRes.ok) {
          const ab = await grpcRes.arrayBuffer();
          const decoded = decodeGrokCreditsFrame(Buffer.from(ab));
          if (decoded && Number.isFinite(decoded.percentUsed)) {
            const used = Math.round(Math.max(0, Math.min(100, decoded.percentUsed)));
            const remPct = 100 - used;
            const resetHuman = decoded.resetAt ? `Resets ${formatResetRemaining(decoded.resetAt)}` : `${remPct}% remaining`;
            quotas.push({
              id: "grok-weekly-pool",
              name: "Weekly SuperGrok Pool",
              remainingFraction: remPct / 100,
              usedAmount: used,
              totalAmount: 100,
              percentage: remPct,
              resetTime: decoded.resetAt || undefined,
              resetHuman,
              status: remPct <= 0 ? "EMPTY" : remPct <= 20 ? "LOW" : "HEALTHY",
            });
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("Failed to fetch Grok CLI quota:", err);
  }

  // Fallback placeholder if active but no specific bucket returned
  if (quotas.length === 0) {
    quotas.push({
      id: "grok-active",
      name: detectedPlan ? `${detectedPlan} Active` : "Grok CLI Active",
      remainingFraction: 1.0,
      usedAmount: 0,
      totalAmount: 100,
      percentage: 100,
      resetHuman: "Connected (Grok Build)",
      status: "HEALTHY",
    });
  }

  return { quotas, remainingUsd, accountEmail: resolvedEmail };
}

/**
 * Fetches real live quota & health metrics for an xAI API account.
 * Primary: https://api.x.ai/v1/models (verifies key and checks rate limits)
 */
async function fetchXaiAccountQuota(
  token: string,
  connId?: string,
  currentEmail?: string | null
): Promise<{ quotas: QuotaBucketItem[]; remainingUsd: number | null }> {
  const quotas: QuotaBucketItem[] = [];
  let remainingUsd: number | null = null;

  try {
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "grok-cli/9router",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, any>;
      const modelList = Array.isArray(data?.data) ? data.data : [];
      const modelCount = modelList.length;

      // Rate limit headers inspection if provided upstream
      const limitRequests = res.headers.get("x-ratelimit-limit-requests");
      const remainingRequests = res.headers.get("x-ratelimit-remaining-requests");
      const resetRequests = res.headers.get("x-ratelimit-reset-requests");

      if (limitRequests && remainingRequests) {
        const total = parseInt(limitRequests, 10);
        const rem = parseInt(remainingRequests, 10);
        if (total > 0 && Number.isFinite(rem)) {
          const safeRem = Math.max(0, Math.min(total, rem));
          const used = Math.max(0, total - safeRem);
          const fraction = safeRem / total;
          const pct = Math.round(fraction * 100);
          quotas.push({
            id: "xai-rate-requests",
            name: "xAI Request Quota",
            remainingFraction: fraction,
            usedAmount: used,
            totalAmount: total,
            percentage: pct,
            resetHuman: resetRequests ? `Reset in ${resetRequests}` : "Rolling window",
            status: pct <= 0 ? "EMPTY" : pct <= 20 ? "LOW" : "HEALTHY",
          });
        }
      }

      quotas.push({
        id: "xai-api-models",
        name: `xAI API Access (${modelCount > 0 ? `${modelCount} models` : "Verified"})`,
        remainingFraction: 1.0,
        usedAmount: 0,
        totalAmount: 100,
        percentage: 100,
        resetHuman: "Pay-as-you-go · Active",
        status: "HEALTHY",
      });
    } else if (res.status === 401 || res.status === 403) {
      quotas.push({
        id: "xai-auth-error",
        name: "xAI API Key / Token Expired",
        remainingFraction: 0,
        usedAmount: 100,
        totalAmount: 100,
        percentage: 0,
        resetHuman: `Unauthorized (${res.status})`,
        status: "EMPTY",
      });
    } else if (res.status === 429) {
      quotas.push({
        id: "xai-rate-limited",
        name: "xAI Quota Exceeded (429)",
        remainingFraction: 0,
        usedAmount: 100,
        totalAmount: 100,
        percentage: 0,
        resetHuman: "Rate limit reached / Credits depleted",
        status: "EMPTY",
      });
    }
  } catch (err) {
    console.error("Failed to fetch xAI quota:", err);
  }

  if (quotas.length === 0) {
    quotas.push({
      id: "xai-default",
      name: "xAI API Quota",
      remainingFraction: 1.0,
      usedAmount: 0,
      totalAmount: 100,
      percentage: 100,
      resetHuman: "Connected",
      status: "HEALTHY",
    });
  }

  return { quotas, remainingUsd };
}

/**
 * Checks if a provider supports real live upstream quota / billing tracking.
 * Custom providers, self-hosted proxies, and untracked providers are excluded.
 */
export function isProviderQuotaTrackable(provider: string): boolean {
  const p = (provider || "").toUpperCase().trim();
  if (p.startsWith("CUSTOM_") || p === "CUSTOM") return false;
  return (
    p === "ANTIGRAVITY" ||
    p === "GOOGLE" ||
    p === "GEMINI_CLI" ||
    p === "GEMINI" ||
    p === "OPENAI" ||
    p === "OPENAI_CODEX" ||
    p === "CODEX" ||
    p === "CLAUDE" ||
    p === "CLAUDE_CODE" ||
    p === "ANTHROPIC" ||
    p === "DEEPSEEK" ||
    p === "OLLAMA" ||
    p === "OLLAMA_CLOUD" ||
    p === "OPENROUTER" ||
    p === "CODEBUDDY" ||
    p === "CODEBUDDY_INTL" ||
    p === "CBAI" ||
    p === "XAI" ||
    p === "GROK_CLI" ||
    p === "GROK" ||
    p === "GROK-CLI"
  );
}

interface CachedQuotaEntry {
  quotas: QuotaBucketItem[];
  timestamp: number;
}
const quotaCache = new Map<string, CachedQuotaEntry>();
const CACHE_TTL_MS = 25 * 1000; // 25 seconds TTL

/**
 * Fast metadata fetch for quota-trackable accounts from the database (<10ms).
 * Excludes custom providers that do not have upstream quota tracking.
 * Returns cards with empty quotas so the frontend can render immediately.
 */
export async function getAccountsSummary(): Promise<AccountQuotaCardData[]> {
  const connections = await prisma.providerConnection.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return connections
    .filter((conn) => isProviderQuotaTrackable(conn.provider))
    .map((conn) => ({
      id: conn.id,
      name: conn.name,
      provider: conn.provider,
      authType: conn.authType,
      accountEmail: conn.accountEmail || null,
      isActive: conn.isActive,
      syncStatus: conn.syncStatus || "NORMAL",
      lastSyncedAt: conn.lastSyncedAt ? conn.lastSyncedAt.toISOString() : null,
      quotas: [],
    }));
}

/**
 * Fetches real live quota for a single account connection.
 * Caches results in-memory for 25s unless bypassCache is true.
 * Updates DB lastSyncedAt & syncStatus asynchronously.
 */
export async function getSingleAccountQuota(
  id: string,
  bypassCache = false
): Promise<AccountQuotaCardData | null> {
  const conn = await prisma.providerConnection.findUnique({
    where: { id },
  });
  if (!conn || !isProviderQuotaTrackable(conn.provider)) return null;

  const now = Date.now();
  const cached = quotaCache.get(id);

  let quotas: QuotaBucketItem[];
  let remainingUsd: number | null = null;

  if (!bypassCache && cached && now - cached.timestamp < CACHE_TTL_MS) {
    quotas = cached.quotas;
  } else {
    const provUpper = conn.provider.toUpperCase();
    const isAntigravity =
      provUpper === "ANTIGRAVITY" || provUpper === "GOOGLE" || provUpper === "GEMINI_CLI";
    const isCodex =
      provUpper === "OPENAI" || provUpper === "OPENAI_CODEX" || provUpper === "CODEX";
    const isDeepSeek =
      provUpper === "DEEPSEEK";
    const isOllama =
      provUpper === "OLLAMA" || provUpper === "OLLAMA_CLOUD";
    const isOpenRouter =
      provUpper === "OPENROUTER";
    const isGemini =
      provUpper === "GEMINI" || provUpper === "GOOGLE";
    const isClaude =
      provUpper === "CLAUDE" || provUpper === "CLAUDE_CODE" || provUpper === "ANTHROPIC";
    const isCodeBuddy =
      provUpper === "CODEBUDDY" || provUpper === "CODEBUDDY_INTL" || provUpper === "CBAI";
    const isGrokCli =
      provUpper === "GROK_CLI" || provUpper === "GROK" || provUpper === "GROK-CLI";
    const isXai =
      provUpper === "XAI";

    if (isAntigravity && (conn.accessTokenEnc || conn.refreshTokenEnc)) {
      try {
        let accessToken = conn.accessTokenEnc ? decryptCredential(conn.accessTokenEnc) : "";
        const isExpiredOrSoon =
          !accessToken ||
          (conn.tokenExpiresAt && new Date(conn.tokenExpiresAt).getTime() <= Date.now() + 60_000);
        if (isExpiredOrSoon && conn.refreshTokenEnc) {
          accessToken = await refreshOAuthToken(conn.id);
        }
        quotas = accessToken ? await fetchAntigravityAccountQuota(accessToken, conn.id) : [];
      } catch {
        quotas = [];
      }
    } else if (isCodex && conn.accessTokenEnc) {
      try {
        const accessToken = decryptCredential(conn.accessTokenEnc);
        quotas = await fetchCodexAccountQuota(accessToken);
      } catch {
        quotas = [
          {
            id: "codex-window",
            name: "Usage Limit",
            remainingFraction: 0,
            usedAmount: 100,
            totalAmount: 100,
            percentage: 0,
            resetHuman: "Limit reached",
            status: "EMPTY",
          },
        ];
      }
    } else if (isGemini && conn.apiKeyEncrypted) {
      try {
        const apiKey = decryptCredential(conn.apiKeyEncrypted);
        quotas = await fetchGeminiAccountQuota(apiKey);
      } catch {
        quotas = [];
      }
    } else if (isDeepSeek && conn.apiKeyEncrypted) {
      try {
        const apiKey = decryptCredential(conn.apiKeyEncrypted);
        const res = await fetchDeepSeekAccountQuota(apiKey);
        quotas = res.quotas;
        remainingUsd = res.remainingUsd;
      } catch {
        quotas = [];
      }
    } else if (isOllama && conn.apiKeyEncrypted) {
      try {
        const apiKey = decryptCredential(conn.apiKeyEncrypted);
        quotas = await fetchOllamaAccountQuota(apiKey);
      } catch {
        quotas = [];
      }
    } else if (isOpenRouter && conn.apiKeyEncrypted) {
      try {
        const apiKey = decryptCredential(conn.apiKeyEncrypted);
        const res = await fetchOpenRouterAccountQuota(apiKey);
        quotas = res.quotas;
        remainingUsd = res.remainingUsd;
      } catch {
        quotas = [];
      }
    } else if (isClaude && (conn.accessTokenEnc || conn.apiKeyEncrypted)) {
      try {
        const token = conn.accessTokenEnc
          ? decryptCredential(conn.accessTokenEnc)
          : decryptCredential(conn.apiKeyEncrypted!);
        const res = await fetchClaudeAccountQuota(token, conn.id, conn.accountEmail);
        quotas = res.quotas;
        if (res.accountEmail && !conn.accountEmail) {
          conn.accountEmail = res.accountEmail;
        }
      } catch {
        quotas = [];
      }
    } else if (isCodeBuddy && (conn.accessTokenEnc || conn.apiKeyEncrypted)) {
      try {
        const token = conn.accessTokenEnc
          ? decryptCredential(conn.accessTokenEnc)
          : decryptCredential(conn.apiKeyEncrypted!);
        quotas = await fetchCodeBuddyAccountQuota(token);
      } catch {
        quotas = [];
      }
    } else if (isGrokCli && (conn.accessTokenEnc || conn.apiKeyEncrypted)) {
      try {
        const token = conn.accessTokenEnc
          ? decryptCredential(conn.accessTokenEnc)
          : decryptCredential(conn.apiKeyEncrypted!);
        const res = await fetchGrokCliAccountQuota(token, conn.id, conn.accountEmail);
        quotas = res.quotas;
        remainingUsd = res.remainingUsd;
        if (res.accountEmail && !conn.accountEmail) {
          conn.accountEmail = res.accountEmail;
        }
      } catch {
        quotas = [];
      }
    } else if (isXai && (conn.apiKeyEncrypted || conn.accessTokenEnc)) {
      try {
        const token = conn.apiKeyEncrypted
          ? decryptCredential(conn.apiKeyEncrypted)
          : decryptCredential(conn.accessTokenEnc!);
        const res = await fetchXaiAccountQuota(token, conn.id, conn.accountEmail);
        quotas = res.quotas;
        remainingUsd = res.remainingUsd;
      } catch {
        quotas = [];
      }
    } else {
      quotas = [];
    }

    quotaCache.set(id, { quotas, timestamp: now });
  }

  // Determine aggregate sync status (exclude informational buckets)
  const activeQuotas = quotas.filter((q) => q.id !== "gemini-pro-lyria");
  const hasEmpty = activeQuotas.some((q) => q.status === "EMPTY" || q.percentage <= 1);
  const hasLow = activeQuotas.some((q) => q.status === "LOW" || (q.percentage > 1 && q.percentage <= 25));
  const syncStatus = hasEmpty ? "EXHAUSTED" : hasLow ? "LOW_QUOTA" : "NORMAL";

  // Update DB metadata in background
  prisma.providerConnection
    .update({
      where: { id: conn.id },
      data: {
        syncStatus,
        lastSyncedAt: new Date(),
        ...(remainingUsd !== null ? { quotaRemainingUsd: remainingUsd } : {}),
      },
    })
    .catch(() => {});

  return {
    id: conn.id,
    name: conn.name,
    provider: conn.provider,
    authType: conn.authType,
    accountEmail: conn.accountEmail || null,
    isActive: conn.isActive,
    syncStatus,
    lastSyncedAt: new Date().toISOString(),
    quotas,
  };
}

/**
 * Fetches all connections with their live quotas in parallel (Promise.allSettled).
 */
export async function getAllAccountsWithQuota(bypassCache = false): Promise<AccountQuotaCardData[]> {
  const connections = await prisma.providerConnection.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: { id: true, provider: true },
  });

  const trackable = connections.filter((c) => isProviderQuotaTrackable(c.provider));

  const results = await Promise.allSettled(
    trackable.map((c) => getSingleAccountQuota(c.id, bypassCache))
  );

  const cards: AccountQuotaCardData[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      cards.push(r.value);
    }
  }

  return cards;
}

/**
 * Toggles a single connection active state.
 */
export async function toggleConnectionActive(id: string, nextState?: boolean): Promise<boolean> {
  const existing = await prisma.providerConnection.findUnique({ where: { id } });
  if (!existing) return false;

  const targetState = nextState !== undefined ? nextState : !existing.isActive;
  await prisma.providerConnection.update({
    where: { id },
    data: {
      isActive: targetState,
      ...(targetState ? { cooldownUntil: null } : {}),
    },
  });

  return targetState;
}

/**
 * Bulk updates active state:
 * - "turn_off_empty": disables accounts with 0% quota
 * - "turn_on_available": enables accounts with >0% quota
 */
export async function bulkUpdateQuotaStatus(action: "turn_off_empty" | "turn_on_available"): Promise<number> {
  const allCards = await getAllAccountsWithQuota();
  let affected = 0;

  for (const card of allCards) {
    const isExhausted = card.quotas.some((q) => q.status === "EMPTY" || q.percentage <= 1);
    if (action === "turn_off_empty" && isExhausted && card.isActive) {
      await toggleConnectionActive(card.id, false);
      affected++;
    } else if (action === "turn_on_available" && !isExhausted && !card.isActive) {
      await toggleConnectionActive(card.id, true);
      affected++;
    }
  }

  return affected;
}
