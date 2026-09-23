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
            take: 20,
            include: {
              connection: {
                select: { name: true, accountEmail: true },
              },
            },
          });

          if (newLogs.length > 0) {
            lastTimestamp = newLogs[newLogs.length - 1].createdAt;
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
    },
  });
}
