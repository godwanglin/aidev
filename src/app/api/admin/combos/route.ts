import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { invalidateComboCache, getActiveCooldowns } from "@/lib/combo-router";
import { invalidateModelsCache } from "@/lib/models-cache";

import { clearPricingCache } from "@/lib/credits";

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
      strategy,
      cooldownSeconds,
      rateInPer1k,
      rateOutPer1k,
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

    const inRate = Number(rateInPer1k) >= 0 ? Math.round(Number(rateInPer1k)) : 25;
    const outRate = Number(rateOutPer1k) >= 0 ? Math.round(Number(rateOutPer1k)) : 100;

    const newCombo = await prisma.comboModel.create({
      data: {
        comboId: cleanComboId,
        name: name.trim(),
        description: description?.trim() || null,
        strategy: strategy === "ROUND_ROBIN" ? "ROUND_ROBIN" : "FALLBACK",
        cooldownSeconds: Number(cooldownSeconds) > 0 ? Number(cooldownSeconds) : 60,
        rateInPer1k: inRate,
        rateOutPer1k: outRate,
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
