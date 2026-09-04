import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getMidtransConfig } from "@/lib/midtrans";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

// GET admin settings including Midtrans config
export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const [setting, userCount, totalOrders, totalTopups] = await Promise.all([
      prisma.systemSetting.findUnique({
        where: { id: "global_config" },
      }),
      prisma.user.count(),
      prisma.order.count(),
      prisma.tokenTopup.count(),
    ]);

    const midtransServerKey = setting?.midtransServerKey || process.env.MIDTRANS_SERVER_KEY || "";
    const midtransClientKey = setting?.midtransClientKey || process.env.MIDTRANS_CLIENT_KEY || "";
    const midtransIsProduction = setting?.midtransIsProduction ?? (process.env.MIDTRANS_IS_PRODUCTION === "true");

    return NextResponse.json({
      success: true,
      data: {
        midtransServerKey,
        midtransClientKey,
        midtransIsProduction,
        discordWebhookUrl: setting?.discordWebhookUrl || "",
        stats: {
          userCount,
          totalOrders,
          totalTopups,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT update Midtrans and Admin settings
export async function PUT(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();
    const {
      midtransServerKey,
      midtransClientKey,
      midtransIsProduction,
      discordWebhookUrl,
    } = body;

    const updated = await prisma.systemSetting.upsert({
      where: { id: "global_config" },
      update: {
        ...(midtransServerKey !== undefined ? { midtransServerKey: midtransServerKey ? midtransServerKey.trim() : null } : {}),
        ...(midtransClientKey !== undefined ? { midtransClientKey: midtransClientKey ? midtransClientKey.trim() : null } : {}),
        ...(midtransIsProduction !== undefined ? { midtransIsProduction: Boolean(midtransIsProduction) } : {}),
        ...(discordWebhookUrl !== undefined ? { discordWebhookUrl: discordWebhookUrl ? discordWebhookUrl.trim() : null } : {}),
      },
      create: {
        id: "global_config",
        midtransServerKey: midtransServerKey ? midtransServerKey.trim() : null,
        midtransClientKey: midtransClientKey ? midtransClientKey.trim() : null,
        midtransIsProduction: Boolean(midtransIsProduction),
        discordWebhookUrl: discordWebhookUrl ? discordWebhookUrl.trim() : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Midtrans payment settings updated successfully!",
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
