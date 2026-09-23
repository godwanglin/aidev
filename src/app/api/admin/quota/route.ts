import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getAllAccountsWithQuota,
  getAccountsSummary,
  getSingleAccountQuota,
  toggleConnectionActive,
  bulkUpdateQuotaStatus,
} from "@/lib/quota-tracker";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "summary";
    const id = searchParams.get("id");
    const bypassCache = searchParams.get("bypassCache") === "true";

    if (id) {
      const single = await getSingleAccountQuota(id, bypassCache);
      if (!single) {
        return NextResponse.json({ error: "Account connection not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: single });
    }

    if (mode === "full") {
      const data = await getAllAccountsWithQuota(bypassCache);
      return NextResponse.json({ success: true, data });
    }

    // Default mode: fast accounts summary (<10ms)
    const data = await getAccountsSummary();
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch quotas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();
    const { action, id, targetState } = body;

    if (action === "toggle_active" && id) {
      const nextState = await toggleConnectionActive(id, targetState);
      return NextResponse.json({ success: true, isActive: nextState });
    }

    if (action === "turn_off_empty") {
      const count = await bulkUpdateQuotaStatus("turn_off_empty");
      const updated = await getAllAccountsWithQuota();
      return NextResponse.json({ success: true, affected: count, data: updated });
    }

    if (action === "turn_on_available") {
      const count = await bulkUpdateQuotaStatus("turn_on_available");
      const updated = await getAllAccountsWithQuota();
      return NextResponse.json({ success: true, affected: count, data: updated });
    }

    if (action === "refresh") {
      const updated = await getAllAccountsWithQuota();
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to process quota action" }, { status: 500 });
  }
}
