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
  durationMs?: number | null;
}

export function logRequest(data: RequestLogData) {
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
        durationMs: data.durationMs ?? null,
      },
      include: {
        apiKey: {
          select: { userId: true },
        },
      },
    })
    .then(async (createdLog) => {
      // Deduct token from user balance in real-time
      if (data.totalTokens && data.totalTokens > 0 && createdLog.apiKey?.userId) {
        try {
          await prisma.user.update({
            where: { id: createdLog.apiKey.userId },
            data: {
              tokenBalance: {
                decrement: BigInt(data.totalTokens),
              },
            },
          });
        } catch {}
      }
    })
    .catch((err) => {
      console.error("Failed to write request log:", err);
    });
}
