/**
 * SSE Early & Periodic Keep-Alive utility (9router pattern).
 * Emits SSE comment lines (`: keep-alive\n\n`) to prevent client/gateway timeouts
 * during long upstream reasoning phases, cold starts, or model switching.
 */
export function createKeepAliveTransform(intervalMs = 12000): TransformStream<Uint8Array, Uint8Array> {
  let timer: NodeJS.Timeout | null = null;
  const encoder = new TextEncoder();
  const keepAliveBytes = encoder.encode(": keep-alive\n\n");

  return new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      // Send initial immediate keep-alive flush
      try {
        controller.enqueue(keepAliveBytes);
      } catch {}

      // Start periodic timer
      timer = setInterval(() => {
        try {
          controller.enqueue(keepAliveBytes);
        } catch {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      }, intervalMs);
    },
    transform(chunk, controller) {
      // Forward actual data chunks as soon as they arrive
      controller.enqueue(chunk);
    },
    flush() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  });
}

/**
 * Standard SSE response headers for Next.js App Router (9router pattern)
 */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform, must-revalidate",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
};
