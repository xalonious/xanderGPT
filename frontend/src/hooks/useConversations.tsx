import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ConversationDTO } from "../api/conversations";
import {
  createConversation,
  deleteConversation,
  listConversations,
  renameConversation,
  setConversationSystemPrompt,
} from "../api/conversations";
import { toast } from "sonner";

type ConversationsContextValue = {
  conversations: ConversationDTO[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (title: string, systemPrompt?: string) => Promise<ConversationDTO>;
  remove: (conversationId: string) => Promise<void>;
  rename: (conversationId: string, title: string) => Promise<ConversationDTO>;
  setSystemPrompt: (conversationId: string, systemPrompt: string) => Promise<ConversationDTO>;
  updateTitleLocal: (conversationId: string, title: string) => void;
  updateSystemPromptLocal: (conversationId: string, systemPrompt: string | null) => void;
};

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (err) {
      toast.error("Failed to load conversations");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (title: string, systemPrompt?: string) => {
    try {
      const convo = await createConversation(title, systemPrompt);
      setConversations((prev) => [convo, ...prev]);
      return convo;
    } catch (err) {
      toast.error("Failed to create conversation");
      throw err;
    }
  }, []);

  const remove = useCallback(async (conversationId: string) => {
    let snapshot: ConversationDTO[] | null = null;

    setConversations((prev) => {
      snapshot = prev;
      return prev.filter((c) => c.id !== conversationId);
    });

    try {
      await deleteConversation(conversationId);
      toast.success("Conversation deleted");
    } catch (err) {
      if (snapshot) setConversations(snapshot);
      toast.error("Failed to delete conversation");
      throw err;
    }
  }, []);

  const rename = useCallback(async (conversationId: string, title: string) => {
    try {
      const updated = await renameConversation(conversationId, title);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, title: updated.title, updatedAt: updated.updatedAt }
            : c
        )
      );

      toast.success("Conversation renamed");
      return updated;
    } catch (err) {
      toast.error("Failed to rename conversation");
      throw err;
    }
  }, []);

  const setSystemPrompt = useCallback(async (conversationId: string, systemPrompt: string) => {
    try {
      const updated = await setConversationSystemPrompt(conversationId, systemPrompt);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, systemPrompt: updated.systemPrompt, updatedAt: updated.updatedAt }
            : c
        )
      );

      toast.success("Preferences saved");
      return updated;
    } catch (err) {
      toast.error("Failed to save preferences");
      throw err;
    }
  }, []);

  const updateTitleLocal = useCallback((conversationId: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, title } : c))
    );
  }, []);

  const updateSystemPromptLocal = useCallback((conversationId: string, systemPrompt: string | null) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, systemPrompt } : c))
    );
  }, []);

  const value = useMemo(
    () => ({
      conversations,
      loading,
      refresh,
      create,
      remove,
      rename,
      setSystemPrompt,
      updateTitleLocal,
      updateSystemPromptLocal,
    }),
    [
      conversations,
      loading,
      refresh,
      create,
      remove,
      rename,
      setSystemPrompt,
      updateTitleLocal,
      updateSystemPromptLocal,
    ]
  );

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations() {
  const ctx = useContext(ConversationsContext);
  if (!ctx) throw new Error("useConversations must be used within <ConversationsProvider>");
  return ctx;
}