import api from "./axios";

export type ConversationDTO = {
  id: string;
  title: string | null;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageRole = "system" | "user" | "assistant";

export type MessageDTO = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

type ConversationsResponse = { conversations: ConversationDTO[] };
type ConversationResponse = { conversation: ConversationDTO };
type MessagesResponse = { messages: MessageDTO[] };
type MessageResponse = { message: MessageDTO };

export function listConversations(): Promise<ConversationDTO[]> {
  return api.get<ConversationsResponse>("/conversations").then((r) => r.data.conversations);
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