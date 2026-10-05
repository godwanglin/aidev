/**
 * In-memory telemetry cache for capturing full raw request headers, body,
 * response chunks, and reasoning effort with instant retrieval for the Admin UI.
 * Optimized with bounded item count and string truncation to prevent high RAM usage.
 */

export interface TelemetryPayload {
  id: string;
  timestamp: string;
  clientAccount?: {
    userId?: string | null;
    email?: string | null;
    name?: string | null;
    role?: string | null;
    tier?: string | null;
    apiKeyPrefix?: string | null;
    apiKeyName?: string | null;
  };
  reasoningEffort?: string | null;
  rawHeaders?: Record<string, string> | string | null;
  rawBody?: any;
  rawResponse?: string | null;
}

const MAX_STRING_LENGTH = 20000; // Limit in-memory raw body/response to ~20KB to keep RAM minimal (~5-10MB total)

function truncateField(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    if (val.length > MAX_STRING_LENGTH) {
      return val.slice(0, MAX_STRING_LENGTH) + "\n... [TRUNCATED_IN_MEMORY_CACHE]";
    }
    return val;
  }
  if (typeof val === "object") {
    try {
      const str = JSON.stringify(val);
      if (str.length > MAX_STRING_LENGTH) {
        return str.slice(0, MAX_STRING_LENGTH) + "\n... [TRUNCATED_IN_MEMORY_CACHE]";
      }
      return val;
    } catch {
      return val;
    }
  }
  return val;
}

class TelemetryStore {
  private cache = new Map<string, TelemetryPayload>();
  private readonly maxItems = 25; // Keep only latest 25 items in RAM

  public set(id: string, payload: TelemetryPayload) {
    if (!id) return;
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    // Sanitize payload to prevent massive memory consumption from huge token bodies
    const sanitized: TelemetryPayload = {
      ...payload,
      rawBody: truncateField(payload.rawBody),
      rawResponse: truncateField(payload.rawResponse),
      rawHeaders:
        typeof payload.rawHeaders === "string"
          ? truncateField(payload.rawHeaders)
          : payload.rawHeaders,
    };

    this.cache.set(id, sanitized);
  }

  public get(id: string): TelemetryPayload | undefined {
    return this.cache.get(id);
  }

  public has(id: string): boolean {
    return this.cache.has(id);
  }

  public clear() {
    this.cache.clear();
  }
}

export const telemetryStore = new TelemetryStore();
