import { prisma } from "@/lib/prisma";

export interface CustomProvider {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  apiType: "Chat Completions" | "Anthropic Messages";
  compatibility: "OPENAI" | "ANTHROPIC";
  baseUrl: string;
  createdAt: string;
  updatedAt?: string;
}

const REGISTRY_ID = "custom_providers_registry";

let customProvidersCache: CustomProvider[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15000; // 15 seconds TTL

export function invalidateCustomProvidersCache() {
  customProvidersCache = null;
  cacheExpiresAt = 0;
}

/**
 * Get all custom providers registered in the system (with memory caching)
 */
export async function getCustomProviders(): Promise<CustomProvider[]> {
  const now = Date.now();
  if (customProvidersCache && cacheExpiresAt > now) {
    return customProvidersCache;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { id: REGISTRY_ID },
    });

    if (!setting || !setting.discordWebhookUrl) {
      customProvidersCache = [];
      cacheExpiresAt = now + CACHE_TTL_MS;
      return [];
    }

    const parsed = JSON.parse(setting.discordWebhookUrl);
    const result = Array.isArray(parsed) ? parsed : [];
    customProvidersCache = result;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return result;
  } catch (err) {
    console.error("Error reading custom providers registry:", err);
    return customProvidersCache || [];
  }
}

/**
 * Dynamically matches a model string (e.g. 'jrt/gpt-5.6-luna') against any registered custom provider
 */
export async function matchCustomProviderForModel(modelName?: string | null): Promise<{
  providerKey: string;
  cleanModel: string;
  providerName: string;
  baseUrl: string;
} | null> {
  if (!modelName || !modelName.includes("/")) return null;

  const slashIdx = modelName.indexOf("/");
  const rawPrefix = modelName.slice(0, slashIdx).toLowerCase().trim();
  const cleanModel = modelName.slice(slashIdx + 1).trim();

  const providers = await getCustomProviders();
  const matched = providers.find(
    (p) =>
      p.prefix.toLowerCase().replace(/\/+$/, "") === rawPrefix ||
      p.slug.toLowerCase() === rawPrefix ||
      p.id.toLowerCase() === rawPrefix
  );

  if (matched) {
    const providerKey = `CUSTOM_${matched.slug.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
    return {
      providerKey,
      cleanModel,
      providerName: matched.name,
      baseUrl: matched.baseUrl,
    };
  }

  return null;
}

/**
 * Find a custom provider by slug or ID
 */
export async function getCustomProviderBySlug(slugOrId: string): Promise<CustomProvider | null> {
  const providers = await getCustomProviders();
  const search = slugOrId.toLowerCase().trim();
  return (
    providers.find(
      (p) =>
        p.slug.toLowerCase() === search ||
        p.id.toLowerCase() === search ||
        p.name.toLowerCase() === search ||
        p.prefix.toLowerCase().replace(/\/+$/, "") === search.replace(/\/+$/, "")
    ) || null
  );
}

/**
 * Save (create or update) a custom provider definition
 */
export async function saveCustomProvider(
  provider: Omit<CustomProvider, "createdAt" | "id"> & { id?: string; createdAt?: string }
): Promise<CustomProvider> {
  const providers = await getCustomProviders();
  const cleanSlug = provider.slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");

  const cleanPrefix = provider.prefix.trim().toLowerCase().replace(/\/+$/, "");

  const fullProvider: CustomProvider = {
    id: provider.id || `cp_${cleanSlug}`,
    name: provider.name.trim(),
    slug: cleanSlug,
    prefix: cleanPrefix,
    apiType: provider.apiType || "Chat Completions",
    compatibility:
      provider.compatibility ||
      (provider.apiType === "Anthropic Messages" ? "ANTHROPIC" : "OPENAI"),
    baseUrl: provider.baseUrl.trim(),
    createdAt: provider.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const existingIndex = providers.findIndex(
    (p) => p.slug === cleanSlug || p.id === fullProvider.id
  );

  let updatedList: CustomProvider[];
  if (existingIndex >= 0) {
    updatedList = [...providers];
    updatedList[existingIndex] = {
      ...providers[existingIndex],
      ...fullProvider,
      createdAt: providers[existingIndex].createdAt,
    };
  } else {
    updatedList = [...providers, fullProvider];
  }

  await prisma.systemSetting.upsert({
    where: { id: REGISTRY_ID },
    create: {
      id: REGISTRY_ID,
      discordWebhookUrl: JSON.stringify(updatedList),
    },
    update: {
      discordWebhookUrl: JSON.stringify(updatedList),
    },
  });

  return fullProvider;
}

/**
 * Delete a custom provider from the registry
 */
export async function deleteCustomProvider(slugOrId: string): Promise<boolean> {
  const providers = await getCustomProviders();
  const search = slugOrId.toLowerCase().trim();

  const filtered = providers.filter(
    (p) =>
      p.slug.toLowerCase() !== search &&
      p.id.toLowerCase() !== search &&
      p.name.toLowerCase() !== search
  );

  if (filtered.length === providers.length) {
    return false;
  }

  await prisma.systemSetting.upsert({
    where: { id: REGISTRY_ID },
    create: {
      id: REGISTRY_ID,
      discordWebhookUrl: JSON.stringify(filtered),
    },
    update: {
      discordWebhookUrl: JSON.stringify(filtered),
    },
  });

  return true;
}
