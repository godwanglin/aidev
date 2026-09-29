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
  costUsd?: number | null;
  durationMs?: number | null;
}

export async function logRequest(data: RequestLogData) {
  let cost = data.costUsd ?? 0;
  const isEmbedding = Boolean(data.path?.includes("embeddings"));
  const isImage = Boolean(data.path?.includes("images"));
  const hasNoCompletion = !data.completionTokens || data.completionTokens <= 0;

  // Strict Rule 1: Error status (HTTP >= 400) NEVER incurs balance cost
  if (data.statusCode >= 400) {
    cost = 0;
  }

  // Strict Rule 2: Non-embedding & non-image requests without generated completion tokens NEVER incur balance cost
  if (!isEmbedding && !isImage && hasNoCompletion) {
    cost = 0;
  }

  // Calculate image cost if not explicitly passed
  if (cost === 0 && isImage && data.statusCode >= 200 && data.statusCode < 400) {
    try {
      const combo = data.model ? await prisma.comboModel.findFirst({ where: { comboId: data.model } }) : null;
      cost = Number(combo?.imageCostUsd || 0.005);
    } catch {
      cost = 0.005;
    }
  }

  // Only calculate cost if response was successful (2xx/3xx) and generated real output (or is embedding/image)
  if (cost === 0 && data.statusCode >= 200 && data.statusCode < 400 && (isEmbedding || !hasNoCompletion)) {
    if (data.totalTokens && data.totalTokens > 0) {
      try {
        const { calculateUsdCost } = await import("./billing");
        const promptTok = data.promptTokens || Math.round(data.totalTokens * 0.8);
        const compTok = data.completionTokens || Math.max(1, data.totalTokens - promptTok);
        cost = await calculateUsdCost(data.model || "default", promptTok, compTok);
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
        costUsd: cost,
        durationMs: data.durationMs ?? null,
      },
      include: {
        apiKey: {
          select: { userId: true },
        },
      },
    })
    .then(async (createdLog) => {
      // Deduct USD from user balance in real-time only on successful responses (2xx/3xx)
      // with real generated content (completion tokens > 0, or embedding)
      if (
        createdLog.apiKey?.userId &&
        data.statusCode >= 200 &&
        data.statusCode < 400 &&
        cost > 0 &&
        (isEmbedding || isImage || (data.completionTokens && data.completionTokens > 0))
      ) {
        try {
          const { deductUserBalance } = await import("./billing");
          await deductUserBalance(createdLog.apiKey.userId, cost);
        } catch {}
      }
    })
    .catch((err) => {
      console.error("Failed to write request log:", err);
    });
}
