import { NextRequest, NextResponse } from "next/server";
import { runHealthCheck } from "@/lib/cron/healthChecker";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Allow admin session OR cron secret header/query
  const user = await getCurrentUser();
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || req.headers.get("x-cron-secret");
  const isAuthorized = (user && user.role === "ADMIN") || secret === (process.env.CRON_SECRET || "aidev_cron_secret");

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const report = await runHealthCheck();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      report,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
