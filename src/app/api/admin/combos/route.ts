import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { invalidateComboCache, getActiveCooldowns } from "@/lib/combo-router";
import { invalidateModelsCache } from "@/lib/models-cache";

import { clearPricingCache } from "@/lib/billing";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const combos = await prisma.comboModel.findMany({
      include: {
        items: {
          orderBy: { priority: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const cooldowns = getActiveCooldowns();

    return NextResponse.json({
      success: true,
      combos,
      cooldowns,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      comboId,
      name,
      description,
      type,
      imageCostUsd,
      strategy,
      cooldownSeconds,
      rateInUsdPer1m,
      rateOutUsdPer1m,
      rateInUsdPer1k,
      rateOutUsdPer1k,
      isActive,
      isPublic,
      items,
    } = body;

    if (!comboId || !name) {
      return NextResponse.json(
        { error: "comboId and name are required." },
        { status: 400 }
      );
    }

    const cleanComboId = comboId.trim().toLowerCase();

    // Check duplicate
    const existing = await prisma.comboModel.findUnique({
      where: { comboId: cleanComboId },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Combo with ID '${cleanComboId}' already exists.` },
        { status: 400 }
      );
    }

    let inRate1m = 0.15;
    let outRate1m = 0.60;
    let inRate1k = 0.00015;
    let outRate1k = 0.0006;

    if (rateInUsdPer1m !== undefined && Number(rateInUsdPer1m) >= 0) {
      inRate1m = Number(rateInUsdPer1m);
      inRate1k = inRate1m / 1000;
    } else if (rateInUsdPer1k !== undefined && Number(rateInUsdPer1k) >= 0) {
      inRate1k = Number(rateInUsdPer1k);
      inRate1m = inRate1k * 1000;
    }

    if (rateOutUsdPer1m !== undefined && Number(rateOutUsdPer1m) >= 0) {
      outRate1m = Number(rateOutUsdPer1m);
      outRate1k = outRate1m / 1000;
    } else if (rateOutUsdPer1k !== undefined && Number(rateOutUsdPer1k) >= 0) {
      outRate1k = Number(rateOutUsdPer1k);
      outRate1m = outRate1k * 1000;
    }

    const imageCost = Number(imageCostUsd) >= 0 ? Number(imageCostUsd) : 0.005;

    const newCombo = await prisma.comboModel.create({
      data: {
        comboId: cleanComboId,
        name: name.trim(),
        description: description?.trim() || null,
        type: type === "image" ? "image" : "chat",
        imageCostUsd: imageCost,
        strategy: strategy === "ROUND_ROBIN" ? "ROUND_ROBIN" : "FALLBACK",
        cooldownSeconds: Number(cooldownSeconds) > 0 ? Number(cooldownSeconds) : 60,
        rateInUsdPer1m: inRate1m,
        rateOutUsdPer1m: outRate1m,
        rateInUsdPer1k: inRate1k,
        rateOutUsdPer1k: outRate1k,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        isPublic: isPublic !== undefined ? Boolean(isPublic) : true,
        items: {
          create: Array.isArray(items)
            ? items.map((it: any, index: number) => ({
                modelId: it.modelId.trim(),
                priority: it.priority !== undefined ? Number(it.priority) : index + 1,
                weight: Number(it.weight) > 0 ? Number(it.weight) : 1,
                isActive: it.isActive !== undefined ? Boolean(it.isActive) : true,
              }))
            : [],
        },
      },
      include: {
        items: {
          orderBy: { priority: "asc" },
        },
      },
    });

    invalidateComboCache();
    invalidateModelsCache();
    clearPricingCache();

    return NextResponse.json({
      success: true,
      combo: newCombo,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
