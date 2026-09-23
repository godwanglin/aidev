import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authenticateApiKey } from "@/lib/auth";
import { adminLogger, AdminLogItem } from "@/lib/admin-logger";

export const dynamic = "force-dynamic";

async function verifyAdminAuth(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser();
  if (user && (user.role === "ADMIN" || user.email === "admin@devportal.local")) {
    return true;
  }
  const authHeader = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");
  if (authHeader || xApiKey) {
    const auth = await authenticateApiKey(authHeader, xApiKey);
    if (auth.success && auth.apiKey) {
      const role = (auth.apiKey as any)?.user?.role;
      const email = (auth.apiKey as any)?.user?.email;
      if (role === "ADMIN" || email === "admin@devportal.local") {
        return true;
      }
    }
  }
  return false;
}

export async function GET(req: NextRequest) {
  const isAllowed = await verifyAdminAuth(req);
  if (!isAllowed) {
    return NextResponse.json({ error: "Unauthorized. Admin only." }, { status: 403 });
  }

  let isClosed = false;
  let unsubscribe: (() => void) | null = null;
  let keepAliveInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Connection established
      controller.enqueue(
        new TextEncoder().encode(
          `event: connected\ndata: ${JSON.stringify({ status: "connected", time: new Date().toISOString() })}\n\n`
        )
      );

      // 2. Deliver recent backlog
      const recent = adminLogger.getRecentLogs(150);
      if (recent.length > 0) {
        controller.enqueue(
          new TextEncoder().encode(`event: history\ndata: ${JSON.stringify(recent)}\n\n`)
        );
      }

      // 3. Subscribe to live logs
      unsubscribe = adminLogger.subscribe((item: AdminLogItem) => {
        if (isClosed) return;
        try {
          const chunk = `event: log\ndata: ${JSON.stringify(item)}\n\n`;
          controller.enqueue(new TextEncoder().encode(chunk));
        } catch {
          // Stream error or client disconnected
        }
      });

      // 4. Heartbeat keepalive every 10s
      keepAliveInterval = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(new TextEncoder().encode(`: keepalive\n\n`));
        } catch {}
      }, 10000);

      const cleanup = () => {
        isClosed = true;
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
      };

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      isClosed = true;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
