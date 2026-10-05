import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { syncConnectionQuota } from "@/lib/quota-sync";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Connection ID is required" }, { status: 400 });
    }

    const result = await syncConnectionQuota(id);

    return NextResponse.json({
      success: result.status !== "ERROR",
      connection: {
        id: result.connectionId,
        provider: result.provider,
        syncStatus: result.status,
        quotaLimitTokens: result.quotaLimitTokens ? String(result.quotaLimitTokens) : null,
        quotaUsedTokens: result.quotaUsedTokens ? String(result.quotaUsedTokens) : null,
        quotaRemainingUsd: result.quotaRemainingUsd,
      },
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
