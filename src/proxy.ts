import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";

// Routes that should be accessible without authentication
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/captcha",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/models",
  "/models",
  "/docs",
  "/changelog",
];

// Prefixes that should always be allowed through (API proxy, static assets, webhooks, cron)
const PUBLIC_PREFIXES = [
  "/v1/",            // OpenAI-compatible proxy (uses API key auth, not session)
  "/api/webhooks/",  // Payment gateway webhooks (e.g. Midtrans notifications)
  "/api/cron/",      // Automated cron tasks (e.g. upstream health checker)
  "/_next/",         // Next.js static files & image optimization
  "/favicon",
  "/icon",
  "/logo",
];

const SESSION_SECRET = process.env.SESSION_SECRET || "aidev_prod_secure_hmac_sign_gateway_2026";
const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function verifySessionToken(token: string): boolean {
  try {
    const raw = Buffer.from(token, "base64").toString("utf-8");
    const [userId, ts, sig] = raw.split(":");
    if (!userId || !ts || !sig) return false;
    
    const tokenTime = Number(ts);
    if (isNaN(tokenTime) || Date.now() - tokenTime > MAX_SESSION_AGE_MS || tokenTime > Date.now() + 60000) {
      return false;
    }

    const expectedSig = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(`${userId}:${ts}`)
      .digest("hex");
    return sig === expectedSig;
  } catch {
    return false;
  }
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths (exact match)
  if (PUBLIC_PATHS.includes(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Allow public prefixes
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Allow API routes with Bearer token or API key headers to pass through to route handlers
  if (pathname.startsWith("/api/") && (request.headers.has("authorization") || request.headers.has("x-api-key"))) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Allow static file extensions (images, css, js, fonts, etc.)
  if (pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|woff2?|ttf|eot|map)$/)) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Check session cookie
  const sessionToken = request.cookies.get("devportal_session")?.value;

  if (!sessionToken || !verifySessionToken(sessionToken)) {
    const loginUrl = new URL("/login", request.url);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return applySecurityHeaders(NextResponse.next());
}
