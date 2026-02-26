import { useCallback, useEffect, useRef, useState } from "react";
import * as convoApi from "../api/conversations";

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<convoApi.MessageDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<convoApi.MessageDTO[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const refresh = useCallback(async (idOverride?: string) => {
    const id = idOverride ?? conversationId;
    if (!id) return;

    setLoading(true);
    setError(null);
    try {
      const ms = await convoApi.getMessages(id);
      setMessages(ms);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      if (messagesRef.current.length === 0) setMessages([]);
      return;
    }

    const id = conversationId;

    const cur = messagesRef.current;
    if (cur.length > 0 && cur[0]?.conversationId === id) {
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const ms = await convoApi.getMessages(id);
        if (!cancelled) setMessages(ms);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return { messages, setMessages, loading, error, refresh };
}