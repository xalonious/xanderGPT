import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useChatStream } from "../hooks/useChatStream";
import MessageList from "../components/MessageList";
import Composer from "../components/Composer";

type WebSearchMode = "auto" | "force" | "off";
type ThinkingMode = "auto" | "force" | "off";

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

function updateMessageById(prev: AnyMessage[], id: string, updates: Partial<AnyMessage>) {
  const idx = prev.findIndex((message) => message.id === id);
  if (idx === -1) return prev;

  const copy = [...prev];
  copy[idx] = { ...copy[idx], ...updates };
  return copy;
}

function TemporaryChatIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M7 18.5H5.5A1.5 1.5 0 0 1 4 17V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V17a1.5 1.5 0 0 1-1.5 1.5H10l-3 2v-2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {enabled && (
        <path
          d="M9 11.8l2.1 2.1L15.8 9.2"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

const DRAFT_PREFS_KEY = "xandergpt_draft_system_prompt";

export default function ChatPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const convoId = id && id !== "new" ? id : null;

  const { create, conversations, updateTitleLocal, setSystemPrompt } = useConversations();
  const { messages, setMessages, loading } = useMessages(convoId);

  const [error, setError] = useState<string | null>(null);
  const [temporaryChat, setTemporaryChat] = useState(false);
  const [tempMessages, setTempMessages] = useState<AnyMessage[]>([]);
  const [tempSystemPrompt, setTempSystemPrompt] = useState("");

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
    if (temporaryChat) return;

    const exists = conversations.some((c) => c.id === convoId);
    if (!exists) {
      setMessages([]);
      navigate("/c/new", { replace: true });
    }
  }, [convoId, conversations, navigate, setMessages, temporaryChat]);

  const currentTitle = useMemo(() => {
    if (temporaryChat) return "Temporary chat";
    if (!convoId) return "New chat";
    return conversations.find((c) => c.id === convoId)?.title ?? "Chat";
  }, [temporaryChat, conversations, convoId]);

  const currentSystemPrompt = useMemo(() => {
    if (!convoId) return null;
    return conversations.find((c) => c.id === convoId)?.systemPrompt ?? null;
  }, [conversations, convoId]);

  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState("");

  const effectivePrefsText = temporaryChat
    ? tempSystemPrompt
    : convoId
      ? currentSystemPrompt ?? ""
      : draftSystemPrompt;

  useEffect(() => {
    if (!prefsOpen) return;
    setPrefsDraft(effectivePrefsText);
  }, [prefsOpen, effectivePrefsText]);

  const savePrefs = async () => {
    if (temporaryChat) {
      setTempSystemPrompt(prefsDraft);
      toast.success("Preferences saved");
    } else if (convoId) {
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

  const appendActiveMessage = useCallback(
    (m: AnyMessage) => {
      if (temporaryChat) {
        setTempMessages((prev) => [...prev, m]);
      } else {
        setMessages((prev) => [...prev, m]);
      }
    },
    [temporaryChat, setMessages]
  );

  const replaceActiveMessage = useCallback(
    (m: AnyMessage) => {
      if (temporaryChat) {
        setTempMessages((prev) => upsertById(prev, m));
      } else {
        setMessages((prev) => upsertById(prev, m));
      }
    },
    [temporaryChat, setMessages]
  );

  const updateActiveAssistant = useCallback(
    (assistantId: string, updates: Partial<AnyMessage>) => {
      if (temporaryChat) {
        setTempMessages((prev) => updateMessageById(prev, assistantId, updates));
      } else {
        setMessages((prev) => updateMessageById(prev, assistantId, updates));
      }
    },
    [temporaryChat, setMessages]
  );

  const { send, sendTemporary, stop, streaming } = useChatStream({
    conversationId: convoId,

    onUserMessage: (m) => appendActiveMessage(m),

    onAssistantStart: (m) => {
      streamingAssistantIdRef.current = m.id;
      appendActiveMessage(m);
    },

    onAssistantReplace: (m) => {
      streamingAssistantIdRef.current = m.id;
      replaceActiveMessage(m);
    },

    onAssistantDelta: (assistantId, full) => {
      updateActiveAssistant(assistantId, { content: full });
    },

    onThinkingDelta: (assistantId, full) => {
      updateActiveAssistant(assistantId, { thinking: full });
    },

    onThinkingComplete: (assistantId, durationMs) => {
      updateActiveAssistant(assistantId, { thinkingDurationMs: durationMs });
    },

    onTitle: (title, cid) => {
      updateTitleLocal(cid, title);
    },

    onSources: (sources: WebSource[]) => {
      const assistantId = streamingAssistantIdRef.current;
      if (!assistantId) return;

      if (temporaryChat) {
        setTempMessages((prev) =>
          upsertById(prev, {
            id: assistantId,
            sources,
          })
        );
      } else {
        setMessages((prev) =>
          upsertById(prev, {
            id: assistantId,
            sources,
          })
        );
      }
    },
  });

  useEffect(() => {
    setError(null);
  }, [convoId, temporaryChat]);

  const stopRef = useRef(stop);
  const preserveStreamOnCreatedConversationRef = useRef(false);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    return () => {
      if (preserveStreamOnCreatedConversationRef.current) {
        preserveStreamOnCreatedConversationRef.current = false;
        return;
      }
      stopRef.current();
    };
  }, [convoId, temporaryChat]);

  const setMessagesRef = useRef(setMessages);
  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  const handledNewChatNonceRef = useRef<number | null>(null);
  const newChatNonce = (location.state as { newChatNonce?: number } | null)?.newChatNonce ?? null;

  useEffect(() => {
    if (newChatNonce == null) return;
    if (handledNewChatNonceRef.current === newChatNonce) return;

    handledNewChatNonceRef.current = newChatNonce;

    stopRef.current();
    setError(null);
    setPrefsOpen(false);
    setPrefsDraft("");
    streamingAssistantIdRef.current = null;
    setMessagesRef.current([]);
    setTempMessages([]);
    setTempSystemPrompt("");
    setTemporaryChat(false);
  }, [newChatNonce]);

  const tempConversationStarted = temporaryChat && tempMessages.length > 0;
  const temporaryToggleLocked = tempConversationStarted || streaming;

  const toggleTemporaryChat = () => {
    if (temporaryToggleLocked) {
      if (tempConversationStarted) {
        toast.error("This temporary chat has already started. Start a new chat to leave temporary mode.");
      }
      return;
    }

    stop();
    setError(null);
    setPrefsOpen(false);
    setPrefsDraft("");
    streamingAssistantIdRef.current = null;

    const next = !temporaryChat;
    setTemporaryChat(next);
    setTempMessages([]);

    if (next) {
      setTempSystemPrompt("");
      navigate("/c/new", { replace: true });
    } else {
      setTempSystemPrompt("");
    }
  };

  const onSend = async (
    text: string,
    webSearch: WebSearchMode,
    thinking: ThinkingMode
  ) => {
    setError(null);

    try {
      if (temporaryChat) {
        const history = tempMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: String(m.content ?? ""),
          }));

        await sendTemporary(text, history, tempSystemPrompt, webSearch, thinking);
        return;
      }

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

        preserveStreamOnCreatedConversationRef.current = true;
        navigate(`/c/${actualId}`, { replace: true });
      }

      await send(text, actualId, webSearch, thinking);
    } catch (e: any) {
      setError(e?.message ?? "Send failed");
    }
  };

  const visibleMessages = temporaryChat ? tempMessages : messages;
  const showHero = visibleMessages.length === 0;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-6 py-3 border-b border-zinc-800 text-sm text-zinc-300 shrink-0 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate">{currentTitle}</div>
          {temporaryChat && (
            <div className="mt-1 text-[11px] text-zinc-500">
              This chat won&apos;t be saved in your history.
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTemporaryChat}
            aria-pressed={temporaryChat}
            disabled={temporaryToggleLocked}
            title={
              tempConversationStarted
                ? "Temporary chat is locked for this conversation. Start a new chat to leave temporary mode."
                : temporaryChat
                  ? "Temporary chat is on. This chat won't be saved."
                  : "Turn on temporary chat. Messages won't be saved."
            }
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition",
              temporaryChat
                ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                : "border-zinc-700 text-zinc-200 hover:bg-zinc-900",
              temporaryToggleLocked ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          >
            <TemporaryChatIcon enabled={temporaryChat} />
          </button>

          <button
            type="button"
            onClick={() => setPrefsOpen(true)}
            className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
            title="Conversation preferences"
          >
            Preferences
          </button>
        </div>
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
            <div className="text-3xl font-semibold">
              {temporaryChat ? "Temporary chat" : "XanderGPT"}
            </div>
            <p className="mt-2 text-zinc-400">
              {temporaryChat
                ? "Messages in this chat are not saved to your history."
                : "Start typing below to begin a new chat."}
            </p>
          </div>
        </div>
      ) : (
        <MessageList messages={loading && !temporaryChat ? [] : visibleMessages} />
      )}

      <div className="shrink-0">
        <Composer disabled={false} streaming={streaming} onSend={onSend} onStop={stop} />
      </div>
    </div>
  );
}
