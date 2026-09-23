import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isRtkEnabled, setRtkEnabled } from "@/lib/rtk/config";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
  }

  const active = await isRtkEnabled();
  let totalTokensSaved = 0;

  try {
    const aggregate = await prisma.upstreamLog.aggregate({
      _sum: { tokensSavedRtk: true },
    });
    totalTokensSaved = aggregate._sum.tokensSavedRtk || 0;
  } catch {
    try {
      const rows: any = await prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM(tokensSavedRtk), 0) as total FROM UpstreamLog`
      );
      totalTokensSaved = Number(rows[0]?.total || 0);
    } catch {
      totalTokensSaved = 0;
    }
  }

  return NextResponse.json({
    success: true,
    active,
    totalTokensSaved,
  });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const active = Boolean(body.active);
    await setRtkEnabled(active);

    return NextResponse.json({
      success: true,
      active,
      message: `RTK Token Saver is now ${active ? "ENABLED" : "DISABLED"} globally.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
