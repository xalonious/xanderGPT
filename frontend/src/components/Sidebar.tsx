import { useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useConversations } from "../hooks/useConversations";
import ChatSearchDialog from "./ChatSearchDialog";

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90">
      <path fill="currentColor" d="M11 5h2v14h-2z" />
      <path fill="currentColor" d="M5 11h14v2H5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90">
      <path
        fill="currentColor"
        d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9z"
      />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25zm18-11.5a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13l3.75 3.75L21 5.75z"
      />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function Sidebar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { conversations, loading, remove, rename } = useConversations();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const activeId = useMemo(() => {
    if (!id || id === "new") return null;
    return id;
  }, [id]);

  const onNewChat = () => {
    navigate("/c/new", {
      replace: activeId === null,
      state: { newChatNonce: Date.now() },
    });
  };

  const startRename = (conversationId: string, currentTitle: string | null) => {
    setRenamingId(conversationId);
    setDraftTitle((currentTitle ?? "").trim());
  };

  const cancelRename = () => {
    setRenamingId(null);
    setDraftTitle("");
  };

  const normalizeTitle = (s: string) => s.trim().replace(/\s+/g, " ");

  const commitRename = async () => {
    if (!renamingId) return;

    const next = normalizeTitle(draftTitle);

    if (!next) {
      cancelRename();
      return;
    }

    const currentRaw = conversations.find((c) => c.id === renamingId)?.title ?? "";
    const current = normalizeTitle(currentRaw);

    if (next === current) {
      cancelRename();
      return;
    }

    try {
      await rename(renamingId, next);
    } finally {
      cancelRename();
    }
  };

  const actionBtnClass =
    "p-2 text-zinc-500 hover:text-zinc-200 transition " +
    "opacity-100 md:opacity-0 md:group-hover:opacity-100 " +
    "md:pointer-events-none md:group-hover:pointer-events-auto";

  return (
    <aside className="w-[280px] shrink-0 h-screen flex flex-col border-r border-white/10 bg-[rgb(var(--sidebar))]">
      <div className="space-y-2 p-3 border-b border-white/10">
        <button
          onClick={onNewChat}
          className="w-full inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm text-zinc-100 transition"
        >
          <IconPlus />
          <span className="font-medium">New chat</span>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="w-full inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition"
        >
          <IconSearch />
          <span>Search chats</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="px-2 py-2 text-xs font-medium text-zinc-500">Chats</div>

        {loading && <div className="px-3 py-2 text-sm text-zinc-500">Loading…</div>}

        {!loading && (
          <div className="space-y-1">
            {conversations.map((c) => {
              const isRenaming = renamingId === c.id;

              return (
                <div key={c.id} className="group flex items-center gap-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="flex-1 rounded-md px-3 py-2 text-sm border border-white/10 bg-black/30 text-zinc-100 outline-none"
                      placeholder="Conversation title"
                    />
                  ) : (
                    <NavLink
                      to={`/c/${c.id}`}
                      className={({ isActive }) =>
                        [
                          "flex-1 rounded-md px-3 py-2 text-sm truncate border transition",
                          isActive || activeId === c.id
                            ? "bg-white/10 border-white/10 text-zinc-100"
                            : "bg-transparent border-transparent text-zinc-300 hover:bg-white/5 hover:border-white/10",
                        ].join(" ")
                      }
                      title={c.title ?? "Untitled"}
                    >
                      {c.title ?? "Untitled"}
                    </NavLink>
                  )}

                  {!isRenaming && (
                    <button
                      title="Rename"
                      className={actionBtnClass}
                      onClick={() => startRename(c.id, c.title ?? "Untitled")}
                    >
                      <IconPencil />
                    </button>
                  )}

                  {!isRenaming && (
                    <button
                      title="Delete"
                      className={actionBtnClass}
                      onClick={async () => {
                        if (!confirm("Delete this conversation?")) return;

                        if (activeId === c.id) {
                          navigate("/c/new", {
                            replace: true,
                            state: { newChatNonce: Date.now() },
                          });
                        }

                        try {
                          await remove(c.id);
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-white/10 text-xs text-zinc-500">
        XanderGPT • Local
      </div>

      <ChatSearchDialog
        open={searchOpen}
        conversations={conversations}
        onClose={() => setSearchOpen(false)}
      />
    </aside>
  );
}
