import { prisma } from "@/lib/prisma";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
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
  const bodyParams = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: rUri,
    client_id: config.defaultClientId,
  });

  if (config.usePkce && verifier) {
    bodyParams.set("code_verifier", verifier);
  }

  if (config.defaultClientSecret) {
    bodyParams.set("client_secret", config.defaultClientSecret);
  }

  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: bodyParams.toString(),
  });

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || tokenData.error) {
    const errorMsg =
      tokenData.error_description ||
      tokenData.error ||
      `Token exchange failed with status ${tokenRes.status}`;
    throw new Error(errorMsg);
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token || null;
  const expiresIn = Number(tokenData.expires_in) || 3600;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  // Attempt to extract account email from id_token (JWT) if available
  let accountEmail: string | null = null;
  if (tokenData.id_token) {
    try {
      const parts = tokenData.id_token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        accountEmail =
          payload.email ||
          payload["https://api.openai.com/profile"]?.email ||
          payload.preferred_username ||
          payload.sub ||
          null;
      }
    } catch {}
  }

  // Fallback for Google/Antigravity if email not present in token payload
  if (!accountEmail && accessToken && (provider.toUpperCase() === "ANTIGRAVITY" || provider.toUpperCase() === "GOOGLE")) {
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

  // Encrypt tokens using AES-256-GCM
  const accessTokenEnc = encryptCredential(accessToken);
  const refreshTokenEnc = refreshToken ? encryptCredential(refreshToken) : null;

  // Persist into database
  const connection = await prisma.providerConnection.create({
    data: {
      provider: provider.toUpperCase(),
      name,
      authType: "OAUTH",
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiresAt,
      accountEmail,
      priority,
      weight,
      isActive: true,
      syncStatus: "NORMAL",
    },
  });

  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    authType: connection.authType,
    accountEmail: connection.accountEmail,
    tokenExpiresAt: connection.tokenExpiresAt,
    isActive: connection.isActive,
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
