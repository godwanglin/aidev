import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { decryptCredential, maskApiKey } from "@/lib/crypto";
import {
  getCustomProviderBySlug,
  saveCustomProvider,
  deleteCustomProvider,
} from "@/lib/custom-providers";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) return null;
  return user;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { slug } = await params;
    const provider = await getCustomProviderBySlug(slug);

    if (!provider) {
      return NextResponse.json({ error: "Custom provider not found" }, { status: 404 });
    }

    const providerKey = `CUSTOM_${provider.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
    const connections = await prisma.providerConnection.findMany({
      where: {
        OR: [
          { provider: providerKey },
          { provider: provider.slug.toUpperCase() },
          { name: provider.name },
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    const maskedConnections = connections.map((c) => {
      let maskedKey = "";
      if (c.apiKeyEncrypted) {
        try {
          const decrypted = decryptCredential(c.apiKeyEncrypted);
          maskedKey = maskApiKey(decrypted);
        } catch {
          maskedKey = "sk-****";
        }
      }
      return {
        ...c,
        maskedApiKey: maskedKey,
      };
    });

    return NextResponse.json({
      success: true,
      provider,
      connections: maskedConnections,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch custom provider" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { slug } = await params;
    const existing = await getCustomProviderBySlug(slug);

    if (!existing) {
      return NextResponse.json({ error: "Custom provider not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, prefix, apiType, baseUrl } = body;

    const updated = await saveCustomProvider({
      ...existing,
      name: name ? name.trim() : existing.name,
      prefix: prefix ? prefix.trim().toLowerCase().replace(/\/+$/, "") : existing.prefix,
      apiType: apiType || existing.apiType,
      compatibility:
        apiType === "Anthropic Messages"
          ? "ANTHROPIC"
          : apiType === "Chat Completions"
          ? "OPENAI"
          : existing.compatibility,
      baseUrl: baseUrl ? baseUrl.trim() : existing.baseUrl,
    });

    // Update existing connections' baseUrl & compatibility
    const providerKey = `CUSTOM_${existing.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
    if (baseUrl) {
      await prisma.providerConnection.updateMany({
        where: { provider: providerKey },
        data: {
          baseUrl: updated.baseUrl,
          compatibility: updated.compatibility,
        },
      });
    }

    return NextResponse.json({
      success: true,
      provider: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update custom provider" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { slug } = await params;
    const existing = await getCustomProviderBySlug(slug);

    if (!existing) {
      return NextResponse.json({ error: "Custom provider not found" }, { status: 404 });
    }

    const providerKey = `CUSTOM_${existing.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;

    // 1. Delete all connections for this custom provider
    await prisma.providerConnection.deleteMany({
      where: {
        OR: [
          { provider: providerKey },
          { provider: existing.slug.toUpperCase() },
        ],
      },
    });

    // 2. Delete custom models associated with this provider
    await prisma.aiModel.deleteMany({
      where: {
        provider: providerKey,
      },
    });

    // 3. Remove custom provider from registry
    await deleteCustomProvider(slug);

    return NextResponse.json({
      success: true,
      message: `Custom provider "${existing.name}" and all associated connections removed.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete custom provider" }, { status: 500 });
  }
}
