import api from "./axios";

export type ConversationDTO = {
  id: string;
  title: string | null;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageRole = "system" | "user" | "assistant";

export type WebSource = {
  title: string;
  url: string;
  description: string;
};

export type MessageDTO = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  thinking: string | null;
  thinkingDurationMs: number | null;
  sources: WebSource[] | null;
  createdAt: string;
};

export type ConversationSearchResult = {
  id: string;
  title: string | null;
  updatedAt: string;
  matchType: "title" | "message";
  messageId: string | null;
  snippet: string | null;
};

type ConversationsResponse = { conversations: ConversationDTO[] };
type ConversationResponse = { conversation: ConversationDTO };
type MessagesResponse = { messages: MessageDTO[] };
type MessageResponse = { message: MessageDTO };
type ConversationSearchResponse = { results: ConversationSearchResult[] };

export function listConversations(): Promise<ConversationDTO[]> {
  return api.get<ConversationsResponse>("/conversations").then((r) => r.data.conversations);
}

export function searchConversations(query: string): Promise<ConversationSearchResult[]> {
  return api
    .get<ConversationSearchResponse>("/conversations/search", { params: { q: query } })
    .then((r) => r.data.results);
}

export function createConversation(title: string, systemPrompt?: string): Promise<ConversationDTO> {
  return api
    .post<ConversationResponse>("/conversations", { title, systemPrompt })
    .then((r) => r.data.conversation);
}

export function updateConversation(
  conversationId: string,
  data: { title?: string; systemPrompt?: string }
): Promise<ConversationDTO> {
  return api
    .patch<ConversationResponse>(`/conversations/${conversationId}`, data)
    .then((r) => r.data.conversation);
}

export function renameConversation(conversationId: string, title: string): Promise<ConversationDTO> {
  return updateConversation(conversationId, { title });
}

export function setConversationSystemPrompt(
  conversationId: string,
  systemPrompt: string
): Promise<ConversationDTO> {
  return updateConversation(conversationId, { systemPrompt });
}

export function deleteConversation(conversationId: string): Promise<void> {
  return api.delete(`/conversations/${conversationId}`).then(() => {});
}

export function getMessages(conversationId: string): Promise<MessageDTO[]> {
  return api
    .get<MessagesResponse>(`/conversations/${conversationId}/messages`)
    .then((r) => r.data.messages);
}

export function sendMessage(conversationId: string, content: string): Promise<MessageDTO> {
  return api
    .post<MessageResponse>(`/conversations/${conversationId}/messages`, { content })
    .then((r) => r.data.message);
}
