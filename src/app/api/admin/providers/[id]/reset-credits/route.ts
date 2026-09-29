import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getValidCodexToken,
  getCodexRateLimitResetCredits,
  consumeCodexRateLimitResetCredit,
} from "@/lib/codex-reset-credits";
import { syncConnectionQuota } from "@/lib/quota-sync";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { accessToken } = await getValidCodexToken(id);
    const result = await getCodexRateLimitResetCredits(accessToken);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load Codex reset credits" },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { accessToken } = await getValidCodexToken(id);
    const consumeResult = await consumeCodexRateLimitResetCredit(accessToken);

    if (consumeResult.noCredit) {
      return NextResponse.json(
        {
          success: false,
          code: "no_credit",
          message: "No Codex reset credits available for this account.",
        },
        { status: 409 }
      );
    }

    if (!consumeResult.ok) {
      return NextResponse.json(
        {
          success: false,
          code: consumeResult.code || "unknown_error",
          message: consumeResult.message || "Failed to consume reset credit",
        },
        { status: consumeResult.status >= 400 && consumeResult.status < 500 ? consumeResult.status : 502 }
      );
    }

    // Proactively sync quota in background to reflect reset limits
    syncConnectionQuota(id).catch(() => {});

    return NextResponse.json({
      success: true,
      data: consumeResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to consume Codex reset credit" },
      { status: 500 }
    );
  }
}
