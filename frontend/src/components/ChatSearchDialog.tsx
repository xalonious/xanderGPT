import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  searchConversations,
  type ConversationDTO,
  type ConversationSearchResult,
} from "../api/conversations";

type DisplayResult = {
  id: string;
  title: string | null;
  updatedAt: string;
  messageId: string | null;
  snippet: string | null;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m16 16 4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();

  return new Intl.DateTimeFormat(undefined, {
    ...(sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }),
  }).format(date);
}

export default function ChatSearchDialog({
  open,
  conversations,
  onClose,
}: {
  open: boolean;
  conversations: ConversationDTO[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ConversationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  const closeDialog = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearching(false);
    setSearchFailed(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeDialog]);

  useEffect(() => {
    if (!open || !query.trim()) return;

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const nextResults = await searchConversations(query.trim());
        if (!cancelled) {
          setResults(nextResults);
          setSearchFailed(false);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearchFailed(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, query]);

  const recentResults = useMemo<DisplayResult[]>(
    () =>
      conversations.slice(0, 6).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messageId: null,
        snippet: null,
      })),
    [conversations]
  );

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const displayedResults: DisplayResult[] = hasQuery ? results : recentResults;

  const openConversation = (result: DisplayResult) => {
    const params = new URLSearchParams();
    if (result.messageId) {
      params.set("message", result.messageId);
      params.set("q", query.trim());
    }

    closeDialog();
    navigate({
      pathname: `/c/${result.id}`,
      search: params.size > 0 ? `?${params.toString()}` : "",
    });
  };

  return createPortal(
    <div
      className="chat-search-backdrop fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-search-title"
        className="chat-search-dialog w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.12] bg-zinc-950/95 shadow-[0_28px_90px_rgba(0,0,0,0.7)] ring-1 ring-black/30"
      >
        <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-b from-white/[0.035] to-transparent px-4">
          <span className="text-zinc-500">
            <SearchIcon />
          </span>
          <h2 id="chat-search-title" className="sr-only">
            Search chats
          </h2>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              setResults([]);
              setSearchFailed(false);
              setSearching(nextQuery.trim().length > 0);
            }}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={closeDialog}
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            aria-label="Close chat search"
          >
            Esc
          </button>
        </div>

        <div className="max-h-[60vh] min-h-44 overflow-y-auto p-2">
          <div className="px-3 pb-2 pt-1 text-xs font-medium text-zinc-500">
            {hasQuery ? "Search results" : "Recent chats"}
          </div>

          {searching && (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">Searching…</div>
          )}

          {!searching && searchFailed && (
            <div className="px-3 py-8 text-center text-sm text-red-300">
              Search failed. Please try again.
            </div>
          )}

          {!searching && !searchFailed && displayedResults.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              {hasQuery ? "No matching chats found." : "Your recent chats will appear here."}
            </div>
          )}

          {!searching &&
            !searchFailed &&
            displayedResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => openConversation(result)}
                className="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/[0.06]"
              >
                <span className="mt-1 text-zinc-500">
                  <SearchIcon />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="truncate text-sm font-medium text-zinc-200">
                      {result.title ?? "Untitled"}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-600">
                      {formatUpdatedAt(result.updatedAt)}
                    </span>
                  </span>
                  {result.snippet && (
                    <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-zinc-500">
                      {result.snippet}
                    </span>
                  )}
                </span>
              </button>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
