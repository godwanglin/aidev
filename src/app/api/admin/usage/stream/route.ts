import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.email !== "admin@devportal.local")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let lastTimestamp = new Date(Date.now() - 5000); // Start from 5 seconds ago
  let isClosed = false;
  let intervalId: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(new TextEncoder().encode(`event: connected\ndata: ${JSON.stringify({ status: "connected", time: new Date().toISOString() })}\n\n`));

      intervalId = setInterval(async () => {
        if (isClosed) return;

        try {
          // Fetch any new logs since last poll
          const newLogs = await prisma.upstreamLog.findMany({
            where: {
              createdAt: { gt: lastTimestamp },
            },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              connectionId: true,
              provider: true,
              model: true,
              clientApiKeyId: true,
              clientUserId: true,
              clientUserEmail: true,
              reasoningEffort: true,
              rawHeaders: true,
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
              tokensSavedRtk: true,
              latencyMs: true,
              statusCode: true,
              isFailover: true,
              failoverReason: true,
              createdAt: true,
              connection: {
                select: { name: true, accountEmail: true },
              },
            },
          });

          if (newLogs.length > 0) {
            lastTimestamp = newLogs[newLogs.length - 1].createdAt;

            // Enrich logs with clientUser, clientApiKey, and raw telemetry
            try {
              const userIds = [...new Set(newLogs.map((l: any) => l.clientUserId).filter(Boolean))] as string[];
              const keyIds = [...new Set(newLogs.map((l: any) => l.clientApiKeyId).filter(Boolean))] as string[];

              const [users, apiKeys] = await Promise.all([
                userIds.length > 0
                  ? prisma.user.findMany({
                      where: { id: { in: userIds } },
                      select: { id: true, email: true, name: true, role: true, subscriptionTier: true },
                    })
                  : [],
                keyIds.length > 0
                  ? prisma.apiKey.findMany({
                      where: { id: { in: keyIds } },
                      select: { id: true, name: true, prefix: true, user: { select: { email: true, name: true } } },
                    })
                  : [],
              ]);

              const userMap = new Map(users.map((u) => [u.id, u]));
              const keyMap = new Map(apiKeys.map((k) => [k.id, k]));
              const { telemetryStore } = await import("@/lib/telemetry-store");

              for (const log of newLogs as any[]) {
                const cached = telemetryStore.get(log.id);
                const user = log.clientUserId ? userMap.get(log.clientUserId) : null;
                const key = log.clientApiKeyId ? keyMap.get(log.clientApiKeyId) : null;

                log.clientUser = {
                  id: user?.id || log.clientUserId || null,
                  email: user?.email || log.clientUserEmail || key?.user?.email || cached?.clientAccount?.email || "Direct API",
                  name: user?.name || key?.user?.name || cached?.clientAccount?.name || null,
                  role: user?.role || "USER",
                  tier: user?.subscriptionTier || "FREE",
                  keyPrefix: key?.prefix || null,
                  keyName: key?.name || null,
                };

                if (!log.reasoningEffort && cached?.reasoningEffort) {
                  log.reasoningEffort = cached.reasoningEffort;
                }
                if (!log.rawHeaders && cached?.rawHeaders) {
                  log.rawHeaders = cached.rawHeaders;
                }
                if (!log.rawBody && cached?.rawBody) {
                  log.rawBody = cached.rawBody;
                }
                if (!log.rawResponse && cached?.rawResponse) {
                  log.rawResponse = cached.rawResponse;
                }
              }
            } catch {}

            for (const log of newLogs) {
              const dataString = `event: request\ndata: ${JSON.stringify(log)}\n\n`;
              controller.enqueue(new TextEncoder().encode(dataString));
            }
          } else {
            // Heartbeat
            controller.enqueue(new TextEncoder().encode(`: keepalive\n\n`));
          }
        } catch (err) {
          // Ignore polling errors
        }
      }, 1500);

      const cleanup = () => {
        isClosed = true;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      isClosed = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
