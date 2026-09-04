import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { invalidateConfigCache } from "@/lib/discount";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const config = await prisma.systemSetting.upsert({
      where: { id: "global_config" },
      update: {},
      create: { id: "global_config" },
    });

    return NextResponse.json({
      success: true,
      config: {
        ...config,
        highUsageThresholdTokens: config.highUsageThresholdTokens.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();
    const {
      promoDiscountActive,
      promoDiscountPct,
      promoDurationHours,
      firstTopupDiscountActive,
      firstTopupDiscountPct,
      highUsageDiscountActive,
      highUsageThresholdTokens,
      highUsageDiscountPct,
      highUsageDays,
    } = body;

    let promoExpiresAt: Date | null = null;
    let promoStartedAt: Date | null = null;


    if (promoDiscountActive) {
      promoStartedAt = new Date();
      const durationMs = (Number(promoDurationHours) || 24) * 60 * 60 * 1000;
      promoExpiresAt = new Date(Date.now() + durationMs);
    }


    const config = await prisma.systemSetting.upsert({
      where: { id: "global_config" },
      update: {
        promoDiscountActive: Boolean(promoDiscountActive),
        promoDiscountPct: Number(promoDiscountPct) || 0,
        promoStartedAt,
        promoExpiresAt,
        firstTopupDiscountActive: Boolean(firstTopupDiscountActive),
        firstTopupDiscountPct: Number(firstTopupDiscountPct) || 0,
        highUsageDiscountActive: Boolean(highUsageDiscountActive),
        highUsageThresholdTokens: BigInt(highUsageThresholdTokens || 50000000),
        highUsageDiscountPct: Number(highUsageDiscountPct) || 0,
        highUsageDays: Number(highUsageDays) || 3,
      },
      create: {
        id: "global_config",
        promoDiscountActive: Boolean(promoDiscountActive),
        promoDiscountPct: Number(promoDiscountPct) || 0,
        promoStartedAt,
        promoExpiresAt,
        firstTopupDiscountActive: Boolean(firstTopupDiscountActive),
        firstTopupDiscountPct: Number(firstTopupDiscountPct) || 0,
        highUsageDiscountActive: Boolean(highUsageDiscountActive),
        highUsageThresholdTokens: BigInt(highUsageThresholdTokens || 50000000),
        highUsageDiscountPct: Number(highUsageDiscountPct) || 0,
        highUsageDays: Number(highUsageDays) || 3,
      },
    });


    invalidateConfigCache();

    return NextResponse.json({
      success: true,
      config: {
        ...config,
        highUsageThresholdTokens: config.highUsageThresholdTokens.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
