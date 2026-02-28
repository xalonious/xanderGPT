import { useCallback, useRef, useState } from "react";
import { sendMessageStream } from "../api/stream";
import * as convoApi from "../api/conversations";

type LocalStatus = "normal" | "cancelled";

type LocalMessage = convoApi.MessageDTO & {
  local?: boolean;
  status?: LocalStatus;
};

type WebSearchMode = "auto" | "force" | "off";

type WebSource = {
  title: string;
  url: string;
  description: string;
};

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  return anyErr?.name === "AbortError" || anyErr?.code === "ABORT_ERR";
}

export function useChatStream(opts: {
  conversationId: string | null;
  onUserMessage: (m: LocalMessage) => void;
  onAssistantStart: (m: LocalMessage) => void;
  onAssistantReplace: (m: LocalMessage) => void;
  onAssistantDelta: (fullText: string) => void;
  onTitle?: (title: string, conversationId: string) => void;

  onSources?: (sources: WebSource[], conversationId: string) => void;
}) {
  const {
    conversationId,
    onUserMessage,
    onAssistantStart,
    onAssistantReplace,
    onAssistantDelta,
    onTitle,
    onSources
  } = opts;

  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);

  const hasReceivedTokenRef = useRef(false);
  const lastSourcesRef = useRef<WebSource[] | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);

    const assistantId = lastAssistantIdRef.current;
    if (assistantId) {
      onAssistantReplace({
        id: assistantId,
        conversationId: conversationId ?? "",
        role: "assistant",
        content: "Prompt cancelled",
        createdAt: new Date().toISOString(),
        local: true,
        status: "cancelled"
      });
    }
  }, [conversationId, onAssistantReplace]);

  const send = useCallback(
    async (content: string, conversationIdOverride?: string, webSearch: WebSearchMode = "auto") => {
      const activeId = conversationIdOverride ?? conversationId;
      if (!activeId) throw new Error("No conversation selected");

      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userId = `local-user-${crypto.randomUUID()}`;
      const assistantId = `local-assistant-${crypto.randomUUID()}`;
      lastAssistantIdRef.current = assistantId;

      hasReceivedTokenRef.current = false;
      lastSourcesRef.current = null;

      const userMsg: LocalMessage = {
        id: userId,
        conversationId: activeId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
        local: true,
        status: "normal"
      };
      onUserMessage(userMsg);

      const assistantMsg: LocalMessage = {
        id: assistantId,
        conversationId: activeId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        local: true,
        status: "normal"
      };
      onAssistantStart(assistantMsg);

      let full = "";

      try {
        await sendMessageStream({
          conversationId: activeId,
          content,
          webSearch,
          signal: ctrl.signal,

          onTool: (evt) => {

            if (evt.type === "tool" && evt.tool === "calculator") {
              if (!hasReceivedTokenRef.current) {
                onAssistantReplace({
                  id: assistantId,
                  conversationId: activeId,
                  role: "assistant",
                  content: "__CALCULATING__",
                  createdAt: new Date().toISOString(),
                  local: true,
                  status: "normal"
                });
              }
              return;
            }

            if (evt.type === "tool" && evt.tool === "web_search") {
              if (!hasReceivedTokenRef.current) {
                onAssistantReplace({
                  id: assistantId,
                  conversationId: activeId,
                  role: "assistant",
                  content: "__SEARCHING__",
                  createdAt: new Date().toISOString(),
                  local: true,
                  status: "normal"
                });
              }
              return;
            }

            if (evt.type === "tool" && evt.tool === "fetch_url") {
              if (!hasReceivedTokenRef.current) {
                onAssistantReplace({
                  id: assistantId,
                  conversationId: activeId,
                  role: "assistant",
                  content: "__SEARCHING__",
                  createdAt: new Date().toISOString(),
                  local: true,
                  status: "normal"
                });
              }
              return;
            }

            if (evt.type === "tool_result" && evt.tool === "web_search") {
              const sources = (evt.results ?? []) as WebSource[];
              lastSourcesRef.current = sources;
              onSources?.(sources, activeId);
              return;
            }

            if (evt.type === "tool_result" && evt.tool === "calculator") {
              return;
            }

            if (evt.type === "tool_result" && evt.tool === "fetch_url") {
              return;
            }
          },

          onToken: (t) => {
            if (!hasReceivedTokenRef.current) {
              hasReceivedTokenRef.current = true;
            }
            full += t;
            onAssistantDelta(full);
          },

          onTitle: (title) => onTitle?.(title, activeId)
        });
      } catch (err) {
        if (ctrl.signal.aborted || isAbortError(err)) {
          onAssistantReplace({
            ...assistantMsg,
            content: "Prompt cancelled",
            status: "cancelled"
          });
          return;
        }
        throw err;
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [
      conversationId,
      onUserMessage,
      onAssistantStart,
      onAssistantReplace,
      onAssistantDelta,
      onTitle,
      onSources
    ]
  );

  return { send, stop, streaming };
}