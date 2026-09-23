let cachedResponse: any = null;
let responseExpiresAt = 0;

export function getCachedModels() {
  const now = Date.now();
  if (cachedResponse && responseExpiresAt > now) {
    return cachedResponse;
  }
  return null;
}

export function setCachedModels(data: any, ttlMs: number = 30000) {
  cachedResponse = data;
  responseExpiresAt = Date.now() + ttlMs;
}

export function invalidateModelsCache() {
  cachedResponse = null;
  responseExpiresAt = 0;
}
