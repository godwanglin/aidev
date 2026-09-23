import crypto from "crypto";

/**
 * Generate a random URL-safe base64 string
 */
export function generateRandomString(length: number = 48): string {
  return crypto
    .randomBytes(length)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, length);
}

/**
 * Generate PKCE Code Verifier
 */
export function generateCodeVerifier(length: number = 64): string {
  return generateRandomString(length);
}

/**
 * Generate PKCE Code Challenge from Verifier using SHA-256
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a cryptographically secure CSRF state token
 */
export function generateOAuthState(): string {
  return generateRandomString(32);
}

/**
 * Robustly parse code and state from full callback URL or raw string.
 * Handles inputs like:
 * - "https://9rt.topupin.store/callback?code=abc123xyz&state=xyz"
 * - "http://localhost:3000/api/admin/providers/oauth/callback?code=abc123xyz"
 * - "code=abc123xyz&state=..."
 * - "abc123xyz" (raw code pasted directly)
 */
export function parseCallbackUrl(input: string): {
  code: string | null;
  state: string | null;
  error: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { code: null, state: null, error: "Empty callback input" };
  }

  // If user pasted a full URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("?")) {
    try {
      // In case user pasted "callback?code=..." without protocol
      const fullUrl = trimmed.startsWith("http") ? trimmed : `https://dummy.local/${trimmed}`;
      const parsed = new URL(fullUrl);
      const code = parsed.searchParams.get("code");
      const state = parsed.searchParams.get("state");
      const error = parsed.searchParams.get("error") || parsed.searchParams.get("error_description");

      if (error) {
        return { code: null, state, error };
      }

      if (code) {
        return { code, state, error: null };
      }
    } catch {
      // Fall through to regex
    }
  }

  // Try regex matching query string parameters
  const codeMatch = trimmed.match(/(?:^|[?&])code=([^&]+)/);
  const stateMatch = trimmed.match(/(?:^|[?&])state=([^&]+)/);
  const errorMatch = trimmed.match(/(?:^|[?&])(?:error|error_description)=([^&]+)/);

  if (errorMatch) {
    return { code: null, state: stateMatch ? decodeURIComponent(stateMatch[1]) : null, error: decodeURIComponent(errorMatch[1]) };
  }

  if (codeMatch) {
    return {
      code: decodeURIComponent(codeMatch[1]),
      state: stateMatch ? decodeURIComponent(stateMatch[1]) : null,
      error: null,
    };
  }

  // If the input was a URL or query string but didn't contain a code
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.includes("?") ||
    trimmed.includes("/callback")
  ) {
    return {
      code: null,
      state: stateMatch ? decodeURIComponent(stateMatch[1]) : null,
      error:
        "URL callback tidak mengandung parameter code (?code=...). Pastikan Anda telah menyelesaikan login Google dan menyalin seluruh alamat URL dari browser.",
    };
  }

  // If no params match, assume the user pasted the raw authorization code
  return {
    code: trimmed,
    state: null,
    error: null,
  };
}
