import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { invalidateModelsCache } from "@/lib/models-cache";
import { validateModelForProvider } from "@/lib/model-normalizer";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

// GET all models (Admin view)
export async function GET(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const where: any = {};
    if (search) {
      where.OR = [
        { modelId: { contains: search } },
        { name: { contains: search } },
        { provider: { contains: search } },
      ];
    }

    const [models, combos] = await Promise.all([
      prisma.aiModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
      prisma.comboModel.findMany({
        where: search
          ? {
              OR: [
                { comboId: { contains: search } },
                { name: { contains: search } },
                { description: { contains: search } },
              ],
            }
          : undefined,
        include: {
          items: {
            orderBy: { priority: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const comboModelsMapped = combos.map((c) => ({
      id: c.id,
      modelId: c.comboId,
      name: c.name,
      provider: "COMBO",
      promptCost: 0,
      completionCost: 0,
      contextWindow: `${c.items.length} targets (${c.strategy === "ROUND_ROBIN" ? "Rotate" : "Fallback"})`,
      isActive: c.isActive,
      isPublic: c.isPublic,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      isCombo: true,
      comboStrategy: c.strategy,
      comboItems: c.items.map((i) => i.modelId),
      firstCandidate: c.items[0]?.modelId || null,
    }));

    return NextResponse.json({ success: true, data: [...models, ...comboModelsMapped] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST create new model
export async function POST(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();
    const { modelId, name, provider, promptCost, completionCost, contextWindow, isActive, isPublic } = body;

    if (!modelId || !name || !provider) {
      return NextResponse.json({ error: "Model ID, Name, and Provider are required" }, { status: 400 });
    }

    const existing = await prisma.aiModel.findUnique({
      where: { modelId: modelId.trim() },
    });

    if (existing) {
      return NextResponse.json({ error: `Model ID '${modelId}' already exists.` }, { status: 400 });
    }

    const created = await prisma.aiModel.create({
      data: {
        modelId: modelId.trim(),
        name: name.trim(),
        provider: provider.trim(),
        promptCost: Number(promptCost) || 0,
        completionCost: Number(completionCost) || 0,
        contextWindow: contextWindow ? String(contextWindow).trim() : "128k",
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        isPublic: isPublic !== undefined ? Boolean(isPublic) : true,
      },
    });

    invalidateModelsCache();

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT update existing model or combo
export async function PUT(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const body = await req.json();
    const { id, modelId, name, provider, promptCost, completionCost, contextWindow, isActive, isPublic } = body;

    if (!id) {
      return NextResponse.json({ error: "Model ID (uuid) is required" }, { status: 400 });
    }

    // Check if it's a ComboModel
    const existingCombo = await prisma.comboModel.findUnique({ where: { id } });
    if (existingCombo) {
      const updatedCombo = await prisma.comboModel.update({
        where: { id },
        data: {
          ...(modelId ? { comboId: modelId.trim() } : {}),
          ...(name ? { name: name.trim() } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          ...(isPublic !== undefined ? { isPublic: Boolean(isPublic) } : {}),
        },
      });

      invalidateModelsCache();
      return NextResponse.json({ success: true, data: updatedCombo });
    }

    const updated = await prisma.aiModel.update({
      where: { id },
      data: {
        ...(modelId ? { modelId: modelId.trim() } : {}),
        ...(name ? { name: name.trim() } : {}),
        ...(provider ? { provider: provider.trim() } : {}),
        ...(promptCost !== undefined ? { promptCost: Number(promptCost) } : {}),
        ...(completionCost !== undefined ? { completionCost: Number(completionCost) } : {}),
        ...(contextWindow ? { contextWindow: String(contextWindow).trim() } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        ...(isPublic !== undefined ? { isPublic: Boolean(isPublic) } : {}),
      },
    });

    invalidateModelsCache();

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE model or combo
export async function DELETE(req: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Model ID is required" }, { status: 400 });
    }

    // Check if it's a ComboModel
    const existingCombo = await prisma.comboModel.findUnique({ where: { id } });
    if (existingCombo) {
      await prisma.comboModel.delete({ where: { id } });
      invalidateModelsCache();
      return NextResponse.json({ success: true });
    }

    await prisma.aiModel.delete({
      where: { id },
    });

    invalidateModelsCache();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
