import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { decryptCredential } from "@/lib/crypto";
import { refreshOAuthToken } from "@/lib/oauth/service";
import { SHARED_PROVIDER_MODELS, findProviderBySlugOrId } from "@/lib/oauth/config";

import { getCustomProviderBySlug } from "@/lib/custom-providers";
import { validateModelForProvider } from "@/lib/model-normalizer";
import { fetchAntigravityAvailableModels } from "@/lib/adapters/antigravity";

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
  const persistImport = searchParams.get("persist") === "true";

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
            const isAnthropic =
              conn?.compatibility === "ANTHROPIC" ||
              customProvider?.compatibility === "ANTHROPIC" ||
              customProvider?.apiType === "Anthropic Messages";

            const headers: Record<string, string> = {};
            if (token) {
              if (isAnthropic) {
                headers["x-api-key"] = token;
                headers["anthropic-version"] = "2023-06-01";
              } else {
                headers["Authorization"] = `Bearer ${token}`;
              }
            }
            if (providerKey === "XAI") {
              headers["User-Agent"] = "grok-cli/9router";
              headers["Accept"] = "application/json";
            } else if (providerKey === "GROK_CLI" || providerKey === "GROK") {
              headers["User-Agent"] = "grok-shell/1.0.44 (linux; x86_64)";
              headers["Accept"] = "application/json";
              headers["x-xai-token-auth"] = "xai-grok-cli";
              headers["x-grok-client-identifier"] = "grok-shell";
              headers["x-grok-client-version"] = "1.0.44";
              headers["x-grok-client-mode"] = "headless";
              if (conn?.accountEmail) headers["x-email"] = conn.accountEmail;
            }

            const res = await fetch(modelsUrl, { headers });
            if (res.ok) {
              const data = await res.json();
              const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : [];
              if (list.length > 0) {
                const prefix = providerMeta?.defaultPrefix || (customProvider?.prefix ? `${customProvider.prefix.replace(/\/+$/, "")}/` : "");
                const liveModels = list.map((m: any) => {
                  const rawId = typeof m === "string" ? m : m.id || m.name;
                  const rawName = typeof m === "string" ? m : m.displayName || m.name || m.id;
                  const finalId = prefix && !rawId.includes("/") ? `${prefix}${rawId}` : rawId;
                  return {
                    id: finalId,
                    name: rawName,
                  };
                });

                // Hanya simpan ke database jika persist diminta
                if (persistImport) {
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
        if (providerKey === "CHATGPT_WEB" || providerKey === "CHATGPT") {
          let accessToken = token;
          let cookieString = "";
          if (conn?.apiKeyEncrypted) {
            try {
              cookieString = decryptCredential(conn.apiKeyEncrypted);
            } catch {}
          }
          if (conn?.accessTokenEnc) {
            try {
              accessToken = decryptCredential(conn.accessTokenEnc);
            } catch {}
          }

          if (accessToken) {
            const res = await fetch("https://chatgpt.com/backend-api/models", {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                Accept: "application/json",
                Referer: "https://chatgpt.com/",
                ...(cookieString ? { Cookie: cookieString } : {}),
              },
            });

            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.models)) {
                const prefix = "gptweb/";
                const liveModels = data.models
                  .map((m: any) => ({
                    id: !m.slug.includes("/") ? `${prefix}${m.slug}` : m.slug,
                    name: m.title || m.slug,
                  }))
                  .sort((a: any, b: any) => a.id.localeCompare(b.id));

                if (persistImport) {
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

                if (persistImport) {
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
        } else if (providerKey === "CLAUDE_CODE" || providerKey === "ANTHROPIC" || providerKey === "CLAUDE") {
          if (token) {
            const anthropicHeaders: Record<string, string> = {
              "anthropic-version": "2023-06-01",
            };
            if (token.startsWith("sk-ant-oat") || conn?.authType === "OAUTH") {
              anthropicHeaders["Authorization"] = `Bearer ${token}`;
              anthropicHeaders["anthropic-beta"] = "oauth-2025-04-20,claude-code-20250219";
              anthropicHeaders["User-Agent"] = "claude-cli/2.1.280 (external, cli)";
            } else {
              anthropicHeaders["x-api-key"] = token;
            }

            const res = await fetch("https://api.anthropic.com/v1/models", {
              headers: anthropicHeaders,
            });

            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.data)) {
                const prefix = "cc/";
                const liveModels = data.data
                  .map((m: any) => ({
                    id: !m.id.includes("/") ? `${prefix}${m.id}` : m.id,
                    name: m.display_name || m.id,
                  }))
                  .sort((a: any, b: any) => a.id.localeCompare(b.id));

                if (persistImport) {
                  for (const m of liveModels) {
                    await prisma.aiModel.upsert({
                      where: { modelId: m.id },
                      create: {
                        modelId: m.id,
                        name: m.name,
                        provider: providerKey,
                        promptCost: 0,
                        completionCost: 0,
                        contextWindow: "200k",
                        isActive: true,
                      },
                      update: {
                        name: m.name,
                        provider: providerKey,
                        isActive: true,
                      },
                    }).catch(() => null);
                  }
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

              if (persistImport) {
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
        } else if (providerKey === "XAI") {
          if (token) {
            const res = await fetch("https://api.x.ai/v1/models", {
              headers: {
                Authorization: `Bearer ${token}`,
                "User-Agent": "grok-cli/9router",
                Accept: "application/json",
              },
            });
            if (res.ok) {
              const data = await res.json();
              const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
              if (list.length > 0) {
                const prefix = "xai/";
                const liveModels = list
                  .map((m: any) => {
                    const rawId = typeof m === "string" ? m : m.id || m.name;
                    return {
                      id: !rawId.includes("/") ? `${prefix}${rawId}` : rawId,
                      name: m.display_name || m.name || rawId,
                    };
                  })
                  .sort((a: any, b: any) => a.id.localeCompare(b.id));

                if (persistImport) {
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
        } else if (providerKey === "GROK_CLI" || providerKey === "GROK") {
          if (token) {
            const grokHeaders: Record<string, string> = {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              "User-Agent": "grok-shell/1.0.44 (linux; x86_64)",
              "x-xai-token-auth": "xai-grok-cli",
              "x-grok-client-identifier": "grok-shell",
              "x-grok-client-version": "1.0.44",
              "x-grok-client-mode": "headless",
            };
            if (conn?.accountEmail) grokHeaders["x-email"] = conn.accountEmail;

            const res = await fetch("https://cli-chat-proxy.grok.com/v1/models", {
              headers: grokHeaders,
            });
            if (res.ok) {
              const data = await res.json();
              const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
              if (list.length > 0) {
                const prefix = "grok-cli/";
                const liveModels = list
                  .map((m: any) => {
                    const rawId = typeof m === "string" ? m : m.id || m.name;
                    return {
                      id: !rawId.includes("/") ? `${prefix}${rawId}` : rawId,
                      name: m.display_name || m.name || rawId,
                    };
                  })
                  .sort((a: any, b: any) => a.id.localeCompare(b.id));

                if (persistImport) {
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
        } else if (providerKey === "ANTIGRAVITY") {
          const mergedModels = new Map<string, { id: string; name: string }>();
          for (const agConn of connections) {
            let agToken = agConn.accessTokenEnc ? decryptCredential(agConn.accessTokenEnc) : "";
            if (!agToken && agConn.refreshTokenEnc) {
              try {
                agToken = await refreshOAuthToken(agConn.id);
              } catch {}
            }
            if (!agToken && !agConn.refreshTokenEnc) continue;
            const list = await fetchAntigravityAvailableModels(agToken, agConn.id).catch(() => []);
            for (const m of list) {
              if (!mergedModels.has(m.id)) {
                mergedModels.set(m.id, m);
              }
            }
          }

          const liveModels = Array.from(mergedModels.values()).sort((a, b) => a.id.localeCompare(b.id));
          if (liveModels.length > 0) {
            if (persistImport) {
              for (const m of liveModels) {
                await prisma.aiModel
                  .upsert({
                    where: { modelId: m.id },
                    create: {
                      modelId: m.id,
                      name: m.name,
                      provider: providerKey,
                      promptCost: 0,
                      completionCost: 0,
                      contextWindow: "1M",
                      isActive: true,
                    },
                    update: {
                      name: m.name,
                      provider: providerKey,
                      isActive: true,
                    },
                  })
                  .catch(() => null);
              }
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
    } catch {}
  }

  // 2. Load models from database for this provider
  let customDbModels: { id: string; name: string }[] = [];

  try {
    const dbList = await prisma.aiModel.findMany({
      where: {
        isActive: true,
        OR: [
          { provider: providerKey },
          { provider: providerParam.toUpperCase() },
          { provider: providerParam },
        ],
      },
    });

    for (const m of dbList) {
      customDbModels.push({ id: m.modelId, name: m.name });
    }
  } catch {}

  return NextResponse.json({
    success: true,
    provider: providerKey,
    models: customDbModels,
    source: "DATABASE",
    count: customDbModels.length,
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

    // Delete from AiModel
    await prisma.aiModel.deleteMany({
      where: { modelId: cleanModelId },
    });

    const { invalidateModelsCache } = await import("@/lib/models-cache");
    invalidateModelsCache();

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
