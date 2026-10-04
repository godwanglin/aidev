/**
 * In-memory telemetry cache for capturing full raw request headers, body,
 * response chunks, and reasoning effort with instant retrieval for the Admin UI.
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

class TelemetryStore {
  private cache = new Map<string, TelemetryPayload>();
  private readonly maxItems = 500;

  public set(id: string, payload: TelemetryPayload) {
    if (!id) return;
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(id, payload);
  }

  public get(id: string): TelemetryPayload | undefined {
    return this.cache.get(id);
  }

  public has(id: string): boolean {
    return this.cache.has(id);
  }
}

export const telemetryStore = new TelemetryStore();
