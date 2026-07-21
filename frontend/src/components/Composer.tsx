import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import Textarea from "./TextArea";

type WebSearchMode = "auto" | "force";
type ThinkingMode = "auto" | "force";

function ThinkingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M9 18h6M10 21h4M8.2 15.2A7 7 0 1 1 15.8 15.2C14.8 16 14.3 16.5 14 18h-4c-.3-1.5-.8-2-1.8-2.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Composer({
  disabled,
  onSend,
  onStop,
  streaming,
}: {
  disabled?: boolean;
  streaming: boolean;
  onSend: (text: string, webSearch: WebSearchMode, thinking: ThinkingMode) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [forceThinking, setForceThinking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const plusBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    if (disabled) return;
    if (!streaming) {
      const t = window.setTimeout(() => taRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [streaming, disabled]);

  useEffect(() => {
    if (!menuOpen) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (menuRef.current?.contains(target)) return;
      if (plusBtnRef.current?.contains(target)) return;

      setMenuOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (disabled) return;

    const isEditableTarget = (el: EventTarget | null) => {
      if (!el || !(el as HTMLElement).tagName) return false;
      const node = el as HTMLElement;
      const tag = node.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (node.isContentEditable) return true;
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key.length !== 1) return;
      if (streaming) return;

      const ta = taRef.current;
      if (!ta) return;

      e.preventDefault();
      ta.focus();

      const start = ta.selectionStart ?? text.length;
      const end = ta.selectionEnd ?? text.length;

      const next = text.slice(0, start) + e.key + text.slice(end);
      setText(next);

      requestAnimationFrame(() => {
        try {
          ta.selectionStart = ta.selectionEnd = start + 1;
        } catch {}
      });
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, streaming, text]);

  const send = () => {
    const t = text.trim();
    if (!t) return;

    onSend(
      t,
      forceWebSearch ? "force" : "auto",
      forceThinking ? "force" : "auto"
    );
    setText("");
    setForceWebSearch(false);
    setForceThinking(false);
    setMenuOpen(false);

    requestAnimationFrame(() => taRef.current?.focus());
  };

  return (
    <div className="shrink-0">
      <div className="mx-auto max-w-5xl px-6 py-5">
        <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 backdrop-blur shadow-[0_10px_30px_rgba(0,0,0,0.35)] px-3 py-3">
          <div className="flex items-end gap-3">
            <div className="relative flex items-end">
              <button
                ref={plusBtnRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                disabled={disabled || streaming}
                className={[
                  "mr-1 flex items-center justify-center",
                  "h-10 w-10 rounded-full",
                  "border border-white/10 bg-white/5",
                  "hover:bg-white/10 transition",
                  disabled || streaming ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                title="Tools"
                aria-label="Open tools menu"
                aria-expanded={menuOpen}
              >
                <span className="text-lg font-medium text-zinc-200 leading-none">
                  +
                </span>
              </button>

              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute bottom-12 left-0 z-50 w-64 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                >
                  <div className="px-3 py-2 text-xs text-zinc-400">
                    Tools
                  </div>
                  <div className="h-px bg-white/10" />

                  <button
                    type="button"
                    onClick={() => setForceWebSearch((v) => !v)}
                    aria-pressed={forceWebSearch}
                    className="w-full px-3 py-3 text-left hover:bg-white/5 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-200">🌐</span>
                        <span className="text-sm text-zinc-100">
                          Web search
                        </span>
                      </div>

                      <span
                        className={[
                          "inline-flex h-5 w-9 items-center rounded-full border transition",
                          forceWebSearch
                            ? "bg-white/15 border-white/20"
                            : "bg-white/5 border-white/10",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-block h-4 w-4 rounded-full bg-white/80 shadow transition",
                            forceWebSearch
                              ? "translate-x-4"
                              : "translate-x-1",
                          ].join(" ")}
                        />
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] text-zinc-400">
                      {forceWebSearch
                        ? "Always search for next message"
                        : "Model decides automatically"}
                    </div>
                  </button>

                  <div className="h-px bg-white/10" />

                  <button
                    type="button"
                    onClick={() => setForceThinking((v) => !v)}
                    aria-pressed={forceThinking}
                    className="w-full px-3 py-3 text-left hover:bg-white/5 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-300"><ThinkingIcon /></span>
                        <span className="text-sm text-zinc-100">Think harder</span>
                      </div>

                      <span
                        className={[
                          "inline-flex h-5 w-9 items-center rounded-full border transition",
                          forceThinking
                            ? "bg-white/15 border-white/20"
                            : "bg-white/5 border-white/10",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-block h-4 w-4 rounded-full bg-white/80 shadow transition",
                            forceThinking ? "translate-x-4" : "translate-x-1",
                          ].join(" ")}
                        />
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] text-zinc-400">
                      {forceThinking
                        ? "Use reasoning for next message"
                        : "Model decides automatically"}
                    </div>
                  </button>
                </div>
              )}
            </div>

            <Textarea
              ref={taRef}
              rows={1}
              value={text}
              maxHeightPx={520}
              disabled={disabled || streaming}
              placeholder={streaming ? "Generating…" : "Message XanderGPT…"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              className="min-h-[56px] border-0 bg-transparent focus:border-0 focus:ring-0"
            />

            {streaming ? (
              <Button variant="outline" onClick={onStop}>
                Stop
              </Button>
            ) : (
              <Button onClick={send} disabled={disabled || !text.trim()}>
                Send
              </Button>
            )}
          </div>

          {forceWebSearch && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
              Web search enabled
            </div>
          )}

          {forceThinking && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-300/80" />
              Thinking enabled for next message
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
