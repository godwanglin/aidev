import { prisma } from "./prisma";

export interface RequestLogData {
  apiKeyId: string;
  path: string;
  method: string;
  statusCode: number;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  creditsCost?: number | null;
  durationMs?: number | null;
}

export async function logRequest(data: RequestLogData) {
  let cost = data.creditsCost ?? 0;
  const isEmbedding = Boolean(data.path?.includes("embeddings"));
  const hasNoCompletion = !data.completionTokens || data.completionTokens <= 0;

  // Strict Rule 1: Error status (HTTP >= 400) NEVER incurs credits cost
  if (data.statusCode >= 400) {
    cost = 0;
  }

  // Strict Rule 2: Non-embedding requests without generated completion tokens NEVER incur credits cost
  if (!isEmbedding && hasNoCompletion) {
    cost = 0;
  }

  // Only calculate cost if response was successful (2xx/3xx) and generated real output (or is embedding)
  if (cost === 0 && data.statusCode >= 200 && data.statusCode < 400 && (isEmbedding || !hasNoCompletion)) {
    if (data.totalTokens && data.totalTokens > 0) {
      try {
        const { calculateCreditsCost } = await import("./credits");
        const promptTok = data.promptTokens || Math.round(data.totalTokens * 0.8);
        const compTok = data.completionTokens || Math.max(1, data.totalTokens - promptTok);
        cost = await calculateCreditsCost(data.model || "default", promptTok, compTok);
      } catch {}
    }
  }

  // Direct insert to ensure 100% token usage visibility in logs & auto-deduct user balance
  prisma.requestLog
    .create({
      data: {
        apiKeyId: data.apiKeyId,
        path: data.path,
        method: data.method,
        statusCode: data.statusCode,
        model: data.model || null,
        promptTokens: data.promptTokens ?? null,
        completionTokens: data.completionTokens ?? null,
        totalTokens: data.totalTokens ?? null,
        creditsCost: cost,
        durationMs: data.durationMs ?? null,
      },
      include: {
        apiKey: {
          select: { userId: true },
        },
      },
    })
    .then(async (createdLog) => {
      // Deduct credits from user balance in real-time only on successful responses (2xx/3xx)
      // with real generated content (completion tokens > 0, or embedding)
      if (
        createdLog.apiKey?.userId &&
        data.statusCode >= 200 &&
        data.statusCode < 400 &&
        cost > 0 &&
        (isEmbedding || (data.completionTokens && data.completionTokens > 0))
      ) {
        try {
          const { deductUserCredits } = await import("./credits");
          await deductUserCredits(createdLog.apiKey.userId, cost);
        } catch {}
      }
    })
    .catch((err) => {
      console.error("Failed to write request log:", err);
    });
}
