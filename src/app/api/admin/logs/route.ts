import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authenticateApiKey } from "@/lib/auth";
import { adminLogger } from "@/lib/admin-logger";

export const dynamic = "force-dynamic";

async function verifyAdminAuth(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser();
  if (user && (user.role === "ADMIN" || user.email === "admin@devportal.local")) {
    return true;
  }
  const authHeader = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");
  if (authHeader || xApiKey) {
    const auth = await authenticateApiKey(authHeader, xApiKey);
    if (auth.success && auth.apiKey) {
      const role = (auth.apiKey as any)?.user?.role;
      const email = (auth.apiKey as any)?.user?.email;
      if (role === "ADMIN" || email === "admin@devportal.local") {
        return true;
      }
    }
  }
  return false;
}

export async function GET(req: NextRequest) {
  const isAllowed = await verifyAdminAuth(req);
  if (!isAllowed) {
    return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 1000);
  const scope = searchParams.get("scope") || "ALL";
  const search = searchParams.get("search") || "";

  const logs = adminLogger.getRecentLogs(limit, scope, search);

  return NextResponse.json({
    success: true,
    total: logs.length,
    data: logs,
  });
}

export async function DELETE(req: NextRequest) {
  const isAllowed = await verifyAdminAuth(req);
  if (!isAllowed) {
    return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
  }

  adminLogger.clear();

  return NextResponse.json({
    success: true,
    message: "Admin console buffer cleared.",
  });
}
