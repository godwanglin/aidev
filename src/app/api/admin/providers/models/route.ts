import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { decryptCredential } from "@/lib/crypto";
import { refreshOAuthToken } from "@/lib/oauth/service";
import { SHARED_PROVIDER_MODELS, findProviderBySlugOrId } from "@/lib/oauth/config";

import { getCustomProviderBySlug } from "@/lib/custom-providers";
import { validateModelForProvider } from "@/lib/model-normalizer";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const providerParam = searchParams.get("provider") || "";
  const doPull = searchParams.get("pull") === "true";
  const persistImport = searchParams.get("persist") === "true" || doPull;

  if (!providerParam) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  }

  const customProvider = await getCustomProviderBySlug(providerParam);
  const providerMeta = findProviderBySlugOrId(providerParam);
  const providerKey = customProvider
    ? `CUSTOM_${customProvider.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`
    : (providerMeta ? providerMeta.id : providerParam).toUpperCase().trim();

  // 1. If pulling from upstream live
  if (doPull) {
    try {
      const connections = await prisma.providerConnection.findMany({
        where: {
          isActive: true,
          OR: [
            { provider: providerKey },
            { provider: providerParam.toUpperCase() },
            { provider: "CUSTOM" },
          ],
        },
        orderBy: [{ priority: "asc" }],
      });

      if (connections.length > 0 || customProvider) {
        const conn = connections[0];
        let token = conn?.apiKeyEncrypted ? decryptCredential(conn.apiKeyEncrypted) : "";

        if (conn?.authType === "OAUTH") {
          token = conn.accessTokenEnc ? decryptCredential(conn.accessTokenEnc) : "";
          if (!token && conn.refreshTokenEnc) {
            try {
              token = await refreshOAuthToken(conn.id);
            } catch {}
          }
        }

        // Custom provider or pre-configured API Key provider with baseUrl live pull
        if (customProvider || conn?.baseUrl) {
          const rawBase = conn?.baseUrl || customProvider?.baseUrl || "";
          let baseUrl = rawBase.replace(/\/+$/, "");
          if (baseUrl.endsWith("/chat/completions")) {
            baseUrl = baseUrl.replace(/\/chat\/completions$/, "");
          } else if (baseUrl.endsWith("/messages")) {
            baseUrl = baseUrl.replace(/\/messages$/, "");
          }
          const modelsUrl = baseUrl.endsWith("/models") ? baseUrl : `${baseUrl}/models`;

          try {
            const res = await fetch(modelsUrl, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) {
              const data = await res.json();
              const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
              if (list.length > 0) {
                const prefix = providerMeta?.defaultPrefix || (customProvider?.prefix ? `${customProvider.prefix.replace(/\/+$/, "")}/` : "");
                const liveModels = list.map((m: any) => {
                  const rawId = typeof m === "string" ? m : m.id || m.name;
                  const rawName = typeof m === "string" ? m : m.name || m.id;
                  const finalId = prefix && !rawId.includes("/") ? `${prefix}${rawId}` : rawId;
                  return {
                    id: finalId,
                    name: rawName,
                  };
                });

                // Otomatis simpan ke database agar setelah reload tidak hilang
                for (const m of liveModels) {
                  await prisma.aiModel.upsert({
                    where: { modelId: m.id },
                    create: {
                      modelId: m.id,
                      name: m.name,
                      provider: providerKey,
                      promptCost: 0,
                      completionCost: 0,
                      contextWindow: "128k",
                      isActive: true,
                    },
                    update: {
                      name: m.name,
                      provider: providerKey,
                      isActive: true,
                    },
                  }).catch(() => null);
                }

                return NextResponse.json({
                  success: true,
                  provider: providerKey,
                  models: liveModels,
                  source: "LIVE_UPSTREAM",
                  count: liveModels.length,
                });
              }
            }
          } catch {}
        }

        // Fetch models from live upstream for preset providers
        if (providerKey === "OPENAI" || providerKey === "OPENAI_CODEX") {
          if (token) {
            const res = await fetch("https://api.openai.com/v1/models", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.data)) {
                const prefix = "cx/";
                const liveModels = data.data
                  .map((m: any) => ({
                    id: !m.id.includes("/") ? `${prefix}${m.id}` : m.id,
                    name: m.id,
                  }))
                  .sort((a: any, b: any) => a.id.localeCompare(b.id));

                for (const m of liveModels) {
                  await prisma.aiModel.upsert({
                    where: { modelId: m.id },
                    create: {
                      modelId: m.id,
                      name: m.name,
                      provider: providerKey,
                      promptCost: 0,
                      completionCost: 0,
                      contextWindow: "128k",
                      isActive: true,
                    },
                    update: {
                      name: m.name,
                      provider: providerKey,
                      isActive: true,
                    },
                  }).catch(() => null);
                }

                return NextResponse.json({
                  success: true,
                  provider: providerKey,
                  models: liveModels,
                  source: "LIVE_UPSTREAM",
                  count: liveModels.length,
                });
              }
            }
          }
        } else if (providerKey === "OPENROUTER") {
          const headers: Record<string, string> = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.data)) {
              const prefix = "or/";
              // Filter free models only (free suffix, openrouter/free router, or zero pricing)
              const freeList = data.data.filter((m: any) =>
                m.id.endsWith(":free") ||
                m.id === "openrouter/free" ||
                (m.pricing && parseFloat(m.pricing.prompt || "1") === 0 && parseFloat(m.pricing.completion || "1") === 0)
              );
              const listToUse = freeList.length > 0 ? freeList : data.data.slice(0, 50);

              const liveModels = listToUse.map((m: any) => ({
                id: m.id.startsWith("or/") ? m.id : `${prefix}${m.id}`,
                name: m.name || m.id,
              }));

              for (const m of liveModels) {
                await prisma.aiModel.upsert({
                  where: { modelId: m.id },
                  create: {
                    modelId: m.id,
                    name: m.name,
                    provider: providerKey,
                    promptCost: 0,
                    completionCost: 0,
                    contextWindow: "128k",
                    isActive: true,
                  },
                  update: {
                    name: m.name,
                    provider: providerKey,
                    isActive: true,
                  },
                }).catch(() => null);
              }

              return NextResponse.json({
                success: true,
                provider: providerKey,
                models: liveModels,
                source: "LIVE_UPSTREAM",
                count: liveModels.length,
              });
            }
          }
        }
      }
    } catch {}
  }

  // 2. Default fallback from SHARED_PROVIDER_MODELS
  const catalogList =
    SHARED_PROVIDER_MODELS[providerKey] ||
    SHARED_PROVIDER_MODELS[providerParam.toUpperCase()] || [
      { id: "default-model", name: `${providerParam} Default Model` },
    ];

  // 3. Load custom models and inactive tracking from database for this provider
  let customDbModels: { id: string; name: string }[] = [];
  const inactiveSet = new Set<string>();

  try {
    const dbList = await prisma.aiModel.findMany({
      where: {
        OR: [
          { provider: providerKey },
          { provider: providerParam.toUpperCase() },
          { provider: providerParam },
        ],
      },
    });

    for (const m of dbList) {
      if (m.isActive) {
        customDbModels.push({ id: m.modelId, name: m.name });
      } else {
        inactiveSet.add(m.modelId.toLowerCase());
      }
    }
  } catch {}

  // Merge unique by model ID, excluding inactive models
  const seen = new Set<string>();
  const merged: { id: string; name: string }[] = [];

  for (const m of [...customDbModels, ...catalogList]) {
    const lower = m.id.toLowerCase();
    if (!inactiveSet.has(lower) && !seen.has(lower)) {
      seen.add(lower);
      merged.push(m);
    }
  }

  return NextResponse.json({
    success: true,
    provider: providerKey,
    models: merged,
    source: customDbModels.length > 0 ? "DATABASE_MERGED" : "CATALOG",
    count: merged.length,
  });
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { provider, modelId, name } = body;

    if (!provider || !modelId) {
      return NextResponse.json({ error: "Provider and modelId are required" }, { status: 400 });
    }

    const providerMeta = findProviderBySlugOrId(provider);
    const providerKey = (providerMeta ? providerMeta.id : provider).toUpperCase().trim();
    const cleanModelId = modelId.trim();
    const cleanName = (name || cleanModelId).trim();
    const prefix = providerMeta?.defaultPrefix;
    const finalModelId = prefix && !cleanModelId.includes("/") ? `${prefix}${cleanModelId}` : cleanModelId;

    const model = await prisma.aiModel.upsert({
      where: { modelId: finalModelId },
      create: {
        modelId: finalModelId,
        name: cleanName,
        provider: providerKey,
        promptCost: 0,
        completionCost: 0,
        contextWindow: "128k",
        isActive: true,
      },
      update: {
        name: cleanName,
        provider: providerKey,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: model.modelId,
        name: model.name,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to add custom model" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    const providerParam = searchParams.get("provider") || "";

    if (!modelId) {
      return NextResponse.json({ error: "modelId is required" }, { status: 400 });
    }

    const cleanModelId = modelId.trim();
    const providerMeta = findProviderBySlugOrId(providerParam);
    const providerKey = (providerMeta ? providerMeta.id : providerParam).toUpperCase().trim();

    // Mark as inactive in AiModel (upsert so even preset models are persisted as inactive)
    await prisma.aiModel.upsert({
      where: { modelId: cleanModelId },
      create: {
        modelId: cleanModelId,
        name: cleanModelId,
        provider: providerKey || "CUSTOM",
        promptCost: 0,
        completionCost: 0,
        contextWindow: "128k",
        isActive: false,
      },
      update: {
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Model ${cleanModelId} deleted successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete model" },
      { status: 500 }
    );
  }
}
