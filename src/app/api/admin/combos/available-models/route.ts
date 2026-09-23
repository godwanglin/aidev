import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { SHARED_PROVIDER_MODELS } from "@/lib/oauth/config";
import { PROVIDER_PREFIX_REGISTRY } from "@/lib/model-normalizer";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // 1. Get all models currently in the database
    const dbModels = await prisma.aiModel.findMany({
      orderBy: { createdAt: "desc" },
    });

    const dbModelIds = new Set(dbModels.map((m) => m.modelId.toLowerCase()));

    // 2. Collect models from SHARED_PROVIDER_MODELS
    const catalogModels: {
      id: string;
      modelId: string;
      name: string;
      provider: string;
      source: "catalog";
    }[] = [];

    for (const [providerKey, list] of Object.entries(SHARED_PROVIDER_MODELS)) {
      for (const item of list) {
        if (!dbModelIds.has(item.id.toLowerCase())) {
          catalogModels.push({
            id: `catalog-${providerKey}-${item.id}`,
            modelId: item.id,
            name: item.name,
            provider: providerKey,
            source: "catalog",
          });
        }
      }
    }

    // 3. Collect virtual models from PROVIDER_PREFIX_REGISTRY
    for (const reg of PROVIDER_PREFIX_REGISTRY) {
      if (reg.virtualModelMap) {
        for (const [virtualName] of Object.entries(reg.virtualModelMap)) {
          const fullModelId = `${reg.prefix}${virtualName}`;
          if (
            !dbModelIds.has(fullModelId.toLowerCase()) &&
            !catalogModels.some((cm) => cm.modelId.toLowerCase() === fullModelId.toLowerCase())
          ) {
            catalogModels.push({
              id: `reg-${reg.providerId}-${virtualName}`,
              modelId: fullModelId,
              name: virtualName.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              provider: reg.providerId,
              source: "catalog",
            });
          }
        }
      }
    }

    // 4. Merge DB models and Catalog models
    const allModels = [
      ...dbModels.map((m) => ({
        id: m.id,
        modelId: m.modelId,
        name: m.name,
        provider: m.provider,
        source: "database" as const,
      })),
      ...catalogModels,
    ];

    return NextResponse.json({ success: true, data: allModels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
