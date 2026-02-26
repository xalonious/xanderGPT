import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useChatStream } from "../hooks/useChatStream";
import MessageList from "../components/MessageList";
import Composer from "../components/Composer";

type WebSearchMode = "auto" | "force" | "off";

type WebSource = {
  title: string;
  url: string;
  description: string;
};

type AnyMessage = any;

function upsertById(prev: AnyMessage[], msg: AnyMessage) {
  const idx = prev.findIndex((m) => m.id === msg.id);
  if (idx === -1) return [...prev, msg];
  const copy = prev.slice();
  copy[idx] = { ...copy[idx], ...msg };
  return copy;
}

const DRAFT_PREFS_KEY = "xandergpt_draft_system_prompt";

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const convoId = id && id !== "new" ? id : null;

  const { create, conversations, updateTitleLocal, setSystemPrompt } = useConversations();
  const { messages, setMessages, loading } = useMessages(convoId);

  const [error, setError] = useState<string | null>(null);

  const [draftSystemPrompt, setDraftSystemPrompt] = useState<string>(() => {
    try {
      return localStorage.getItem(DRAFT_PREFS_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const conversationsLoadedOnceRef = useRef(false);
  useEffect(() => {
    conversationsLoadedOnceRef.current = true;
  }, [conversations]);

  useEffect(() => {
    if (!convoId) return;
    if (!conversationsLoadedOnceRef.current) return;

    const exists = conversations.some((c) => c.id === convoId);
    if (!exists) {
      setMessages([]);
      navigate("/c/new", { replace: true });
    }
  }, [convoId, conversations, navigate, setMessages]);

  const currentTitle = useMemo(() => {
    if (!convoId) return "New chat";
    return conversations.find((c) => c.id === convoId)?.title ?? "Chat";
  }, [conversations, convoId]);

  const currentSystemPrompt = useMemo(() => {
    if (!convoId) return null;
    return conversations.find((c) => c.id === convoId)?.systemPrompt ?? null;
  }, [conversations, convoId]);

  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState("");

  const effectivePrefsText = convoId ? currentSystemPrompt ?? "" : draftSystemPrompt;

  useEffect(() => {
    if (!prefsOpen) return;
    setPrefsDraft(effectivePrefsText);
  }, [prefsOpen, effectivePrefsText]);

  const savePrefs = async () => {
    if (convoId) {
      await setSystemPrompt(convoId, prefsDraft);
    } else {
      setDraftSystemPrompt(prefsDraft);
      try {
        localStorage.setItem(DRAFT_PREFS_KEY, prefsDraft);
      } catch {
      }
      toast.success("Preferences saved");
    }
    setPrefsOpen(false);
  };

  const clearPrefs = () => {
    setPrefsDraft("");
  };

  const streamingAssistantIdRef = useRef<string | null>(null);

  const { send, stop, streaming } = useChatStream({
    conversationId: convoId,

    onUserMessage: (m) => setMessages((prev) => [...prev, m]),

    onAssistantStart: (m) => {
      streamingAssistantIdRef.current = m.id;
      setMessages((prev) => [...prev, m]);
    },

    onAssistantReplace: (m) => {
      streamingAssistantIdRef.current = m.id;
      setMessages((prev) => upsertById(prev, m));
    },

    onAssistantDelta: (full) => {
      setMessages((prev) => {
        const copy = [...prev];
        const idx = copy.map((x) => x.role).lastIndexOf("assistant");
        if (idx === -1) return prev;
        copy[idx] = { ...copy[idx], content: full };
        return copy;
      });
    },

    onTitle: (title, cid) => {
      updateTitleLocal(cid, title);
    },

    onSources: (sources: WebSource[]) => {
      const assistantId = streamingAssistantIdRef.current;
      if (!assistantId) return;

      setMessages((prev) =>
        upsertById(prev, {
          id: assistantId,
          sources,
        })
      );
    },
  });

  useEffect(() => {
    setError(null);
  }, [convoId]);

  const onSend = async (text: string, webSearch: WebSearchMode) => {
    setError(null);

    try {
      let actualId = convoId;

      if (actualId && conversationsLoadedOnceRef.current) {
        const exists = conversations.some((c) => c.id === actualId);
        if (!exists) actualId = null;
      }

      if (!actualId) {
        const convo = await create("New chat", draftSystemPrompt);
        actualId = convo.id;

        setDraftSystemPrompt("");
        try {
          localStorage.removeItem(DRAFT_PREFS_KEY);
        } catch {
        }

        navigate(`/c/${actualId}`, { replace: true });
      }

      await send(text, actualId, webSearch);
    } catch (e: any) {
      setError(e?.message ?? "Send failed");
    }
  };

  const showHero = !convoId && messages.length === 0;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-6 py-3 border-b border-zinc-800 text-sm text-zinc-300 shrink-0 flex items-center justify-between gap-3">
        <div className="truncate">{currentTitle}</div>

        <button
          type="button"
          onClick={() => setPrefsOpen(true)}
          className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
          title="Conversation preferences"
        >
          Preferences
        </button>
      </div>

      {prefsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div className="text-sm font-medium text-zinc-200">Conversation preferences</div>
              <button
                type="button"
                onClick={() => setPrefsOpen(false)}
                className="rounded-lg px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="mb-3 text-xs text-zinc-400">
                These are applied in addition to XanderGPT&apos;s built-in system prompt, and only when they
                don&apos;t conflict with it.
              </p>

              <textarea
                value={prefsDraft}
                onChange={(e) => setPrefsDraft(e.target.value)}
                placeholder="Example: Use bullet points. Be extra terse. Answer in Dutch."
                className="h-48 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-zinc-700"
              />

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={clearPrefs}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={savePrefs}
                  className="rounded-lg border border-zinc-700 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-950 hover:bg-white"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-auto max-w-5xl w-full px-6 pt-4 shrink-0">
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        </div>
      )}

      {showHero ? (
        <div className="flex-1 min-h-0 grid place-items-center px-6">
          <div className="max-w-xl text-center">
            <img
              src="/logo.svg"
              alt="XanderGPT"
              className="mx-auto mb-4 h-24 w-24 sm:h-28 sm:w-28"
            />
            <div className="text-3xl font-semibold">XanderGPT</div>
            <p className="mt-2 text-zinc-400">Start typing below to begin a new chat.</p>
          </div>
        </div>
      ) : (
        <MessageList messages={loading ? [] : messages} />
      )}

      <div className="shrink-0">
        <Composer disabled={false} streaming={streaming} onSend={onSend} onStop={stop} />
      </div>
    </div>
  );
}