import { getCurrentUser } from "@/lib/auth";
import { getEvent, getMessagesAfter } from "@/lib/queries";

export const dynamic = "force-dynamic";

const POLL_MS = 2000;
const HEARTBEAT_MS = 15_000;
const MAX_CONNECTION_MS = 8 * 60_000;

/**
 * Server-Sent Events for event chat.
 *
 * One connection per open chat, holding a cheap SQLite query every two seconds
 * and pushing only what's new. `Last-Event-ID` (set automatically by the browser
 * on reconnect) means a dropped connection resumes exactly where it stopped.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return new Response("Bad event id", { status: 400 });
  }
  if (!getEvent(eventId, null)) {
    return new Response("Not found", { status: 404 });
  }

  const user = await getCurrentUser();
  const me = user?.id ?? null;

  const url = new URL(request.url);
  const headerCursor = Number(request.headers.get("last-event-id") ?? "0");
  const queryCursor = Number(url.searchParams.get("after") ?? "0");
  let cursor = Math.max(
    Number.isFinite(headerCursor) ? headerCursor : 0,
    Number.isFinite(queryCursor) ? queryCursor : 0
  );

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let closed = false;
  let tick: ReturnType<typeof setInterval> | undefined;
  let lastSend = Date.now();

  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };

        const finish = () => {
          if (closed) return;
          closed = true;
          if (tick) clearInterval(tick);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        send(`retry: 3000\n`);
        send(`event: ready\ndata: ${JSON.stringify({ eventId, cursor })}\n\n`);

        tick = setInterval(() => {
          if (request.signal.aborted) {
            finish();
            return;
          }

          try {
            for (const message of getMessagesAfter(eventId, cursor, me)) {
              cursor = Math.max(cursor, message.id);
              send(`id: ${message.id}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`);
              lastSend = Date.now();
            }
          } catch {
            finish();
            return;
          }

          if (Date.now() - lastSend > HEARTBEAT_MS) {
            send(`: ping ${Date.now()}\n\n`);
            lastSend = Date.now();
          }

          // Close politely; the browser reconnects with Last-Event-ID.
          if (Date.now() - startedAt > MAX_CONNECTION_MS) finish();
        }, POLL_MS);

        request.signal.addEventListener("abort", finish);
      },
      cancel() {
        closed = true;
        if (tick) clearInterval(tick);
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    }
  );
}
