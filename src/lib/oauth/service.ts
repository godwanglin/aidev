import { prisma } from "@/lib/prisma";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { invalidateProviderConnectionsCache } from "@/lib/router";
import { getProviderOAuthConfig, OAUTH_PROVIDERS } from "./config";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateOAuthState,
} from "./pkce";

interface OAuthSession {
  state: string;
  provider: string;
  connectionName: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

// Global in-memory session cache for active OAuth handshakes
const globalForOAuth = globalThis as unknown as {
  oauthSessions: Map<string, OAuthSession>;
};

if (!globalForOAuth.oauthSessions) {
  globalForOAuth.oauthSessions = new Map<string, OAuthSession>();
}

const sessions = globalForOAuth.oauthSessions;

// Clean up expired sessions (> 20 minutes)
function pruneSessions() {
  const now = Date.now();
  for (const [state, sess] of sessions.entries()) {
    if (now - sess.createdAt > 20 * 60 * 1000) {
      sessions.delete(state);
    }
  }
}

/**
 * Initiates an OAuth authorization session, generating PKCE verifier and challenge.
 */
export function initiateOAuthSession({
  provider,
  connectionName,
  redirectUri,
  customClientId,
}: {
  provider: string;
  connectionName: string;
  redirectUri: string;
  customClientId?: string;
}) {
  pruneSessions();

  const config = getProviderOAuthConfig(provider);
  if (!config) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  const effectiveRedirectUri = config.fixedRedirectUri || redirectUri;
  const state = generateOAuthState();
  const codeVerifier = generateCodeVerifier(64);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const clientId = customClientId || config.defaultClientId;

  // Build authorization URL
  const authUrl = new URL(config.authorizeUrl);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", effectiveRedirectUri);
  authUrl.searchParams.set("scope", config.scopes.join(" "));
  authUrl.searchParams.set("state", state);

  if (config.extraAuthorizeParams) {
    for (const [key, val] of Object.entries(config.extraAuthorizeParams)) {
      authUrl.searchParams.set(key, val);
    }
  }

  if (config.usePkce) {
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
  }

  if (config.audience) {
    authUrl.searchParams.set("audience", config.audience);
  }

  // Store in cache
  sessions.set(state, {
    state,
    provider: provider.toUpperCase(),
    connectionName,
    codeVerifier,
    redirectUri: effectiveRedirectUri,
    createdAt: Date.now(),
  });

  return {
    state,
    authorizeUrl: authUrl.toString(),
    codeVerifier,
    redirectUri: effectiveRedirectUri,
  };
}

/**
 * Exchanges authorization code for tokens, encrypts them, and persists to ProviderConnection.
 */
export async function exchangeAndSaveOAuthToken({
  provider,
  name,
  code,
  state,
  codeVerifier,
  redirectUri,
  priority = 1,
  weight = 1,
}: {
  provider: string;
  name: string;
  code: string;
  state?: string | null;
  codeVerifier?: string;
  redirectUri?: string;
  priority?: number;
  weight?: number;
}) {
  const config = getProviderOAuthConfig(provider);
  if (!config) {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  // Lookup session if state is provided
  let verifier = codeVerifier;
  let rUri = redirectUri;

  if (state && sessions.has(state)) {
    const session = sessions.get(state)!;
    if (!verifier) verifier = session.codeVerifier;
    if (!rUri) rUri = session.redirectUri;
    sessions.delete(state);
  }

  // Force provider fixed redirect URI if specified (e.g. Antigravity http://localhost:443/callback)
  if (config.fixedRedirectUri) {
    rUri = config.fixedRedirectUri;
  }

  // Default redirectUri fallback
  if (!rUri) {
    rUri = "http://localhost:3000/api/admin/providers/oauth/callback";
  }

  // Prepare token exchange request body
  const isAnthropic = provider.toUpperCase() === "CLAUDE_CODE" || config.tokenUrl.includes("claude.com");

  let tokenRes: Response;

  if (isAnthropic) {
    const jsonPayload: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: rUri,
      client_id: config.defaultClientId,
    };
    if (state) jsonPayload.state = state;
    if (config.usePkce && verifier) jsonPayload.code_verifier = verifier;

    tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(jsonPayload),
    });
  } else {
    const bodyParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: rUri,
      client_id: config.defaultClientId,
    });

    if (state) {
      bodyParams.set("state", state);
    }

    if (config.usePkce && verifier) {
      bodyParams.set("code_verifier", verifier);
    }

    if (config.defaultClientSecret) {
      bodyParams.set("client_secret", config.defaultClientSecret);
    }

    tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: bodyParams.toString(),
    });
  }

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || tokenData.error) {
    const errorMsg =
      tokenData.error_description ||
      (typeof tokenData.error === "object" ? tokenData.error?.message : tokenData.error) ||
      `Token exchange failed with status ${tokenRes.status}`;
    throw new Error(errorMsg);
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || null;
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  // Helper to extract email/sub from a JWT token
  const extractJwtProfile = (jwt?: string | null): { email: string | null; sub: string | null } => {
    if (!jwt || typeof jwt !== "string" || !jwt.includes(".")) {
      return { email: null, sub: null };
    }
    try {
      const parts = jwt.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const email =
          payload.email ||
          payload["https://api.openai.com/profile"]?.email ||
          payload.preferred_username ||
          null;
        const sub = payload.sub || null;
        return {
          email: typeof email === "string" && email.trim() ? email.trim() : null,
          sub: typeof sub === "string" && sub.trim() ? sub.trim() : null,
        };
      }
    } catch {}
    return { email: null, sub: null };
  };

  // Attempt to extract account email from id_token or access_token (JWT) if available
  const idJwt = extractJwtProfile(tokenData.id_token);
  const accJwt = extractJwtProfile(accessToken);
  let accountEmail: string | null = idJwt.email || accJwt.email || null;

  const providerKey = provider.toUpperCase().trim();

  // Fallback for Google/Antigravity if email not present in token payload
  if (!accountEmail && accessToken && (providerKey === "ANTIGRAVITY" || providerKey === "GOOGLE" || providerKey === "GEMINI" || providerKey === "GEMINI_CLI")) {
    try {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        accountEmail = info.email || null;
      }
    } catch {}
  }

  // Fallback for OpenAI Codex if email not present in JWT
  if (!accountEmail && accessToken && (providerKey === "OPENAI_CODEX" || providerKey === "OPENAI" || providerKey === "CODEX")) {
    try {
      const usageRes = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (usageRes.ok) {
        const usageData = await usageRes.json();
        if (usageData?.email) accountEmail = String(usageData.email).trim();
      }
    } catch {}
  }

  if (!accountEmail) {
    accountEmail = idJwt.sub || accJwt.sub || null;
  }

  // Encrypt tokens using AES-256-GCM
  const accessTokenEnc = encryptCredential(accessToken);
  const refreshTokenEnc = refreshToken ? encryptCredential(refreshToken) : null;
  const idTokenEnc = tokenData.id_token ? encryptCredential(tokenData.id_token) : null;

  // Check if a connection with the same email already exists for this provider
  const providerVariants =
    providerKey === "OPENAI_CODEX" || providerKey === "OPENAI" || providerKey === "CODEX"
      ? ["OPENAI_CODEX", "OPENAI", "CODEX"]
      : providerKey === "GOOGLE" || providerKey === "GEMINI" || providerKey === "GEMINI_CLI"
      ? ["GOOGLE", "GEMINI", "GEMINI_CLI"]
      : [providerKey];

  let existingMatches: any[] = [];
  if (accountEmail && accountEmail.trim()) {
    const normalizedTargetEmail = accountEmail.trim().toLowerCase();
    const candidates = await prisma.providerConnection.findMany({
      where: { provider: { in: providerVariants } },
      orderBy: { createdAt: "asc" },
    });
    existingMatches = candidates.filter(
      (c) => c.accountEmail && c.accountEmail.trim().toLowerCase() === normalizedTargetEmail
    );
  }

  let connection;
  let replaced = false;

  if (existingMatches.length > 0) {
    const primaryConn = existingMatches[0];
    const isGenericName =
      !name ||
      name.trim().toLowerCase().startsWith("akun ") ||
      name.trim().toLowerCase().endsWith(" account");
    const finalName = !isGenericName ? name.trim() : primaryConn.name || name;

    connection = await prisma.providerConnection.update({
      where: { id: primaryConn.id },
      data: {
        provider: providerKey,
        name: finalName,
        authType: "OAUTH",
        accessTokenEnc,
        refreshTokenEnc: refreshTokenEnc ?? primaryConn.refreshTokenEnc,
        idTokenEnc: idTokenEnc ?? primaryConn.idTokenEnc,
        tokenExpiresAt,
        accountEmail: accountEmail ? accountEmail.trim() : primaryConn.accountEmail,
        isActive: true,
        syncStatus: "NORMAL",
        cooldownUntil: null,
      },
    });

    // Clean up any older duplicate rows with the same email if they exist
    const duplicateIds = existingMatches.slice(1).map((c) => c.id);
    if (duplicateIds.length > 0) {
      await prisma.upstreamLog
        .updateMany({
          where: { connectionId: { in: duplicateIds } },
          data: { connectionId: primaryConn.id },
        })
        .catch(() => {});
      await prisma.providerConnection
        .deleteMany({
          where: { id: { in: duplicateIds } },
        })
        .catch(() => {});
    }

    replaced = true;
  } else {
    // Persist new connection into database
    connection = await prisma.providerConnection.create({
      data: {
        provider: providerKey,
        name,
        authType: "OAUTH",
        accessTokenEnc,
        refreshTokenEnc,
        idTokenEnc,
        tokenExpiresAt,
        accountEmail: accountEmail ? accountEmail.trim() : null,
        priority,
        weight,
        isActive: true,
        syncStatus: "NORMAL",
      },
    });
  }

  invalidateProviderConnectionsCache(providerKey);

  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    authType: connection.authType,
    accountEmail: connection.accountEmail,
    tokenExpiresAt: connection.tokenExpiresAt,
    isActive: connection.isActive,
    replaced,
  };
}

