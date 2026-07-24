import { ollamaChat, type OllamaMessage } from "./ollamaService";
import { buildRollingSummaryMessages } from "../prompts/conversationPrompts";

const SUMMARY_RECORD_PREFIX = "__XANDERGPT_CONTEXT_SUMMARY_V1__\n";
const CONTEXT_TOKEN_LIMIT = 8192;
const COMPACTION_TRIGGER_TOKENS = CONTEXT_TOKEN_LIMIT * 0.75;
const RECENT_CONTEXT_TARGET_TOKENS = 2450;
const MIN_RECENT_MESSAGES = 2;
const MAX_SUMMARY_CHARS = 6_000;
const SUMMARY_BATCH_TARGET_TOKENS = 4000;

export type CompactableMessage = {
  role: "user" | "assistant";
  content: string;
};

export type StoredContextSummary = {
  version: 1;
  throughMessageId: string;
  summary: string;
};

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

export function estimateMessagesTokens(messages: OllamaMessage[]): number {
  return messages.reduce(
    (total, message) => total + estimateTextTokens(message.content) + 6,
    0
  );
}

export function shouldCompactContext(
  history: OllamaMessage[],
  nextUserMessage: string
): boolean {
  return (
    estimateMessagesTokens(history) + estimateTextTokens(nextUserMessage) + 6 >=
    COMPACTION_TRIGGER_TOKENS
  );
}

export function splitMessagesForCompaction(messages: CompactableMessage[]): {
  compactable: CompactableMessage[];
  recent: CompactableMessage[];
} {
  if (messages.length <= MIN_RECENT_MESSAGES) {
    return { compactable: [], recent: messages };
  }

  let recentTokens = 0;
  let splitIndex = messages.length;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const messageTokens = estimateTextTokens(messages[index].content) + 6;
    const recentCount = messages.length - index;

    if (
      recentCount <= MIN_RECENT_MESSAGES ||
      recentTokens + messageTokens <= RECENT_CONTEXT_TARGET_TOKENS
    ) {
      recentTokens += messageTokens;
      splitIndex = index;
      continue;
    }

    break;
  }

  while (splitIndex > 0 && messages[splitIndex]?.role !== "user") {
    splitIndex -= 1;
  }

  if (splitIndex <= 0) {
    return { compactable: [], recent: messages };
  }

  return {
    compactable: messages.slice(0, splitIndex),
    recent: messages.slice(splitIndex),
  };
}

export async function createRollingSummary(
  previousSummary: string | null,
  messages: CompactableMessage[],
  signal?: AbortSignal
): Promise<string> {
  const batches: CompactableMessage[][] = [];
  let currentBatch: CompactableMessage[] = [];
  let currentBatchTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateTextTokens(message.content) + 6;
    if (
      currentBatch.length > 0 &&
      currentBatchTokens + messageTokens > SUMMARY_BATCH_TARGET_TOKENS
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchTokens = 0;
    }

    currentBatch.push(message);
    currentBatchTokens += messageTokens;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);

  let rollingSummary = previousSummary?.trim() || null;

  for (const batch of batches) {
    const prompt: OllamaMessage[] = buildRollingSummaryMessages(rollingSummary, batch);

    const raw = await ollamaChat(
      prompt,
      {
        temperature: 0.1,
        top_p: 0.9,
        repeat_penalty: 1.05,
        num_predict: 600,
      },
      signal,
      false
    );

    const nextSummary = raw.trim().slice(0, MAX_SUMMARY_CHARS);
    if (!nextSummary) {
      throw new Error("Conversation compaction returned an empty summary");
    }
    rollingSummary = nextSummary;
  }

  if (!rollingSummary) throw new Error("Conversation compaction had no messages to summarize");
  return rollingSummary;
}

export function serializeStoredSummary(summary: StoredContextSummary): string {
  return SUMMARY_RECORD_PREFIX + JSON.stringify(summary);
}

export function parseStoredSummary(content: string): StoredContextSummary | null {
  if (!content.startsWith(SUMMARY_RECORD_PREFIX)) return null;

  try {
    const parsed = JSON.parse(content.slice(SUMMARY_RECORD_PREFIX.length));
    if (
      parsed?.version !== 1 ||
      typeof parsed?.throughMessageId !== "string" ||
      typeof parsed?.summary !== "string" ||
      !parsed.summary.trim()
    ) {
      return null;
    }

    return {
      version: 1,
      throughMessageId: parsed.throughMessageId,
      summary: parsed.summary.trim(),
    };
  } catch {
    return null;
  }
}
