export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startOAuthTokenRefresher } = await import("@/lib/oauth/refresh-manager");
    startOAuthTokenRefresher();
  }
}
