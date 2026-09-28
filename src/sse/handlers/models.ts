import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getModelCapabilities } from "@/lib/model-capabilities";

/**
 * Handler for GET /v1/models (9router pattern)
 * By default, returns text/chat LLM models.
 * Excludes image models unless ?type=image or ?type=all is requested.
 */
export async function handleModelsList(req?: NextRequest): Promise<NextResponse> {
  const url = req ? new URL(req.url) : null;
  const requestedType = url?.searchParams.get("type")?.toLowerCase().trim() || null;

  // By default (or ?type=chat), hide image models from general LLM dropdown
  // If ?type=image, only return image models
  // If ?type=all, return all models
  const whereClause: any = { isActive: true, isPublic: true };
  if (requestedType === "image") {
    whereClause.type = "image";
  } else if (requestedType === "all") {
    // No type filter, return everything
  } else {
    // Default: exclude image models so they don't pollute chat dropdown
    whereClause.type = { not: "image" };
  }

  const dbCombos = await prisma.comboModel.findMany({
    where: whereClause,
    include: {
      items: {
        where: { isActive: true },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const seenIds = new Set<string>();
  const entries: any[] = [];

  for (const c of dbCombos) {
    if (seenIds.has(c.comboId)) continue;
    seenIds.add(c.comboId);

    const isImageModel = c.type === "image";
    const firstItem = c.items[0]?.modelId || "";
    const firstItemLower = firstItem.toLowerCase();
    const ownedBy = firstItemLower.startsWith("cx/") || c.comboId.includes("gpt")
      ? "openai"
      : firstItemLower.startsWith("cc/") || c.comboId.includes("claude")
      ? "anthropic"
      : firstItemLower.startsWith("ag/") || c.comboId.includes("gemini")
      ? "google"
      : firstItemLower.startsWith("deepseek/") || c.comboId.includes("deepseek")
      ? "deepseek"
      : firstItemLower.startsWith("or/") || c.comboId.includes("openrouter")
      ? "openrouter"
      : "system";

    const effectiveModelId = (c.comboId.toLowerCase().includes("v4") ? c.comboId : firstItem) || c.comboId;
    const caps = isImageModel
      ? {
          context_length: 0,
          max_completion_tokens: 0,
          capabilities: {
            chat: false,
            image_generation: true,
            vision: false,
            tools: false,
          },
        }
      : getModelCapabilities(effectiveModelId, ownedBy);

    entries.push({
      id: c.comboId,
      name: c.name,
      display_name: c.name,
      object: "model",
      type: c.type || "chat",
      cost_per_image: isImageModel ? c.costPerImage : undefined,
      created: Math.floor(new Date(c.createdAt).getTime() / 1000),
      owned_by: ownedBy,
      permission: [],
      root: c.comboId,
      parent: null,
      context_length: caps.context_length,
      max_completion_tokens: caps.max_completion_tokens,
      capabilities: caps.capabilities,
    });
  }

  return NextResponse.json({
    object: "list",
    data: entries,
  });
}

/**
 * Handler for GET /v1/models/:modelId (9router pattern)
 */
export async function handleModelDetail(modelId: string): Promise<NextResponse> {
  const decodedModelId = decodeURIComponent(modelId);

  const dbModel = await prisma.aiModel.findFirst({
    where: { modelId: decodedModelId, isActive: true },
  });

  if (dbModel) {
    const isImageModel = dbModel.type === "image";
    const caps = isImageModel
      ? {
          context_length: 0,
          max_completion_tokens: 0,
          capabilities: {
            chat: false,
            image_generation: true,
            vision: false,
            tools: false,
          },
        }
      : getModelCapabilities(dbModel.modelId, dbModel.provider);

    return NextResponse.json({
      id: dbModel.modelId,
      name: dbModel.name,
      display_name: dbModel.name,
      object: "model",
      type: dbModel.type || "chat",
      created: Math.floor(new Date(dbModel.createdAt).getTime() / 1000),
      owned_by: dbModel.provider.toLowerCase(),
      permission: [],
      root: dbModel.modelId,
      parent: null,
      context_length: caps.context_length,
      max_completion_tokens: caps.max_completion_tokens,
      capabilities: caps.capabilities,
    });
  }

  const dbCombo = await prisma.comboModel.findFirst({
    where: { comboId: decodedModelId, isActive: true },
    include: { items: { where: { isActive: true }, orderBy: { priority: "asc" } } },
  });

  if (dbCombo) {
    const isImageModel = dbCombo.type === "image";
    const firstItem = dbCombo.items[0]?.modelId || "";
    const firstItemLower = firstItem.toLowerCase();
    const ownedBy = firstItemLower.startsWith("cx/") || dbCombo.comboId.includes("gpt")
      ? "openai"
      : firstItemLower.startsWith("cc/") || dbCombo.comboId.includes("claude")
      ? "anthropic"
      : firstItemLower.startsWith("ag/") || dbCombo.comboId.includes("gemini")
      ? "google"
      : firstItemLower.startsWith("deepseek/") || dbCombo.comboId.includes("deepseek")
      ? "deepseek"
      : firstItemLower.startsWith("or/") || dbCombo.comboId.includes("openrouter")
      ? "openrouter"
      : "system";
    const effectiveModelId = (dbCombo.comboId.toLowerCase().includes("v4") ? dbCombo.comboId : firstItem) || dbCombo.comboId;
    const caps = isImageModel
      ? {
          context_length: 0,
          max_completion_tokens: 0,
          capabilities: {
            chat: false,
            image_generation: true,
            vision: false,
            tools: false,
          },
        }
      : getModelCapabilities(effectiveModelId, ownedBy);

    return NextResponse.json({
      id: dbCombo.comboId,
      name: dbCombo.name,
      display_name: dbCombo.name,
      object: "model",
      type: dbCombo.type || "chat",
      cost_per_image: isImageModel ? dbCombo.costPerImage : undefined,
      created: Math.floor(new Date(dbCombo.createdAt).getTime() / 1000),
      owned_by: dbCombo.comboId,
      permission: [],
      root: dbCombo.comboId,
      parent: null,
      context_length: caps.context_length,
      max_completion_tokens: caps.max_completion_tokens,
      capabilities: caps.capabilities,
    });
  }

  // Dynamic fallback for arbitrary models
  const caps = getModelCapabilities(decodedModelId, "custom");
  return NextResponse.json({
    id: decodedModelId,
    object: "model",
    type: "chat",
    created: Math.floor(Date.now() / 1000),
    owned_by: caps.owned_by,
    permission: [],
    root: decodedModelId,
    parent: null,
    context_length: caps.context_length,
    max_completion_tokens: caps.max_completion_tokens,
    capabilities: caps.capabilities,
  });
}
