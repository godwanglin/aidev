import { prisma } from "@/lib/prisma";
import { invalidateModelsCache } from "@/lib/models-cache";
import { decryptCredential } from "@/lib/crypto";
import { getCustomProviders } from "@/lib/custom-providers";
import { findProviderBySlugOrId } from "@/lib/oauth/config";

/**
 * Syncs real models ONLY from active upstream provider endpoints currently connected in the system.
 * Zero hardcoded models, zero artificial virtualization. Transparent upstream sync.
 */
export async function syncProviderModelsToDatabase(): Promise<{
  synced: number;
  errors: number;
  models: string[];
}> {
  let synced = 0;
  let errors = 0;
  const models: string[] = [];

  // 1. Bersihkan seluruh AiModel di database sebelum sync ulang
  try {
    await prisma.aiModel.deleteMany({});
  } catch (err) {
    console.error("Error during aiModel cleanup:", err);
  }

  // 2. Ambil seluruh koneksi provider yang aktif
  const connections = await prisma.providerConnection.findMany({
    where: { isActive: true },
    orderBy: { priority: "asc" },
  });

  const customProviders = await getCustomProviders(true);
  const customProviderMap = new Map(
    customProviders.map((cp) => [
      `CUSTOM_${cp.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`,
      cp,
    ])
  );
  for (const cp of customProviders) {
    customProviderMap.set(cp.slug.toUpperCase(), cp);
    customProviderMap.set(cp.name.toUpperCase(), cp);
  }

  // 3. Live sync langsung dari endpoint upstream
  const processedEndpoints = new Set<string>();

  for (const conn of connections) {
    let token = "";
    if (conn.apiKeyEncrypted) {
      try {
        token = decryptCredential(conn.apiKeyEncrypted);
      } catch {}
    } else if (conn.accessTokenEnc) {
      try {
        token = decryptCredential(conn.accessTokenEnc);
      } catch {}
    }

    const rawProv = conn.provider.toUpperCase().trim();
    const provUpper = rawProv === "OPENAI" ? "OPENAI_CODEX" : rawProv;
    const customProv = customProviderMap.get(provUpper) || customProviderMap.get(rawProv);
    const catalogItem = findProviderBySlugOrId(rawProv);

    // Skip student-premium and gemini-cli from entering AiModel
    if (
      provUpper === "CUSTOM_STUDENT_PREMIUM" ||
      provUpper === "STUDENT_PREMIUM" ||
      provUpper === "GEMINI_CLI" ||
      customProv?.slug === "student-premium"
    ) {
      continue;
    }

    const baseUrlRaw = conn.baseUrl || customProv?.baseUrl || "";
    if (baseUrlRaw && token) {
      let baseUrl = baseUrlRaw.replace(/\/+$/, "");
      if (baseUrl.endsWith("/chat/completions")) {
        baseUrl = baseUrl.replace(/\/chat\/completions$/, "");
      } else if (baseUrl.endsWith("/messages")) {
        baseUrl = baseUrl.replace(/\/messages$/, "");
      }
      const modelsUrl = baseUrl.endsWith("/models") ? baseUrl : `${baseUrl}/models`;
      const endpointKey = `${modelsUrl}::${token.slice(0, 15)}`;

      if (processedEndpoints.has(endpointKey)) {
        continue;
      }
      processedEndpoints.add(endpointKey);

      try {
        const isAnthropic =
          conn.compatibility === "ANTHROPIC" ||
          customProv?.compatibility === "ANTHROPIC" ||
          customProv?.apiType === "Anthropic Messages";

        const headers: Record<string, string> = {};
        if (isAnthropic) {
          headers["x-api-key"] = token;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(modelsUrl, { headers });

        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : Array.isArray(data) ? data : [];

          if (list.length > 0) {
            let prefix = "";
            if (customProv?.prefix) {
              prefix = `${customProv.prefix.replace(/\/+$/, "")}/`;
            } else if (provUpper === "DEEPSEEK") {
              prefix = "deepseek/";
            } else if (provUpper === "OLLAMA_CLOUD" || provUpper === "OLLAMA") {
              prefix = "ollama/";
            } else if (provUpper === "OPENROUTER") {
              prefix = "or/";
            } else if (provUpper === "OPENAI_CODEX") {
              prefix = "cx/";
            } else if (provUpper === "GEMINI" || provUpper === "GOOGLE") {
              prefix = "gem/";
            } else if (catalogItem?.defaultPrefix) {
              prefix = catalogItem.defaultPrefix;
            }

            // Untuk OpenRouter: ambil model free jika ada filter atau seluruh list
            let itemsToSync = list;
            if (provUpper === "OPENROUTER") {
              const freeList = list.filter(
                (m: any) =>
                  m.id?.endsWith(":free") ||
                  m.id === "openrouter/free" ||
                  (m.pricing && parseFloat(m.pricing.prompt || "1") === 0 && parseFloat(m.pricing.completion || "1") === 0)
              );
              if (freeList.length > 0) itemsToSync = freeList;
            }

            for (const item of itemsToSync) {
              let rawId = typeof item === "string" ? item : item.id || item.name;
              const rawName = typeof item === "string" ? item : item.displayName || item.name || item.id;
              if (provUpper === "GEMINI" || provUpper === "GOOGLE") {
                rawId = rawId.replace(/^models\//, "");
              }
              const modelId = prefix && !rawId.includes("/") ? `${prefix}${rawId}` : rawId;

              try {
                await prisma.aiModel.upsert({
                  where: { modelId },
                  update: {
                    name: rawName,
                    provider: provUpper,
                    isActive: true,
                  },
                  create: {
                    modelId,
                    name: rawName,
                    provider: provUpper,
                    contextWindow: "128k",
                    promptCost: 0,
                    completionCost: 0,
                    isActive: true,
                    isPublic: true,
                  },
                });
                synced++;
                models.push(modelId);
              } catch (err) {
                errors++;
              }
            }
          }
        }
      } catch (err) {
        console.error(`Live models sync failed for ${conn.provider}:`, err);
      }
    }

    // ChatGPT Web session models pull jika ada cookie
    if (provUpper === "CHATGPT_WEB" && token) {
      try {
        const res = await fetch("https://chatgpt.com/backend-api/models", {
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            Accept: "application/json",
            Referer: "https://chatgpt.com/",
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.models)) {
            const prefix = "gptweb/";
            for (const m of data.models) {
              const modelId = !m.slug.includes("/") ? `${prefix}${m.slug}` : m.slug;
              const rawName = m.title || m.slug;
              try {
                await prisma.aiModel.upsert({
                  where: { modelId },
                  update: { name: rawName, provider: provUpper, isActive: true },
                  create: {
                    modelId,
                    name: rawName,
                    provider: provUpper,
                    contextWindow: "128k",
                    promptCost: 0,
                    completionCost: 0,
                    isActive: true,
                    isPublic: true,
                  },
                });
                synced++;
                models.push(modelId);
              } catch {
                errors++;
              }
            }
          }
        }
      } catch {}
    }
  }

  invalidateModelsCache();
  return { synced, errors, models };
}
