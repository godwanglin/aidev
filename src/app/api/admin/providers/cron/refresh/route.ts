import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { runAllOAuthTokenRefreshes } from "@/lib/oauth/refresh-manager";

async function verifyAuth(req: NextRequest) {
  // 1. Check Bearer token against CRON_SECRET if configured
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // 2. Check admin session
  const user = await getCurrentUser();
  if (user && (user.role === "ADMIN" || user.email === "admin@devportal.local")) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  const isAuthorized = await verifyAuth(req);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runAllOAuthTokenRefreshes();
    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to run token refresh batch" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
