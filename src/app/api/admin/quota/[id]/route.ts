import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getSingleAccountQuota } from "@/lib/quota-tracker";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const bypassCache = searchParams.get("bypassCache") === "true";

    const accountQuota = await getSingleAccountQuota(id, bypassCache);
    if (!accountQuota) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: accountQuota });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch account quota" },
      { status: 500 }
    );
  }
}
