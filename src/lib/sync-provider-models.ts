import { prisma } from "@/lib/prisma";
import { SHARED_PROVIDER_MODELS } from "@/lib/oauth/config";
import { invalidateModelsCache } from "@/lib/models-cache";
import { decryptCredential } from "@/lib/crypto";

/**
 * Syncs real models ONLY for providers that currently have active connections in the system.
 * Providers that haven't been connected/used yet are completely excluded.
 * Also purges obsolete / non-existent providers (Gemini CLI, OpenCode, IPEENK)
 * and unifies duplicate OPENAI into OPENAI_CODEX.
 */
export async function syncProviderModelsToDatabase(): Promise<{
  synced: number;
  errors: number;
  models: string[];
}> {
  let synced = 0;
  let errors = 0;
  const models: string[] = [];

  // 1. Fetch configured provider connections to know strictly which providers are in the system
  const connections = await prisma.providerConnection.findMany();

  const connectedProviders = new Set<string>();
  for (const conn of connections) {
    const p = conn.provider.toUpperCase().trim();
    if (p === "OPENAI") {
      connectedProviders.add("OPENAI_CODEX");
    } else {
      connectedProviders.add(p);
    }
  }

  // 2. Purge obsolete providers, duplicate OPENAI, and any models for providers that are NOT connected
  try {
    // Delete obsolete providers + any provider not in connectedProviders
    await prisma.aiModel.deleteMany({
      where: {
        OR: [
          { provider: { notIn: Array.from(connectedProviders) } },
          { provider: { in: ["GEMINI_CLI", "OPENCODE_FREE", "OPENCODE", "IPEENK", "OPENAI"] } },
          { modelId: { in: ["default-model", "deepseek/deepseek-v4-pro-max", "deepseek/deepseek-chat", "deepseek/deepseek-reasoner"] } },
        ],
      },
    });

    // Unify any remaining legacy "OPENAI" provider models into "OPENAI_CODEX"
    await prisma.aiModel.updateMany({
      where: { provider: "OPENAI" },
      data: { provider: "OPENAI_CODEX" },
    });
  } catch (err) {
    console.error("Error during obsolete model cleanup:", err);
  }

  // 3. Live sync for connected providers with baseUrl (DeepSeek, Ollama Cloud, OpenRouter, etc.)
  const liveSyncedProviders = new Set<string>();

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

    if (conn.baseUrl && token) {
      const baseUrl = conn.baseUrl.replace(/\/+$/, "");
      const modelsUrl = baseUrl.endsWith("/models") ? baseUrl : `${baseUrl}/models`;

      try {
        const res = await fetch(modelsUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];

          if (list.length > 0) {
            const rawProv = conn.provider.toUpperCase().trim();
            const provUpper = rawProv === "OPENAI" ? "OPENAI_CODEX" : rawProv;
            let prefix = "";
            if (provUpper === "DEEPSEEK") prefix = "deepseek/";
            else if (provUpper === "OLLAMA_CLOUD" || provUpper === "OLLAMA") prefix = "ollama/";
            else if (provUpper === "OPENROUTER") prefix = "or/";
            else if (provUpper === "OPENAI_CODEX") prefix = "cx/";
            else if (provUpper === "GEMINI" || provUpper === "GOOGLE") prefix = "gem/";

            // For OpenRouter: filter free models only
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

            liveSyncedProviders.add(provUpper);
          }
        }
      } catch (err) {
        console.error(`Live models sync failed for ${conn.provider}:`, err);
      }
    }
  }

  // 4. Upsert predefined models from SHARED_PROVIDER_MODELS ONLY for connected providers
  for (const [providerKey, modelList] of Object.entries(SHARED_PROVIDER_MODELS)) {
    // STRICT FILTER: If this provider is NOT currently connected, DO NOT import it!
    if (!connectedProviders.has(providerKey)) {
      continue;
    }

    // If already synced live, skip static fallback unless it's Antigravity or Codex
    if (liveSyncedProviders.has(providerKey) && providerKey !== "ANTIGRAVITY" && providerKey !== "OPENAI_CODEX") {
      continue;
    }

    for (const item of modelList) {
      try {
        await prisma.aiModel.upsert({
          where: { modelId: item.id },
          update: {
            name: item.name,
            provider: providerKey,
          },
          create: {
            modelId: item.id,
            name: item.name,
            provider: providerKey,
            contextWindow: item.id.includes("flash") || item.id.includes("gemini") ? "1M" : "128k",
            promptCost: 0,
            completionCost: 0,
            isActive: true,
            isPublic: true,
          },
        });
        synced++;
        models.push(item.id);
      } catch (err) {
        errors++;
        console.error(`Failed to sync model ${item.id}:`, err);
      }
    }
  }

  // 5. Fix Combo Model Items to point to real existing models
  await prisma.comboModelItem.updateMany({
    where: { modelId: "deepseek/deepseek-v4-pro-max" },
    data: { modelId: "deepseek/deepseek-flash" },
  });

  invalidateModelsCache();
  return { synced, errors, models };
}
