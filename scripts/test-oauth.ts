import { generateCodeVerifier, generateCodeChallenge, generateOAuthState, parseCallbackUrl } from "../src/lib/oauth/pkce";
import { initiateOAuthSession } from "../src/lib/oauth/service";
import { prisma } from "../src/lib/prisma";
import { encryptCredential, decryptCredential } from "../src/lib/crypto";
import { resolveUpstreamConnection } from "../src/lib/router";

async function main() {
  console.log("==================================================");
  console.log("       TESTING 9ROUTER OAUTH IMPLEMENTATION       ");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✔ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`✖ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Test PKCE Generation
  console.log("\n--- 1. PKCE Generator Tests ---");
  const verifier = generateCodeVerifier(64);
  assert(verifier.length === 64, "Code verifier generated with correct length (64 chars)");
  const challenge = generateCodeChallenge(verifier);
  assert(challenge.length > 30, `Code challenge generated successfully (${challenge})`);

  const state = generateOAuthState();
  assert(state.length === 32, "CSRF state token generated with correct length (32 chars)");

  // 2. Test Callback URL Parsing (Both 9router screenshot URL & localhost)
  console.log("\n--- 2. Callback URL Parsing Tests ---");
  const testUrl1 = "https://9rt.topupin.store/callback?code=mock_code_alpha123&state=test_state_xyz";
  const parsed1 = parseCallbackUrl(testUrl1);
  assert(parsed1.code === "mock_code_alpha123", `Extracted code from 9rt URL: ${parsed1.code}`);
  assert(parsed1.state === "test_state_xyz", `Extracted state from 9rt URL: ${parsed1.state}`);
  assert(parsed1.error === null, "No error in valid URL");

  const testUrl2 = "http://localhost:3000/api/admin/providers/oauth/callback?code=local_code_789";
  const parsed2 = parseCallbackUrl(testUrl2);
  assert(parsed2.code === "local_code_789", `Extracted code from localhost URL: ${parsed2.code}`);

  const rawCode = "sk_oauth_code_direct_paste";
  const parsedRaw = parseCallbackUrl(rawCode);
  assert(parsedRaw.code === "sk_oauth_code_direct_paste", "Direct code paste supported without query string");

  // 3. Test OAuth Session Initiation
  console.log("\n--- 3. OAuth Session Initiation ---");
  const session = initiateOAuthSession({
    provider: "OPENAI",
    connectionName: "Test OpenAI Codex",
    redirectUri: "http://localhost:3000/api/admin/providers/oauth/callback",
  });
  assert(session.authorizeUrl.includes("auth.openai.com"), "Authorize URL points to auth.openai.com");
  assert(session.authorizeUrl.includes("code_challenge="), "Authorize URL contains S256 code challenge");
  assert(session.authorizeUrl.includes("state="), "Authorize URL contains CSRF state");

  // 3b. Test 9Router Antigravity Google OAuth Scheme
  console.log("\n--- 3b. 9Router Antigravity Google OAuth Scheme ---");
  const antigravitySession = initiateOAuthSession({
    provider: "ANTIGRAVITY",
    connectionName: "Antigravity Google Account",
    redirectUri: "http://localhost:3000/api/admin/providers/oauth/callback",
  });
  assert(antigravitySession.authorizeUrl.includes("accounts.google.com/o/oauth2/v2/auth"), "Antigravity authorize URL points to Google OAuth v2");
  assert(antigravitySession.authorizeUrl.includes("client_id="), "Antigravity uses configured Google client_id");
  assert(antigravitySession.authorizeUrl.includes("http%3A%2F%2Flocalhost%3A443%2Fcallback"), "Antigravity uses fixed localhost:443 redirect_uri");
  assert(antigravitySession.authorizeUrl.includes("access_type=offline"), "Antigravity requests offline access for refresh token");
  assert(antigravitySession.authorizeUrl.includes("prompt=consent"), "Antigravity forces consent prompt for fresh refresh token");
  assert(antigravitySession.authorizeUrl.includes("cloud-platform"), "Antigravity includes cloud-platform scope");
  assert(antigravitySession.authorizeUrl.includes("cclog"), "Antigravity includes cclog scope");
  assert(antigravitySession.authorizeUrl.includes("experimentsandconfigs"), "Antigravity includes experimentsandconfigs scope");

  // Test parsing localhost:443 callback URL
  const googleCallbackUrl = "http://localhost:443/callback?code=4%2F0AX4XfWh9exampleCode123&state=2DwduAdUWkCHyb9qUZB_Ln5_RcjVGOLtyjwv7GTHwig";
  const parsedGoogle = parseCallbackUrl(googleCallbackUrl);
  assert(parsedGoogle.code === "4/0AX4XfWh9exampleCode123", `Extracted Google auth code from localhost:443 URL: ${parsedGoogle.code}`);
  assert(parsedGoogle.state === "2DwduAdUWkCHyb9qUZB_Ln5_RcjVGOLtyjwv7GTHwig", `Extracted Google state: ${parsedGoogle.state}`);

  // Test parsing localhost:443 callback URL with state first then code (Google default order)
  const stateFirstUrl = "http://localhost:443/callback?state=n6BBQD9THrCWZcyKhfqRTS&code=4%2F0AX4XtestCode456&scope=cloud-platform";
  const parsedStateFirst = parseCallbackUrl(stateFirstUrl);
  assert(parsedStateFirst.code === "4/0AX4XtestCode456", `Extracted code when state is first in query: ${parsedStateFirst.code}`);
  assert(parsedStateFirst.state === "n6BBQD9THrCWZcyKhfqRTS", `Extracted state when state is first: ${parsedStateFirst.state}`);

  // Test rejecting callback URL that has no code parameter
  const missingCodeUrl = "http://localhost:443/callback?state=n6BBQD9THrCWZcyKhfqRTS";
  const parsedMissing = parseCallbackUrl(missingCodeUrl);
  assert(parsedMissing.code === null, "Correctly detected code is null when URL is missing code param");
  assert(parsedMissing.error !== null, "Returned descriptive error when URL is missing code param");

  // 4. Test OAuth Connection Persistence & Encryption
  console.log("\n--- 4. OAuth Connection Persistence & Encryption ---");
  const mockAccessToken = "mock_oauth_access_token_secret_999";
  const mockRefreshToken = "mock_oauth_refresh_token_secret_888";

  const encAccess = encryptCredential(mockAccessToken);
  const encRefresh = encryptCredential(mockRefreshToken);

  const testConn = await prisma.providerConnection.create({
    data: {
      provider: "OPENAI",
      name: "Test OAuth Codex Account",
      authType: "OAUTH",
      accessTokenEnc: encAccess,
      refreshTokenEnc: encRefresh,
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour ahead
      accountEmail: "codex_tester@devportal.local",
      priority: 1,
      weight: 1,
      isActive: true,
      syncStatus: "NORMAL",
    },
  });

  assert(testConn.id !== undefined, `Created OAuth connection: ${testConn.id}`);
  assert(testConn.authType === "OAUTH", "Connection correctly tagged with authType=OAUTH");
  assert(testConn.accessTokenEnc !== mockAccessToken, "Access token is encrypted in database");

  const decryptedAccess = decryptCredential(testConn.accessTokenEnc!);
  assert(decryptedAccess === mockAccessToken, "Decrypted access token matches original secret");

  // 5. Test Router Upstream Resolution with OAuth
  console.log("\n--- 5. Router Upstream Resolution with OAuth ---");
  const route = await resolveUpstreamConnection({ provider: "OPENAI" });
  assert(route !== null, "Route resolved successfully");
  assert(route?.authType === "OAUTH", `Route correctly identifies authType as OAUTH`);
  assert(route?.apiKey === mockAccessToken, "Router resolved decrypted OAuth access token for Authorization header");

  // Clean up test connection
  await prisma.providerConnection.delete({
    where: { id: testConn.id },
  });
  console.log("✔ Cleaned up test connection.");

  console.log("\n==================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (${failed === 0 ? "100% SUCCESS" : "HAS FAILURES"})`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
