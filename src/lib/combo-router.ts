import { prisma } from "@/lib/prisma";

// In-memory cache for combos
export interface CachedCombo {
  id: string;
  comboId: string;
  name: string;
  description: string | null;
  strategy: "FALLBACK" | "ROUND_ROBIN";
  cooldownSeconds: number;
  isActive: boolean;
  isPublic: boolean;
  items: {
    id: string;
    modelId: string;
    priority: number;
    weight: number;
    isActive: boolean;
  }[];
}

let comboCache: CachedCombo[] | null = null;
let comboCacheExpiresAt = 0;
const COMBO_CACHE_TTL_MS = 10000; // 10s TTL

// In-memory cooldown tracking: modelId -> expiresAt timestamp (ms)
const modelCooldownMap = new Map<string, number>();

// In-memory Round-Robin counters: comboId -> current counter
const comboRRCounters = new Map<string, number>();

/**
 * Invalidate combo in-memory cache (call on admin mutations).
 */
export function invalidateComboCache() {
  comboCache = null;
  comboCacheExpiresAt = 0;
}

/**
 * Fetch all active combos (cached in memory for high-throughput).
 */
export async function getActiveCombos(): Promise<CachedCombo[]> {
  const now = Date.now();
  if (comboCache && comboCacheExpiresAt > now) {
    return comboCache;
  }

  try {
    const list = await prisma.comboModel.findMany({
      where: { isActive: true },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { priority: "asc" },
        },
      },
    });

    comboCache = list as any;
    comboCacheExpiresAt = now + COMBO_CACHE_TTL_MS;
    return comboCache || [];
  } catch (err) {
    console.error("Failed to load combos from database:", err);
    return comboCache || [];
  }
}

const CLIENT_NAMESPACES = [
  "aidev/",
  "aidev-cli/",
  "aidev_gateway/",
  "custom_gateway/",
  "custom/",
  "gateway/",
  "my-gateway/",
  "local/",
  "proxy/",
  "opencode/",
  "oc/",
];

function stripClientNamespace(model: string): string {
  let lower = model.trim().toLowerCase();
  for (const ns of CLIENT_NAMESPACES) {
    if (lower.startsWith(ns)) {
      return lower.slice(ns.length);
    }
  }
  return lower;
}

/**
 * Check whether a requested model string refers to a Combo Model.
 */
export async function isComboModel(rawModel?: string | null): Promise<boolean> {
  if (!rawModel) return false;
  const stripped = stripClientNamespace(rawModel);
  const clean = stripped.replace(/^combo[:/]/, "");

  const combos = await getActiveCombos();
  return combos.some(
    (c) =>
      c.comboId.toLowerCase() === stripped ||
      c.comboId.toLowerCase() === clean ||
      stripped === `combo/${c.comboId.toLowerCase()}` ||
      stripped === `combo:${c.comboId.toLowerCase()}`
  );
}

/**
 * Find a combo definition by raw model string.
 */
export async function findCombo(rawModel: string): Promise<CachedCombo | null> {
  const stripped = stripClientNamespace(rawModel);
  const clean = stripped.replace(/^combo[:/]/, "");
  const combos = await getActiveCombos();

  return (
    combos.find(
      (c) =>
        c.comboId.toLowerCase() === stripped ||
        c.comboId.toLowerCase() === clean ||
        stripped === `combo/${c.comboId.toLowerCase()}` ||
        stripped === `combo:${c.comboId.toLowerCase()}`
    ) || null
  );
}

/**
 * Marks a model as temporarily in cooldown (e.g. after receiving HTTP 429 or 5xx).
 */
export function markComboModelCooldown(modelId: string, durationSeconds = 60) {
  const expiresAt = Date.now() + durationSeconds * 1000;
  modelCooldownMap.set(modelId.toLowerCase(), expiresAt);
}

/**
 * Checks if a model is currently in cooldown.
 */
export function isModelInCooldown(modelId: string): boolean {
  const expiresAt = modelCooldownMap.get(modelId.toLowerCase());
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    modelCooldownMap.delete(modelId.toLowerCase());
    return false;
  }
  return true;
}

/**
 * Resolves the ordered candidate models for a given combo.
 * Applies strategy:
 * - FALLBACK: Priority order (Tier 1 -> Tier 2 -> Tier 3), skipping models in cooldown.
 * - ROUND_ROBIN: Rotates sequentially across models, placing the next in line first and others as fallbacks.
 */
export async function resolveComboCandidates(
  rawModel: string
): Promise<{ combo: CachedCombo; candidates: string[] } | null> {
  const combo = await findCombo(rawModel);
  if (!combo || combo.items.length === 0) return null;

  const now = Date.now();

  // 1. Filter models that are not in cooldown
  const healthyItems = combo.items.filter((item) => {
    const expiresAt = modelCooldownMap.get(item.modelId.toLowerCase());
    if (!expiresAt) return true;
    if (now > expiresAt) {
      modelCooldownMap.delete(item.modelId.toLowerCase());
      return true;
    }
    return false;
  });

  // If all models are in cooldown, fall back to all items (prevent total deadlock)
  const pool = healthyItems.length > 0 ? healthyItems : combo.items;

  let candidates: string[] = [];

  if (combo.strategy === "ROUND_ROBIN") {
    // Atomic round-robin index
    const currentIdx = comboRRCounters.get(combo.id) || 0;
    comboRRCounters.set(combo.id, currentIdx + 1);

    const start = currentIdx % pool.length;
    // Circular reordering: [start, start+1, ... pool.length-1, 0, ... start-1]
    const rotated = [
      ...pool.slice(start),
      ...pool.slice(0, start),
    ];
    candidates = rotated.map((i) => i.modelId);
  } else {
    // Default FALLBACK: sorted strictly by priority ASC
    candidates = [...pool].sort((a, b) => a.priority - b.priority).map((i) => i.modelId);
  }

  return {
    combo,
    candidates,
  };
}

/**
 * Get live status of all models in cooldown (for admin inspection).
 */
export function getActiveCooldowns(): Record<string, number> {
  const now = Date.now();
  const active: Record<string, number> = {};
  for (const [modelId, expiresAt] of modelCooldownMap.entries()) {
    if (expiresAt > now) {
      active[modelId] = Math.ceil((expiresAt - now) / 1000);
    } else {
      modelCooldownMap.delete(modelId);
    }
  }
  return active;
}
