import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { encryptCredential } from "@/lib/crypto";
import { getCustomProviders, saveCustomProvider } from "@/lib/custom-providers";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const customProviders = await getCustomProviders();
    const connections = await prisma.providerConnection.findMany({
      where: {
        OR: [
          { provider: { startsWith: "CUSTOM_" } },
          { provider: "CUSTOM" },
        ],
      },
    });

    // Enrich each custom provider with its connection count
    const enriched = customProviders.map((cp) => {
      const providerKey = `CUSTOM_${cp.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
      const conns = connections.filter(
        (c) =>
          c.provider.toUpperCase() === providerKey ||
          c.provider.toUpperCase() === cp.slug.toUpperCase() ||
          c.name.toLowerCase() === cp.name.toLowerCase()
      );

      const healthy = conns.filter((c) => c.syncStatus === "NORMAL").length;

      return {
        ...cp,
        connectionsCount: conns.length,
        healthyCount: healthy,
        activeCount: conns.filter((c) => c.isActive).length,
      };
    });

    return NextResponse.json({
      success: true,
      customProviders: enriched,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch custom providers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, prefix, apiType = "Chat Completions", baseUrl, apiKey, modelId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!baseUrl || !baseUrl.trim()) {
      return NextResponse.json({ error: "Base URL is required" }, { status: 400 });
    }

    const cleanName = name.trim();
    const cleanSlug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "");

    const cleanPrefix = (prefix || cleanSlug)
      .trim()
      .toLowerCase()
      .replace(/\/+$/, "");

    const compatibility = apiType === "Anthropic Messages" ? "ANTHROPIC" : "OPENAI";

    const savedProvider = await saveCustomProvider({
      name: cleanName,
      slug: cleanSlug,
      prefix: cleanPrefix,
      apiType,
      compatibility,
      baseUrl: baseUrl.trim(),
    });

    const providerKey = `CUSTOM_${cleanSlug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;

    // If an initial API key is provided, create the initial connection
    if (apiKey && apiKey.trim()) {
      const encryptedKey = encryptCredential(apiKey.trim());
      await prisma.providerConnection.create({
        data: {
          provider: providerKey,
          name: `${cleanName} Key 1`,
          authType: "API_KEY",
          apiKeyEncrypted: encryptedKey,
          baseUrl: baseUrl.trim(),
          compatibility,
          priority: 1,
          weight: 1,
          syncStatus: "NORMAL",
          isActive: true,
        },
      });
    }

    // If a test model is provided, add it to AiModel
    if (modelId && modelId.trim()) {
      const cleanModelId = modelId.trim();
      await prisma.aiModel.upsert({
        where: { modelId: cleanModelId },
        create: {
          modelId: cleanModelId,
          name: cleanModelId,
          provider: providerKey,
          promptCost: 0,
          completionCost: 0,
          contextWindow: "128k",
          isActive: true,
        },
        update: {
          provider: providerKey,
          isActive: true,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        provider: savedProvider,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create custom provider" }, { status: 500 });
  }
}
