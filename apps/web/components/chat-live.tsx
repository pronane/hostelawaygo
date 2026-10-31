"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reportMessageAction, sendMessageAction } from "@/app/actions/chat";
import { formatSqlTime } from "@/lib/time";

export type ChatMessage = {
  id: number;
  body: string;
  created_at: string;
  reported: number;
  mine: number;
  name: string;
  initials: string;
  colour: string;
  flag: string;
};

const MAX_KEPT = 200;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-MAX_KEPT);
}

/**
 * Live event chat.
 *
 * The server renders the history so the page works without JavaScript; this
 * component then subscribes to /api/events/:id/stream (SSE) and appends what
 * arrives. Posting goes through a server action, and React resets the form.
 */
export function ChatLive({
  eventId,
  initial,
  signedIn,
  placeholder,
}: {
  eventId: number;
  initial: ChatMessage[];
  signedIn: boolean;
  placeholder: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [live, setLive] = useState(false);
  const seen = useRef<Set<number>>(new Set(initial.map((m) => m.id)));

  // The RSC payload refreshes after a post or a report — fold it in.
  useEffect(() => {
    setMessages((current) => mergeMessages(current, initial));
    for (const message of initial) seen.current.add(message.id);
  }, [initial]);

  useEffect(() => {
    // Start from the last message already on the page so the server doesn't resend it.
    const startAfter = initial.length ? initial[initial.length - 1].id : 0;
    const source = new EventSource(`/api/events/${eventId}/stream?after=${startAfter}`);

    const onReady = () => setLive(true);
    const onMessage = (event: MessageEvent<string>) => {
      try {
        const incoming = JSON.parse(event.data) as ChatMessage;
        if (seen.current.has(incoming.id)) return;
        seen.current.add(incoming.id);
        setMessages((current) => mergeMessages(current, [incoming]));
      } catch {
        /* ignore malformed frames */
      }
    };

    source.addEventListener("ready", onReady);
    source.addEventListener("message", onMessage as EventListener);
    source.onopen = onReady;
    source.onerror = () => setLive(false); // EventSource retries on its own

    return () => {
      source.removeEventListener("ready", onReady);
      source.removeEventListener("message", onMessage as EventListener);
      source.close();
    };
    // Only re-subscribe when the event changes; `initial` is folded in above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return (
    <>
      <div className="chat-head">
        <div className="panel-head" style={{ margin: 0 }}>
          Event chat · {messages.length === 1 ? "1 message" : `${messages.length} messages`}
        </div>
        <span className="chat-live">
          <span className={`live${live ? "" : " off"}`} /> {live ? "live" : "reconnecting…"}
        </span>
      </div>

      <div className="chat-list" aria-live="polite">
        {messages.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "#8b7d72", margin: 0 }}>
            No messages yet. Ask the question everyone else is too shy to ask.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`msg${m.mine ? " mine" : ""}`}>
              <span className="av" style={{ background: m.colour }} aria-hidden="true">
                {m.initials}
              </span>
              <div className="msg-body">
                <div className="msg-top">
                  <b>
                    {m.mine ? "You" : m.name} <span aria-hidden="true">{m.flag}</span>
                  </b>
                  <span>{formatSqlTime(m.created_at)}</span>
                  {m.reported ? <span className="msg-flag">reported</span> : null}
                </div>
                <p>{m.body}</p>
                {!m.mine && signedIn ? (
                  <form action={reportMessageAction} className="msg-report">
                    <input type="hidden" name="messageId" value={m.id} />
                    <input type="hidden" name="eventId" value={eventId} />
                    <button type="submit">Report</button>
                  </form>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {signedIn ? (
        <form action={sendMessageAction} className="chat-form">
          <input type="hidden" name="eventId" value={eventId} />
          <input
            name="body"
            placeholder={placeholder}
            maxLength={500}
            required
            aria-label="Message"
            autoComplete="off"
          />
          <button type="submit" className="btn primary">
            Send
          </button>
        </form>
      ) : (
        <div className="chat-signin">
          <span>Sign in to join the conversation.</span>
          <Link href={`/login?next=${encodeURIComponent(`/event/${eventId}`)}`} className="btn small">
            Sign in
          </Link>
        </div>
      )}
    </>
  );
}
