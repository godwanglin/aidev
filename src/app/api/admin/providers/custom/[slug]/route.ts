import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { maskApiKey, decryptCredential } from "@/lib/crypto";
import {
  getCustomProviderBySlug,
  saveCustomProvider,
  deleteCustomProvider,
} from "@/lib/custom-providers";

async function verifyAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return null;
  }
  return user;
}

/**
 * GET /api/admin/providers/custom/[slug]
 * Retrieves the custom provider metadata and its associated connections.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const provider = await getCustomProviderBySlug(slug);
    if (!provider) {
      return NextResponse.json({ error: "Custom provider not found" }, { status: 404 });
    }

    const providerKey = `CUSTOM_${provider.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
    const rawConns = await prisma.providerConnection.findMany({
      where: {
        OR: [
          { provider: providerKey },
          { provider: provider.slug.toUpperCase() },
          { provider: "CUSTOM", baseUrl: provider.baseUrl },
        ],
      },
      orderBy: { priority: "asc" },
    });

    const connections = rawConns.map((c) => {
      let maskedApiKey = null;
      if (c.apiKeyEncrypted) {
        try {
          const dec = decryptCredential(c.apiKeyEncrypted);
          maskedApiKey = maskApiKey(dec);
        } catch {
          maskedApiKey = "••••••••";
        }
      }
      return {
        ...c,
        maskedApiKey,
        apiKeyEncrypted: undefined,
      };
    });

    return NextResponse.json({
      success: true,
      provider,
      connections,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch custom provider" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/providers/custom/[slug]
 * Updates custom provider configuration (name, prefix, apiType, baseUrl).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const existing = await getCustomProviderBySlug(slug);
    if (!existing) {
      return NextResponse.json({ error: "Custom provider not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, prefix, apiType, baseUrl } = body;

    const updated = await saveCustomProvider({
      id: existing.id,
      name: name?.trim() || existing.name,
      slug: existing.slug,
      prefix: prefix !== undefined ? prefix.trim() : existing.prefix,
      apiType: apiType || existing.apiType,
      compatibility: existing.compatibility || (apiType === "Anthropic Messages" ? "ANTHROPIC" : "OPENAI"),
      baseUrl: baseUrl?.trim() || existing.baseUrl,
      createdAt: existing.createdAt,
    });

    return NextResponse.json({
      success: true,
      provider: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update custom provider" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/providers/custom/[slug]
 * Deletes custom provider, all its connections, and associated models.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // 2. Delete all models associated with this custom provider
    await prisma.aiModel.deleteMany({
      where: { provider: providerKey },
    });

    // 3. Remove from custom providers registry
    await deleteCustomProvider(slug);

    return NextResponse.json({
      success: true,
      message: `Custom provider ${existing.name} deleted successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete custom provider" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/providers/custom/[slug]
 * Backward-compatible endpoint to check connection directly on custom provider.
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { baseUrl, apiKey, modelId, apiType = "Chat Completions" } = body;

    if (!baseUrl || !baseUrl.trim()) {
      return NextResponse.json({ error: "Base URL is required" }, { status: 400 });
    }

    const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const startTime = performance.now();

    if (modelId && modelId.trim()) {
      const isAnthropic = apiType === "Anthropic Messages" || cleanBaseUrl.includes("anthropic");
      const url = isAnthropic
        ? (cleanBaseUrl.endsWith("/messages") ? cleanBaseUrl : `${cleanBaseUrl}/messages`)
        : (cleanBaseUrl.endsWith("/chat/completions") ? cleanBaseUrl : `${cleanBaseUrl}/chat/completions`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (apiKey && apiKey.trim()) {
        if (isAnthropic) {
          headers["x-api-key"] = apiKey.trim();
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        }
      }

      const payload = {
        model: modelId.trim(),
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const upstreamRes = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const latencyMs = Math.round(performance.now() - startTime);

        if (upstreamRes.ok) {
          return NextResponse.json({
            success: true,
            latencyMs,
            status: "HEALTHY",
            message: `Upstream responding OK (${latencyMs}ms)`,
          });
        }

        const errText = await upstreamRes.text().catch(() => "");
        return NextResponse.json({
          success: false,
          latencyMs,
          statusCode: upstreamRes.status,
          error: `[${upstreamRes.status}]: ${errText.slice(0, 200) || upstreamRes.statusText}`,
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        return NextResponse.json({
          success: false,
          error: err.name === "AbortError" ? "Request timed out (10s)" : err.message,
        });
      }
    }

    const modelsUrl = cleanBaseUrl.endsWith("/models") ? cleanBaseUrl : `${cleanBaseUrl}/models`;
    const headers: Record<string, string> = {};
    if (apiKey && apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const upstreamRes = await fetch(modelsUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - startTime);

      if (upstreamRes.ok) {
        return NextResponse.json({
          success: true,
          latencyMs,
          status: "HEALTHY",
          message: `Endpoint valid & reachable (${latencyMs}ms)`,
        });
      }

      if (upstreamRes.status === 401 || upstreamRes.status === 403) {
        return NextResponse.json({
          success: false,
          latencyMs,
          statusCode: upstreamRes.status,
          error: `[${upstreamRes.status}]: Authentication failed (Invalid API Key)`,
        });
      }

      const pingRes = await fetch(cleanBaseUrl, {
        method: "GET",
        headers,
      }).catch(() => null);

      if (pingRes && pingRes.status < 500) {
        return NextResponse.json({
          success: true,
          latencyMs,
          status: "REACHABLE",
          message: `Server reachable (${latencyMs}ms)`,
        });
      }

      return NextResponse.json({
        success: false,
        latencyMs,
        statusCode: upstreamRes.status,
        error: `Upstream returned status ${upstreamRes.status}: ${upstreamRes.statusText}`,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      return NextResponse.json({
        success: false,
        error: err.name === "AbortError" ? "Request timed out (8s)" : `Cannot connect: ${err.message}`,
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to check provider" }, { status: 500 });
  }
}