/**
 * Automatically refreshes an OAuth token for a given connection if expired or nearing expiry.
 */
export async function refreshOAuthToken(connectionId: string): Promise<string> {
  const conn = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
  });

  if (!conn || conn.authType !== "OAUTH") {
    throw new Error("Connection not found or not configured for OAuth");
  }

  if (!conn.refreshTokenEnc) {
    throw new Error("No refresh token available for this OAuth connection");
  }

  const config = getProviderOAuthConfig(conn.provider);
  if (!config) {
    throw new Error(`Provider ${conn.provider} configuration not found`);
  }

  const rawRefreshToken = decryptCredential(conn.refreshTokenEnc);

  const bodyParams = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: rawRefreshToken,
    client_id: config.defaultClientId,
  });

  if (config.defaultClientSecret) {
    bodyParams.set("client_secret", config.defaultClientSecret);
  }

  const refreshRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: bodyParams.toString(),
  });

  const refreshData = await refreshRes.json().catch(() => ({}));

  if (!refreshRes.ok || refreshData.error) {
    await prisma.providerConnection.update({
      where: { id: connectionId },
      data: { syncStatus: "EXHAUSTED" },
    });
    throw new Error(
      refreshData.error_description ||
        refreshData.error ||
        "OAuth refresh token failed or revoked"
    );
  }

  const newAccessToken = refreshData.access_token;
  const newRefreshToken = refreshData.refresh_token || rawRefreshToken;
  const expiresIn = Number(refreshData.expires_in) || 3600;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  const accessTokenEnc = encryptCredential(newAccessToken);
  const refreshTokenEnc = encryptCredential(newRefreshToken);

  await prisma.providerConnection.update({
    where: { id: connectionId },
    data: {
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiresAt,
      syncStatus: "NORMAL",
    },
  });

  return newAccessToken;
}
