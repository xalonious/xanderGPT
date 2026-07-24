import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as convoApi from "../api/conversations";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

function isNearBottom(el: HTMLElement, thresholdPx = 40) {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= thresholdPx;
}

export default function MessageList({
  messages,
  targetMessageId,
  scrollRequestKey,
}: {
  messages: convoApi.MessageDTO[];
  targetMessageId?: string | null;
  scrollRequestKey?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const handledFocusRef = useRef<string | null>(null);

  const stickRef = useRef(true);

  const visibleCount = useMemo(
    () => messages.reduce((acc, m) => acc + (m.role === "system" ? 0 : 1), 0),
    [messages]
  );
  const prevVisibleCountRef = useRef<number>(visibleCount);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const updateStickiness = () => {
      const near = isNearBottom(el);
      stickRef.current = near;
    };

    el.addEventListener("scroll", updateStickiness, { passive: true });
    updateStickiness();

    return () => el.removeEventListener("scroll", updateStickiness);
  }, []);

  useLayoutEffect(() => {
    if (!stickRef.current) {
      prevVisibleCountRef.current = visibleCount;
      return;
    }

    const prev = prevVisibleCountRef.current;
    const isNewMessage = visibleCount > prev;

    endRef.current?.scrollIntoView({ behavior: isNewMessage ? "smooth" : "auto" });
    prevVisibleCountRef.current = visibleCount;
  }, [messages, visibleCount]);

  useEffect(() => {
    if (!targetMessageId) return;

    const requestId = `${scrollRequestKey ?? ""}:${targetMessageId}`;
    if (handledFocusRef.current === requestId) return;

    const target = document.getElementById(`message-${targetMessageId}`);
    if (!target) return;
    handledFocusRef.current = requestId;
    stickRef.current = false;

    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      target.classList.add("chat-search-target");
    });

    const timeout = window.setTimeout(() => {
      target.classList.remove("chat-search-target");
    }, 1800);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      target.classList.remove("chat-search-target");
    };
  }, [messages, targetMessageId, scrollRequestKey]);

  const rendered = useMemo(() => {
    const filtered = messages.filter((m) => m.role !== "system");

    const lastAssistantIndex = (() => {
      for (let i = filtered.length - 1; i >= 0; i--) {
        if (filtered[i].role === "assistant") return i;
      }
      return -1;
    })();

    if (lastAssistantIndex === -1) return filtered;

    const last = filtered[lastAssistantIndex];

    if (
      last.role === "assistant" &&
      (!last.content || last.content.trim() === "") &&
      (!last.thinking || last.thinking.trim() === "")
    ) {
      const copy = [...filtered];
      copy[lastAssistantIndex] = { ...last, content: "__TYPING__" };
      return copy;
    }

    return filtered;
  }, [messages]);

  return (
    <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        {rendered.map((m) => {
          if (m.role === "assistant" && m.content === "__TYPING__") {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-zinc-100">
                  <TypingIndicator mode="typing" />
                </div>
              </div>
            );
          }

          if (m.role === "assistant" && m.content === "__SEARCHING__") {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-zinc-100">
                  <TypingIndicator mode="searching" />
                </div>
              </div>
            );
          }

          if (m.role === "assistant" && m.content === "__COMPACTING__") {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-zinc-100">
                  <TypingIndicator mode="compacting" />
                </div>
              </div>
            );
          }

          if (m.role === "assistant" && m.content === "__FETCHING_URL__") {
            return (
             <div key={m.id} className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-zinc-100">
              <TypingIndicator mode="fetching" />
          </div>
        </div>
  );
}

          if (m.role === "assistant" && m.content === "__CALCULATING__") {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-zinc-100">
                  <TypingIndicator mode="calculating" />
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} id={`message-${m.id}`} className="rounded-2xl">
              <MessageBubble message={m} />
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
