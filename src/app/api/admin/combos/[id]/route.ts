import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { invalidateComboCache } from "@/lib/combo-router";
import { invalidateModelsCache } from "@/lib/models-cache";

import { clearPricingCache } from "@/lib/credits";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

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

    const existing = await prisma.comboModel.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Combo not found." }, { status: 404 });
    }

    const cleanComboId = comboId ? comboId.trim().toLowerCase() : existing.comboId;

    // Check duplicate comboId if changing
    if (cleanComboId !== existing.comboId) {
      const duplicate = await prisma.comboModel.findUnique({
        where: { comboId: cleanComboId },
      });
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json(
          { error: `Combo ID '${cleanComboId}' is already taken.` },
          { status: 400 }
        );
      }
    }

    const inRate = rateInPer1k !== undefined && Number(rateInPer1k) >= 0 ? Math.round(Number(rateInPer1k)) : existing.rateInPer1k;
    const outRate = rateOutPer1k !== undefined && Number(rateOutPer1k) >= 0 ? Math.round(Number(rateOutPer1k)) : existing.rateOutPer1k;

    // Execute update transaction
    const updated = await prisma.$transaction(async (tx) => {
      // If items are provided, replace them
      if (Array.isArray(items)) {
        await tx.comboModelItem.deleteMany({
          where: { comboModelId: id },
        });

        if (items.length > 0) {
          await tx.comboModelItem.createMany({
            data: items.map((it: any, index: number) => ({
              comboModelId: id,
              modelId: it.modelId.trim(),
              priority: it.priority !== undefined ? Number(it.priority) : index + 1,
              weight: Number(it.weight) > 0 ? Number(it.weight) : 1,
              isActive: it.isActive !== undefined ? Boolean(it.isActive) : true,
            })),
          });
        }
      }

      return tx.comboModel.update({
        where: { id },
        data: {
          comboId: cleanComboId,
          name: name !== undefined ? name.trim() : existing.name,
          description: description !== undefined ? (description?.trim() || null) : existing.description,
          strategy: strategy === "ROUND_ROBIN" ? "ROUND_ROBIN" : strategy === "FALLBACK" ? "FALLBACK" : existing.strategy,
          cooldownSeconds: Number(cooldownSeconds) > 0 ? Number(cooldownSeconds) : existing.cooldownSeconds,
          rateInPer1k: inRate,
          rateOutPer1k: outRate,
          isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
          isPublic: isPublic !== undefined ? Boolean(isPublic) : existing.isPublic,
        },
        include: {
          items: {
            orderBy: { priority: "asc" },
          },
        },
      });
    });

    invalidateComboCache();
    invalidateModelsCache();
    clearPricingCache();

    return NextResponse.json({
      success: true,
      combo: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.comboModel.delete({
      where: { id },
    });

    invalidateComboCache();
    invalidateModelsCache();

    return NextResponse.json({ success: true, message: "Combo deleted successfully." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
