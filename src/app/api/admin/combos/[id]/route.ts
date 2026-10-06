import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { invalidateComboCache } from "@/lib/combo-router";
import { invalidateModelsCache } from "@/lib/models-cache";
import { clearPricingCache } from "@/lib/billing";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await Promise.resolve(params);
  try {
    const combo = await prisma.comboModel.findFirst({
      where: {
        OR: [{ id }, { comboId: id }],
      },
      include: {
        items: {
          orderBy: { priority: "asc" },
        },
      },
    });

    if (!combo) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, combo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await Promise.resolve(params);
  try {
    const target = await prisma.comboModel.findFirst({
      where: {
        OR: [{ id }, { comboId: id }],
      },
      include: { items: true },
    });

    if (!target) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    const body = await req.json();

    // Check if this is a quick update (inline toggle, strategy switch, or items reorder)
    const isQuickUpdate =
      body.comboId === undefined &&
      body.name === undefined;

    if (isQuickUpdate) {
      const updateData: any = {};
      if (body.isActive !== undefined) updateData.isActive = Boolean(body.isActive);
      if (body.isPublic !== undefined) updateData.isPublic = Boolean(body.isPublic);
      if (body.strategy !== undefined) {
        updateData.strategy = body.strategy === "ROUND_ROBIN" ? "ROUND_ROBIN" : "FALLBACK";
      }
      if (body.cooldownSeconds !== undefined && Number(body.cooldownSeconds) > 0) {
        updateData.cooldownSeconds = Number(body.cooldownSeconds);
      }

      let updatedCombo;

      if (Array.isArray(body.items)) {
        updatedCombo = await prisma.$transaction(async (tx) => {
          await tx.comboModelItem.deleteMany({
            where: { comboModelId: target.id },
          });

          await tx.comboModelItem.createMany({
            data: body.items.map((it: any, index: number) => ({
              comboModelId: target.id,
              modelId: it.modelId.trim(),
              priority: it.priority !== undefined ? Number(it.priority) : index + 1,
              weight: Number(it.weight) > 0 ? Number(it.weight) : 1,
              isActive: it.isActive !== undefined ? Boolean(it.isActive) : true,
            })),
          });

          return tx.comboModel.update({
            where: { id: target.id },
            data: updateData,
            include: {
              items: {
                orderBy: { priority: "asc" },
              },
            },
          });
        });
      } else {
        updatedCombo = await prisma.comboModel.update({
          where: { id: target.id },
          data: updateData,
          include: {
            items: {
              orderBy: { priority: "asc" },
            },
          },
        });
      }

      invalidateComboCache();
      invalidateModelsCache();
      clearPricingCache();

      return NextResponse.json({ success: true, combo: updatedCombo });
    }

    // Full update from edit modal
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

    const cleanComboId = comboId ? comboId.trim().toLowerCase() : target.comboId;

    // Check duplicate if comboId changed
    if (cleanComboId !== target.comboId) {
      const dup = await prisma.comboModel.findUnique({
        where: { comboId: cleanComboId },
      });
      if (dup) {
        return NextResponse.json(
          { error: `Combo with ID '${cleanComboId}' already exists.` },
          { status: 400 }
        );
      }
    }

    // Calculate rates: prefer rateInUsdPer1m / rateOutUsdPer1m (per 1M tokens)
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
    } else {
      inRate1m = Number(target.rateInUsdPer1m || 0.15);
      inRate1k = Number(target.rateInUsdPer1k || 0.00015);
    }

    if (rateOutUsdPer1m !== undefined && Number(rateOutUsdPer1m) >= 0) {
      outRate1m = Number(rateOutUsdPer1m);
      outRate1k = outRate1m / 1000;
    } else if (rateOutUsdPer1k !== undefined && Number(rateOutUsdPer1k) >= 0) {
      outRate1k = Number(rateOutUsdPer1k);
      outRate1m = outRate1k * 1000;
    } else {
      outRate1m = Number(target.rateOutUsdPer1m || 0.60);
      outRate1k = Number(target.rateOutUsdPer1k || 0.0006);
    }

    const imageCost =
      imageCostUsd !== undefined && Number(imageCostUsd) >= 0
        ? Number(imageCostUsd)
        : Number(target.imageCostUsd || 0.005);

    // Update combo model and items in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // If items provided, replace items
      if (Array.isArray(items)) {
        await tx.comboModelItem.deleteMany({
          where: { comboModelId: target.id },
        });

        await tx.comboModelItem.createMany({
          data: items.map((it: any, index: number) => ({
            comboModelId: target.id,
            modelId: it.modelId.trim(),
            priority: it.priority !== undefined ? Number(it.priority) : index + 1,
            weight: Number(it.weight) > 0 ? Number(it.weight) : 1,
            isActive: it.isActive !== undefined ? Boolean(it.isActive) : true,
          })),
        });
      }

      return tx.comboModel.update({
        where: { id: target.id },
        data: {
          comboId: cleanComboId,
          name: name ? name.trim() : target.name,
          description: description !== undefined ? (description?.trim() || null) : target.description,
          type: type === "image" ? "image" : (type === "chat" ? "chat" : target.type || "chat"),
          imageCostUsd: imageCost,
          strategy: strategy === "ROUND_ROBIN" ? "ROUND_ROBIN" : (strategy === "FALLBACK" ? "FALLBACK" : target.strategy || "FALLBACK"),
          cooldownSeconds: Number(cooldownSeconds) > 0 ? Number(cooldownSeconds) : (target.cooldownSeconds || 60),
          rateInUsdPer1m: inRate1m,
          rateOutUsdPer1m: outRate1m,
          rateInUsdPer1k: inRate1k,
          rateOutUsdPer1k: outRate1k,
          isActive: isActive !== undefined ? Boolean(isActive) : target.isActive,
          isPublic: isPublic !== undefined ? Boolean(isPublic) : target.isPublic,
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

    return NextResponse.json({ success: true, combo: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await Promise.resolve(params);
  try {
    const target = await prisma.comboModel.findFirst({
      where: {
        OR: [{ id }, { comboId: id }],
      },
    });

    if (!target) {
      return NextResponse.json({ error: "Combo not found" }, { status: 404 });
    }

    await prisma.comboModel.delete({
      where: { id: target.id },
    });

    invalidateComboCache();
    invalidateModelsCache();
    clearPricingCache();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
