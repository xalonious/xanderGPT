import { useCallback, useRef, useState } from "react";
import { sendMessageStream, sendTemporaryMessageStream } from "../api/stream";
import * as convoApi from "../api/conversations";

type LocalStatus = "normal" | "cancelled";

type LocalMessage = Omit<
  convoApi.MessageDTO,
  "sources" | "thinking" | "thinkingDurationMs"
> & {
  sources?: convoApi.WebSource[] | null;
  thinking?: string | null;
  thinkingDurationMs?: number | null;
  local?: boolean;
  status?: LocalStatus;
};

type WebSearchMode = "auto" | "force" | "off";
type ThinkingMode = "auto" | "force" | "off";

type WebSource = convoApi.WebSource;

const TEMP_CONVERSATION_ID = "__temp__";

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
  onAssistantDelta: (assistantId: string, fullText: string) => void;
  onThinkingDelta: (assistantId: string, fullText: string) => void;
  onThinkingComplete: (assistantId: string, durationMs: number) => void;
  onTitle?: (title: string, conversationId: string) => void;

  onSources?: (sources: WebSource[], conversationId: string) => void;
}) {
  const {
    conversationId,
    onUserMessage,
    onAssistantStart,
    onAssistantReplace,
    onAssistantDelta,
    onThinkingDelta,
    onThinkingComplete,
    onTitle,
    onSources,
  } = opts;

  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);
  const lastConversationIdRef = useRef<string | null>(null);

  const hasReceivedTokenRef = useRef(false);
  const hasReceivedThinkingRef = useRef(false);
  const lastSourcesRef = useRef<WebSource[] | null>(null);
  const lastContentRef = useRef("");
  const lastThinkingRef = useRef("");
  const thinkingStartedAtRef = useRef<number | null>(null);
  const lastThinkingDurationMsRef = useRef<number | null>(null);
  const temporaryContextSummaryRef = useRef<string | null>(null);
  const temporaryCompactedMessageCountRef = useRef(0);

  const finishThinking = useCallback(
    (assistantId: string, serverDurationMs?: number | null) => {
      const measuredDurationMs =
        thinkingStartedAtRef.current === null
          ? null
          : Math.max(0, Date.now() - thinkingStartedAtRef.current);
      const durationMs = serverDurationMs ?? measuredDurationMs;

      if (durationMs === null || lastThinkingRef.current.length === 0) return;
      lastThinkingDurationMsRef.current = durationMs;
      onThinkingComplete(assistantId, durationMs);
    },
    [onThinkingComplete]
  );

  const stop = useCallback(() => {
    const activeController = abortRef.current;
    if (!activeController) return;

    activeController.abort();
    abortRef.current = null;
    setStreaming(false);

    const assistantId = lastAssistantIdRef.current;
    if (assistantId) {
      finishThinking(assistantId);
      onAssistantReplace({
        id: assistantId,
        conversationId:
          lastConversationIdRef.current ?? conversationId ?? TEMP_CONVERSATION_ID,
        role: "assistant",
        content: lastContentRef.current || "Prompt cancelled",
        thinking: lastThinkingRef.current || null,
        thinkingDurationMs: lastThinkingDurationMsRef.current,
        createdAt: new Date().toISOString(),
        local: true,
        status: "cancelled",
      });
    }
  }, [conversationId, finishThinking, onAssistantReplace]);

  const send = useCallback(
    async (
      content: string,
      conversationIdOverride?: string,
      webSearch: WebSearchMode = "auto",
      thinking: ThinkingMode = "auto"
    ) => {
      const activeId = conversationIdOverride ?? conversationId;
      if (!activeId) throw new Error("No conversation selected");
      lastConversationIdRef.current = activeId;

      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userId = `local-user-${crypto.randomUUID()}`;
      const assistantId = `local-assistant-${crypto.randomUUID()}`;
      lastAssistantIdRef.current = assistantId;

      hasReceivedTokenRef.current = false;
      hasReceivedThinkingRef.current = false;
      lastSourcesRef.current = null;
      lastContentRef.current = "";
      lastThinkingRef.current = "";
      thinkingStartedAtRef.current = null;
      lastThinkingDurationMsRef.current = null;

      const userMsg: LocalMessage = {
        id: userId,
        conversationId: activeId,
        role: "user",
        content,
        thinking: null,
        thinkingDurationMs: null,
        createdAt: new Date().toISOString(),
        local: true,
        status: "normal",
      };
      onUserMessage(userMsg);

      const assistantMsg: LocalMessage = {
        id: assistantId,
        conversationId: activeId,
        role: "assistant",
        content: "",
        thinking: null,
        thinkingDurationMs: null,
        createdAt: new Date().toISOString(),
        local: true,
        status: "normal",
      };
      onAssistantStart(assistantMsg);

      let full = "";

      try {
        await sendMessageStream({
          conversationId: activeId,
          content,
          webSearch,
          thinking,
          signal: ctrl.signal,

          onCompaction: (event) => {
            if (hasReceivedTokenRef.current || hasReceivedThinkingRef.current) return;

            onAssistantReplace({
              ...assistantMsg,
              content: event.status === "start" ? "__COMPACTING__" : "",
              thinking: null,
            });
          },

          onThinking: (token) => {
            if (thinkingStartedAtRef.current === null) {
              thinkingStartedAtRef.current = Date.now();
            }
            lastThinkingRef.current += token;
            if (!hasReceivedThinkingRef.current) {
              hasReceivedThinkingRef.current = true;
              onAssistantReplace({
                ...assistantMsg,
                content: "",
                thinking: lastThinkingRef.current,
              });
            } else {
              onThinkingDelta(assistantId, lastThinkingRef.current);
            }
          },

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
                  status: "normal",
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
                  status: "normal",
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
                  content: "__FETCHING_URL__",
                  createdAt: new Date().toISOString(),
                  local: true,
                  status: "normal",
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

            if (evt.type === "tool_result" && evt.tool === "calculator") return;
            if (evt.type === "tool_result" && evt.tool === "fetch_url") return;
          },

          onToken: (t) => {
            if (!hasReceivedTokenRef.current) {
              hasReceivedTokenRef.current = true;
              finishThinking(assistantId);
            }
            full += t;
            lastContentRef.current = full;
            onAssistantDelta(assistantId, full);
          },

          onTitle: (title) => onTitle?.(title, activeId),
          onDone: (durationMs) => finishThinking(assistantId, durationMs),
        });
      } catch (err) {
        if (ctrl.signal.aborted || isAbortError(err)) {
          finishThinking(assistantId);
          onAssistantReplace({
            ...assistantMsg,
            content: lastContentRef.current || "Prompt cancelled",
            thinking: lastThinkingRef.current || null,
            thinkingDurationMs: lastThinkingDurationMsRef.current,
            status: "cancelled",
          });
          return;
        }
        throw err;
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setStreaming(false);
      }
    },
    [
      conversationId,
      onUserMessage,
      onAssistantStart,
      onAssistantReplace,
      onAssistantDelta,
      onThinkingDelta,
      finishThinking,
      onTitle,
      onSources,
    ]
  );

  const sendTemporary = useCallback(
    async (
      content: string,
      history: Array<{ role: "user" | "assistant"; content: string }>,
      systemPrompt: string,
      webSearch: WebSearchMode = "auto",
      thinking: ThinkingMode = "auto"
    ) => {
      const activeId = TEMP_CONVERSATION_ID;
      lastConversationIdRef.current = activeId;

      if (
        history.length === 0 ||
        temporaryCompactedMessageCountRef.current > history.length
      ) {
        temporaryContextSummaryRef.current = null;
        temporaryCompactedMessageCountRef.current = 0;
      }

      const uncompactedHistory = history.slice(
        temporaryCompactedMessageCountRef.current
      );

      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userId = `local-user-${crypto.randomUUID()}`;
      const assistantId = `local-assistant-${crypto.randomUUID()}`;
      lastAssistantIdRef.current = assistantId;

      hasReceivedTokenRef.current = false;
      hasReceivedThinkingRef.current = false;
      lastSourcesRef.current = null;
      lastContentRef.current = "";
      lastThinkingRef.current = "";
      thinkingStartedAtRef.current = null;
      lastThinkingDurationMsRef.current = null;

      const userMsg: LocalMessage = {
        id: userId,
        conversationId: activeId,
        role: "user",
        content,
        thinking: null,
        thinkingDurationMs: null,
        createdAt: new Date().toISOString(),
        local: true,
        status: "normal",
      };
      onUserMessage(userMsg);

      const assistantMsg: LocalMessage = {
        id: assistantId,
        conversationId: activeId,
        role: "assistant",
        content: "",
        thinking: null,
        thinkingDurationMs: null,
        createdAt: new Date().toISOString(),
        local: true,
        status: "normal",
      };
      onAssistantStart(assistantMsg);

      let full = "";

      try {
        await sendTemporaryMessageStream({
          content,
          history: uncompactedHistory,
          systemPrompt,
          contextSummary: temporaryContextSummaryRef.current,
          compactedMessageCount: temporaryCompactedMessageCountRef.current,
          webSearch,
          thinking,
          signal: ctrl.signal,

          onCompaction: (event) => {
            if (event.status === "complete") {
              if (typeof event.summary === "string" && event.summary.trim()) {
                temporaryContextSummaryRef.current = event.summary;
              }
              if (typeof event.compactedMessageCount === "number") {
                temporaryCompactedMessageCountRef.current = event.compactedMessageCount;
              }
            }

            if (hasReceivedTokenRef.current || hasReceivedThinkingRef.current) return;

            onAssistantReplace({
              ...assistantMsg,
              content: event.status === "start" ? "__COMPACTING__" : "",
              thinking: null,
            });
          },

          onThinking: (token) => {
            if (thinkingStartedAtRef.current === null) {
              thinkingStartedAtRef.current = Date.now();
            }
            lastThinkingRef.current += token;
            if (!hasReceivedThinkingRef.current) {
              hasReceivedThinkingRef.current = true;
              onAssistantReplace({
                ...assistantMsg,
                content: "",
                thinking: lastThinkingRef.current,
              });
            } else {
              onThinkingDelta(assistantId, lastThinkingRef.current);
            }
          },

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
                  status: "normal",
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
                  status: "normal",
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
                  content: "__FETCHING_URL__",
                  createdAt: new Date().toISOString(),
                  local: true,
                  status: "normal",
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

            if (evt.type === "tool_result" && evt.tool === "calculator") return;
            if (evt.type === "tool_result" && evt.tool === "fetch_url") return;
          },

          onToken: (t) => {
            if (!hasReceivedTokenRef.current) {
              hasReceivedTokenRef.current = true;
              finishThinking(assistantId);
            }
            full += t;
            lastContentRef.current = full;
            onAssistantDelta(assistantId, full);
          },
          onDone: (durationMs) => finishThinking(assistantId, durationMs),
        });
      } catch (err) {
        if (ctrl.signal.aborted || isAbortError(err)) {
          finishThinking(assistantId);
          onAssistantReplace({
            ...assistantMsg,
            content: lastContentRef.current || "Prompt cancelled",
            thinking: lastThinkingRef.current || null,
            thinkingDurationMs: lastThinkingDurationMsRef.current,
            status: "cancelled",
          });
          return;
        }
        throw err;
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setStreaming(false);
      }
    },
    [
      onUserMessage,
      onAssistantStart,
      onAssistantReplace,
      onAssistantDelta,
      onThinkingDelta,
      finishThinking,
      onSources,
    ]
  );

  return { send, sendTemporary, stop, streaming };
}
