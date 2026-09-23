import { EventEmitter } from "events";

export type LogScope =
  | "CLIENT_REQUEST"
  | "POST"
  | "GET"
  | "FALLBACK"
  | "AUTH_REFRESH"
  | "TOKEN_REFRESH"
  | "BG_TOKEN_REFRESH"
  | "COOLDOWN"
  | "DONE"
  | "ERROR"
  | "SYSTEM";

export type LogLevel = "info" | "success" | "warn" | "error";

export interface AdminLogItem {
  id: string;
  timestamp: string; // "HH:mm:ss"
  fullTime: string;  // ISO string
  scope: LogScope;
  level: LogLevel;
  message: string;
  details?: Record<string, any>;
}

class AdminLogger {
  private buffer: AdminLogItem[] = [];
  private maxBuffer = 1000;
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  public log(params: {
    scope: LogScope;
    message: string;
    level?: LogLevel;
    details?: Record<string, any>;
    customTimestamp?: string;
  }): AdminLogItem {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timeStr = params.customTimestamp || `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    // Determine level if not explicitly provided
    let level: LogLevel = params.level || "info";
    if (!params.level) {
      if (params.scope === "DONE") level = "success";
      else if (params.scope === "FALLBACK" || params.scope === "COOLDOWN") level = "warn";
      else if (params.scope === "ERROR") level = "error";
    }

    const item: AdminLogItem = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: timeStr,
      fullTime: now.toISOString(),
      scope: params.scope,
      level,
      message: params.message,
      details: params.details,
    };

    // Keep ring buffer bounded
    this.buffer.push(item);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift();
    }

    // Terminal console mirroring
    const colorCode =
      level === "error" ? "\x1b[31m" :
      level === "warn" ? "\x1b[33m" :
      level === "success" ? "\x1b[32m" :
      params.scope === "CLIENT_REQUEST" ? "\x1b[36m" :
      params.scope === "POST" ? "\x1b[34m" :
      params.scope === "AUTH_REFRESH" ? "\x1b[35m" : "\x1b[0m";

    console.log(`[${item.timestamp}] ${colorCode}[${item.scope}]\x1b[0m ${item.message}`);

    // Broadcast to live SSE subscribers
    this.emitter.emit("log", item);

    return item;
  }

  public getRecentLogs(limit = 200, scopeFilter?: string, search?: string): AdminLogItem[] {
    let result = [...this.buffer];

    if (scopeFilter && scopeFilter !== "ALL") {
      result = result.filter((l) => l.scope === scopeFilter);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          l.scope.toLowerCase().includes(q) ||
          (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
      );
    }

    if (limit > 0) {
      result = result.slice(-limit);
    }

    return result;
  }

  public subscribe(callback: (item: AdminLogItem) => void): () => void {
    this.emitter.on("log", callback);
    return () => {
      this.emitter.off("log", callback);
    };
  }

  public clientRequest(params: {
    account: string;
    role: string;
    balance: string;
    tier: string;
    subPath?: string;
    model?: string;
    stream?: boolean;
  }): AdminLogItem {
    let msg = `ACCOUNT: ${params.account} (${params.role}) · BALANCE: ${params.balance} (${params.tier})`;
    if (params.model || params.subPath) {
      msg += ` · REQ: ${params.subPath || ""} (${params.model || "unknown"})`;
    }
    return this.log({
      scope: "CLIENT_REQUEST",
      level: "info",
      message: msg,
      details: params,
    });
  }

  public post(params: {
    model: string;
    upstreamModel: string;
    fromFormat: string;
    toFormat: string;
    stream: boolean;
    msgCount: number;
    toolCount: number;
    account: string;
  }): AdminLogItem {
    const typeStr = params.stream ? "STREAM" : "SYNC";
    const msg = `${params.model} → ${params.upstreamModel} · FMT: ${params.fromFormat}→${params.toFormat} · ${typeStr} · ${params.msgCount} MSG · ${params.toolCount} TOOL · ACCOUNT:${params.account}`;
    return this.log({
      scope: "POST",
      level: "info",
      message: msg,
      details: params,
    });
  }

  public done(params: {
    durationMs: number;
    ttftMs?: number;
    promptTokens: number;
    completionTokens: number;
    rtkSavings?: number;
    model?: string;
    upstreamModel?: string;
    account?: string;
  }): AdminLogItem {
    let msg = `🟢 DONE ${params.durationMs}ms`;
    if (params.ttftMs !== undefined) {
      msg += ` · TTFT ${params.ttftMs}ms`;
    }
    msg += ` · IN ${params.promptTokens} · OUT ${params.completionTokens}`;
    if (params.rtkSavings && params.rtkSavings > 0) {
      msg += ` · RTK SAVED ${params.rtkSavings}`;
    }
    return this.log({
      scope: "DONE",
      level: "success",
      message: msg,
      details: params,
    });
  }

  public fallback(params: {
    fromModel: string;
    toModel?: string;
    reason: string;
    account?: string;
    rawError?: any;
  }): AdminLogItem {
    let msg = `Model ${params.fromModel}`;
    if (params.toModel) {
      msg += ` → ${params.toModel}`;
    }
    let reason = params.reason;
    if (params.rawError) {
      const extracted = extractProviderErrorMessage(params.rawError);
      if (extracted && !reason.includes(extracted)) {
        reason += `: ${extracted}`;
      }
    }
    msg += ` · Reason: ${reason}`;
    if (params.account) {
      msg += ` · ACCOUNT:${params.account}`;
    }
    return this.log({
      scope: "FALLBACK",
      level: "warn",
      message: msg,
      details: params,
    });
  }

  public error(params: {
    message: string;
    durationMs?: number;
    model?: string;
    upstreamModel?: string;
    status?: number;
    account?: string;
    rawError?: any;
  }): AdminLogItem {
    let msg = `🔴 ERROR`;
    if (params.durationMs !== undefined) {
      msg += ` ${params.durationMs}ms`;
    }
    if (params.model) {
      msg += ` · Model: ${params.model}`;
    }
    let body = params.message;
    if (params.rawError) {
      const extracted = extractProviderErrorMessage(params.rawError);
      if (extracted && !body.includes(extracted)) {
        body += `: ${extracted}`;
      }
    }
    msg += ` · ${body}`;
    return this.log({
      scope: "ERROR",
      level: "error",
      message: msg,
      details: params,
    });
  }

  public clear(): void {
    this.buffer = [];
    this.emitter.emit("clear");
  }
}

/**
 * Extracts a human-readable error message from raw provider response body or error object.
 * Handles OpenAI, DeepSeek, Anthropic, Gemini, Ollama, FastAPI, and HTML error pages.
 */
export function extractProviderErrorMessage(raw: string | any, maxLength = 250): string {
  if (!raw) return "";
  if (typeof raw === "object") {
    return parseErrorObj(raw, maxLength);
  }
  const text = String(raw).trim();
  if (!text) return "";

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      const res = parseErrorObj(parsed, maxLength);
      if (res) return res;
    } catch {}
  }

  if (text.startsWith("<") || text.includes("<html") || text.includes("<!DOCTYPE")) {
    const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    const h1Match = text.match(/<h1>([^<]+)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }
    return "Upstream returned HTML error page";
  }

  return text.slice(0, maxLength);
}

function parseErrorObj(obj: any, maxLength = 250): string {
  if (!obj) return "";
  if (Array.isArray(obj)) {
    return parseErrorObj(obj[0], maxLength);
  }
  if (typeof obj === "string") return obj.slice(0, maxLength);

  // OpenAI / DeepSeek / OpenRouter: { error: { message: "..." } }
  // Anthropic: { type: "error", error: { message: "..." } }
  if (obj.error) {
    if (typeof obj.error === "string") return obj.error.slice(0, maxLength);
    if (obj.error.message) return String(obj.error.message).slice(0, maxLength);
    if (obj.error.detail) return String(obj.error.detail).slice(0, maxLength);
    if (typeof obj.error === "object") {
      return parseErrorObj(obj.error, maxLength);
    }
  }

  // FastAPI / Ollama / Python servers: { detail: "..." } or { detail: [{ msg: "..." }] }
  if (obj.detail) {
    if (typeof obj.detail === "string") return obj.detail.slice(0, maxLength);
    if (Array.isArray(obj.detail) && obj.detail[0]?.msg) {
      return String(obj.detail[0].msg).slice(0, maxLength);
    }
    if (typeof obj.detail === "object") {
      return JSON.stringify(obj.detail).slice(0, maxLength);
    }
  }

  // Generic { message: "..." }
  if (obj.message && typeof obj.message === "string") {
    return obj.message.slice(0, maxLength);
  }

  // Google Gemini REST: { error: { code: 400, message: "...", status: "INVALID_ARGUMENT" } }
  if (obj.status && typeof obj.status === "string" && obj.message) {
    return `${obj.status}: ${obj.message}`.slice(0, maxLength);
  }

  try {
    return JSON.stringify(obj).slice(0, maxLength);
  } catch {
    return "";
  }
}

// Global singleton pattern to survive Next.js HMR reloads and multi-chunk isolation
const globalForAdminLogger = globalThis as unknown as {
  adminLoggerInstance?: AdminLogger;
};

export const adminLogger =
  globalForAdminLogger.adminLoggerInstance ||
  (globalForAdminLogger.adminLoggerInstance = new AdminLogger());

