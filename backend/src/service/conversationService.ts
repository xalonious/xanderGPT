import { prisma } from "../data";
import ServiceError from "../core/ServiceError";
import { ollamaChat, ollamaChatStream, type OllamaMessage } from "./ollamaService";
import type { BraveWebResult } from "./braveSearchService";
import {
  planRequest,
  extractFirstUrl,
  hasStrongWebSearchCue,
} from "./toolRoutingService";
import { fetchAndExtractUrl } from "./urlFetchService";
import { evaluateExpression } from "./calculatorService";
import { retrieveWebEvidence } from "./webRetrievalService";
import { buildAssistantSystemMessage } from "../prompts/assistantPrompts";
import { buildRuntimeDateSystemMessage } from "../prompts/runtimePrompts";
import {
  buildCompactedHistorySystemMessage,
  buildConversationTitleMessages,
} from "../prompts/conversationPrompts";
import {
  buildCalculatorFailureSystemMessage,
  buildCalculatorResultSystemMessage,
  buildUrlContentMessages,
  buildUrlFailureSystemMessage,
} from "../prompts/toolPrompts";
import {
  createRollingSummary,
  parseStoredSummary,
  serializeStoredSummary,
  shouldCompactContext,
  splitMessagesForCompaction,
  type CompactableMessage,
  type StoredContextSummary,
} from "./contextCompactionService";
import {
  attachmentImages,
  attachmentLabel,
  attachmentMetadataSelect,
  MAX_TOTAL_ATTACHMENT_BYTES,
  prepareAttachments,
  type IncomingAttachment,
  type PreparedAttachment,
} from "./attachmentService";

const URL_TOOL_MAX_CHARS = 18_000;
const URL_TOOL_EXCERPT_CHARS = 280;

type WebSearchMode = "auto" | "force" | "off";
type ThinkingMode = "auto" | "force" | "off";

type CompactionEvent =
  | { status: "start" }
  | {
      status: "complete";
      summary: string;
      compactedMessageCount: number;
    };

type StreamResult = {
  assistantText: string;
  thinkingText: string;
  thinkingDurationMs: number | null;
  aborted: boolean;
};

type ToolEvent =
  | { type: "tool"; tool: "web_search"; query: string }
  | {
      type: "tool_result";
      tool: "web_search";
      query: string;
      queries: string[];
      results: BraveWebResult[];
    }
  | { type: "tool"; tool: "fetch_url"; url: string }
  | {
      type: "tool_result";
      tool: "fetch_url";
      url: string;
      finalUrl: string;
      title?: string;
      status: number;
      contentType?: string;
      excerpt?: string;
    }
  | { type: "tool"; tool: "calculator"; expression: string }
  | {
      type: "tool_result";
      tool: "calculator";
      expression: string;
      result: string;
      value?: number;
    };

function assertNonEmpty(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    throw (
      ServiceError.validationFailed?.("Message content is required") ??
      ServiceError.conflict("Message content is required")
    );
  }
  return trimmed;
}

function assertMessageInput(content: string, attachments: PreparedAttachment[]) {
  const trimmed = content.trim();
  if (!trimmed && attachments.length === 0) {
    throw ServiceError.validationFailed("Enter a message or attach an image");
  }
  return trimmed;
}

function toOllamaAttachmentMessage(
  role: "user" | "assistant",
  content: string,
  attachments: PreparedAttachment[]
): OllamaMessage {
  return {
    role,
    content: attachmentLabel(content, attachments),
    images: attachmentImages(attachments),
  };
}

async function ensureOwnership(userId: string, conversationId: string) {
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });

  if (!convo) throw ServiceError.notFound("Conversation not found");
  return convo;
}

async function preparePersistentHistory(
  conversationId: string,
  nextUserMessage: string,
  nextUserImageCount = 0,
  opts?: {
    signal?: AbortSignal;
    onCompaction?: (event: CompactionEvent) => void;
  }
): Promise<OllamaMessage[]> {
  const [convo, storedMessages] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { systemPrompt: true },
    }),
    prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        role: true,
        content: true,
        attachments: {
          select: {
            kind: true,
            name: true,
            mimeType: true,
            size: true,
            data: true,
            extractedText: true,
          },
        },
      },
    }),
  ]);

  let latestSummary: StoredContextSummary | null = null;

  for (const message of storedMessages) {
    if (message.role !== "system") continue;
    const parsedSummary = parseStoredSummary(message.content);
    if (parsedSummary) {
      latestSummary = parsedSummary;
    }
  }

  const dialogue = storedMessages
    .filter(
      (message): message is typeof message & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant"
    )
    .map((message) => {
      const attachments: PreparedAttachment[] = message.attachments
        .filter((attachment) => attachment.kind === "image")
        .map((attachment) => ({
          kind: "image",
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          data: Buffer.from(attachment.data),
          extractedText: null,
        }));

      const modelMessage = toOllamaAttachmentMessage(
        message.role,
        message.content,
        attachments
      );

      return {
        id: message.id,
        role: message.role as "user" | "assistant",
        content: modelMessage.content,
        images: modelMessage.images,
      };
    });

  let compactedMessageCount = 0;
  if (latestSummary) {
    const throughIndex = dialogue.findIndex(
      (message) => message.id === latestSummary?.throughMessageId
    );
    if (throughIndex >= 0) {
      compactedMessageCount = throughIndex + 1;
    } else {
      latestSummary = null;
    }
  }

  const uncompacted = dialogue.slice(compactedMessageCount);
  const systemMessage: OllamaMessage = buildAssistantSystemMessage(convo?.systemPrompt);

  const buildHistory = (
    summary: string | null,
    messages: CompactableMessage[]
  ): OllamaMessage[] => [
    systemMessage,
    buildRuntimeDateSystemMessage(),
    ...(summary ? [buildCompactedHistorySystemMessage(summary)] : []),
    ...messages,
  ];

  const currentHistory = buildHistory(latestSummary?.summary ?? null, uncompacted);
  if (!shouldCompactContext(currentHistory, nextUserMessage, nextUserImageCount)) {
    return currentHistory;
  }

  const { compactable, recent } = splitMessagesForCompaction(uncompacted);
  if (compactable.length === 0) return currentHistory;

  opts?.onCompaction?.({ status: "start" });
  const summary = await createRollingSummary(
    latestSummary?.summary ?? null,
    compactable,
    opts?.signal
  );

  if (opts?.signal?.aborted) {
    const error: any = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  const lastCompactedMessage = uncompacted[compactable.length - 1];
  await prisma.message.create({
    data: {
      conversationId,
      role: "system",
      content: serializeStoredSummary({
        version: 1,
        throughMessageId: lastCompactedMessage.id,
        summary,
      }),
    },
    select: { id: true },
  });

  compactedMessageCount += compactable.length;
  opts?.onCompaction?.({
    status: "complete",
    summary,
    compactedMessageCount,
  });

  return buildHistory(summary, recent);
}

async function prepareTemporaryHistory(
  history: CompactableMessage[],
  systemPrompt: string,
  nextUserMessage: string,
  nextUserImageCount: number,
  opts: {
    previousSummary?: string | null;
    compactedMessageCount?: number;
    signal?: AbortSignal;
    onCompaction?: (event: CompactionEvent) => void;
  }
): Promise<OllamaMessage[]> {
  const systemMessage: OllamaMessage = buildAssistantSystemMessage(systemPrompt);

  const buildHistory = (
    summary: string | null,
    messages: CompactableMessage[]
  ): OllamaMessage[] => [
    systemMessage,
    buildRuntimeDateSystemMessage(),
    ...(summary ? [buildCompactedHistorySystemMessage(summary)] : []),
    ...messages,
  ];

  const previousSummary = opts.previousSummary?.trim() || null;
  const currentHistory = buildHistory(previousSummary, history);
  if (!shouldCompactContext(currentHistory, nextUserMessage, nextUserImageCount)) {
    return currentHistory;
  }

  const { compactable, recent } = splitMessagesForCompaction(history);
  if (compactable.length === 0) return currentHistory;

  opts.onCompaction?.({ status: "start" });
  const summary = await createRollingSummary(previousSummary, compactable, opts.signal);
  const compactedMessageCount = (opts.compactedMessageCount ?? 0) + compactable.length;

  opts.onCompaction?.({
    status: "complete",
    summary,
    compactedMessageCount,
  });

  return buildHistory(summary, recent);
}

function looksUntitled(title: string | null) {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  return t === "new chat" || t === "chat";
}

function cleanTitle(raw: string) {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!:;,-]+$/g, "")
    .slice(0, 60);
}

async function maybeAutoTitleConversation(conversationId: string, firstUserMessage: string) {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { title: true },
  });

  if (!convo || !looksUntitled(convo.title)) return null;

  const userCount = await prisma.message.count({
    where: { conversationId, role: "user" },
  });

  if (userCount !== 1) return null;

  const titlePrompt: OllamaMessage[] = buildConversationTitleMessages(firstUserMessage);

  const raw = await ollamaChat(titlePrompt, {
    temperature: 0.2,
    num_predict: 24,
    top_p: 0.9,
    repeat_penalty: 1.05,
  });

  const title = cleanTitle(raw);
  if (!title) return null;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { title, updatedAt: new Date() },
    select: { id: true },
  });

  return title;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  return anyErr?.name === "AbortError" || anyErr?.code === "ABORT_ERR";
}

async function buildToolSystemBlocks(
  history: OllamaMessage[],
  trimmed: string,
  opts: {
    signal?: AbortSignal;
    webSearchMode?: WebSearchMode;
    thinkingMode?: ThinkingMode;
    onToolEvent?: (evt: ToolEvent) => void;
  }
): Promise<{ toolSystemBlocks: OllamaMessage[]; useThinking: boolean }> {
  const { signal, onToolEvent } = opts;
  const webSearchMode = opts.webSearchMode ?? "auto";
  const thinkingMode = opts.thinkingMode ?? "auto";

  let toolSystemBlocks: OllamaMessage[] = [];

  const firstUrl = extractFirstUrl(trimmed);
  const allowWeb = firstUrl ? webSearchMode === "force" : webSearchMode !== "off";
  const requireWeb =
    allowWeb &&
    (webSearchMode === "force" ||
      (webSearchMode !== "off" && hasStrongWebSearchCue(trimmed)));

  const plannerHistory = history.map(({ role, content }) => ({ role, content }));
  const plan = await planRequest(plannerHistory, trimmed, {
    allowWeb,
    requireWeb,
    allowCalculator: true,
    allowThinking: thinkingMode !== "off",
    requireThinking: thinkingMode === "force",
    signal,
  });

  if (firstUrl) {
    onToolEvent?.({ type: "tool", tool: "fetch_url", url: firstUrl });

    try {
      const page = await fetchAndExtractUrl(firstUrl, { signal });
      const clipped = page.text.slice(0, URL_TOOL_MAX_CHARS);

      onToolEvent?.({
        type: "tool_result",
        tool: "fetch_url",
        url: firstUrl,
        finalUrl: page.finalUrl,
        title: page.title,
        status: page.status,
        contentType: page.contentType,
        excerpt: clipped.slice(0, URL_TOOL_EXCERPT_CHARS).trim(),
      });

      toolSystemBlocks.push(
        ...buildUrlContentMessages({
          finalUrl: page.finalUrl,
          title: page.title,
          content: clipped,
        })
      );
    } catch (err: any) {
      const fetchUrlError = String(err?.message ?? "unknown error");

      onToolEvent?.({
        type: "tool_result",
        tool: "fetch_url",
        url: firstUrl,
        finalUrl: firstUrl,
        title: undefined,
        status: 0,
        contentType: undefined,
        excerpt: `Failed to fetch URL: ${fetchUrlError}`.slice(0, URL_TOOL_EXCERPT_CHARS),
      });

      toolSystemBlocks.push(buildUrlFailureSystemMessage());
    }
  }

  if (plan.useCalculator && plan.expression) {
    const expression = plan.expression;
    onToolEvent?.({ type: "tool", tool: "calculator", expression });

    try {
      const value = evaluateExpression(expression);
      const result = String(value);

      onToolEvent?.({
        type: "tool_result",
        tool: "calculator",
        expression,
        result,
        value,
      });

      toolSystemBlocks.push(buildCalculatorResultSystemMessage(expression, result));
    } catch (err: any) {
      const msg = String(err?.message ?? "calculator error");
      onToolEvent?.({
        type: "tool_result",
        tool: "calculator",
        expression,
        result: `Error: ${msg}`,
      });

      toolSystemBlocks.push(buildCalculatorFailureSystemMessage(expression, msg));
    }
  }

  if (plan.useWeb && plan.query) {
    const retrieval = await retrieveWebEvidence(trimmed, plan.query, {
      signal,
      onSearch: (query) => {
        onToolEvent?.({ type: "tool", tool: "web_search", query });
      },
    });

    onToolEvent?.({
      type: "tool_result",
      tool: "web_search",
      query: plan.query,
      queries: retrieval.queries,
      results: retrieval.sources,
    });

    toolSystemBlocks = [...toolSystemBlocks, ...retrieval.systemBlocks];
  }

  return { toolSystemBlocks, useThinking: plan.useThinking };
}

async function runStreamWithHistory(
  history: OllamaMessage[],
  content: string,
  opts: {
    onToken: (token: string) => void;
    onThinking?: (token: string) => void;
    signal?: AbortSignal;
    webSearchMode?: WebSearchMode;
    thinkingMode?: ThinkingMode;
    onToolEvent?: (evt: ToolEvent) => void;
    userImages?: string[];
  }
): Promise<StreamResult> {
  const trimmed = assertNonEmpty(content);

  if (opts.signal?.aborted) {
    return {
      assistantText: "",
      thinkingText: "",
      thinkingDurationMs: null,
      aborted: true,
    };
  }

  const { toolSystemBlocks, useThinking } = await buildToolSystemBlocks(history, trimmed, {
    signal: opts.signal,
    webSearchMode: opts.webSearchMode,
    thinkingMode: opts.thinkingMode,
    onToolEvent: opts.onToolEvent,
  });

  if (opts.signal?.aborted) {
    return {
      assistantText: "",
      thinkingText: "",
      thinkingDurationMs: null,
      aborted: true,
    };
  }

  const prompt: OllamaMessage[] = [
    ...history,
    ...toolSystemBlocks,
    { role: "user", content: trimmed, images: opts.userImages },
  ];

  let assistantText = "";
  let thinkingText = "";
  let thinkingStartedAt: number | null = null;
  let thinkingFinishedAt: number | null = null;
  const hasVisionInput = (opts.userImages?.length ?? 0) > 0;
  const visionTimeoutController = hasVisionInput ? new AbortController() : null;
  const visionTimeout = visionTimeoutController
    ? setTimeout(() => visionTimeoutController.abort(), 90_000)
    : null;
  const generationSignal = visionTimeoutController
    ? AbortSignal.any(
        [opts.signal, visionTimeoutController.signal].filter(
          (signal): signal is AbortSignal => Boolean(signal)
        )
      )
    : opts.signal;

  const getThinkingDurationMs = () => {
    if (thinkingStartedAt === null) return null;
    return Math.max(0, (thinkingFinishedAt ?? Date.now()) - thinkingStartedAt);
  };

  try {
    await ollamaChatStream(
      prompt,
      (token) => {
        if (thinkingStartedAt !== null && thinkingFinishedAt === null) {
          thinkingFinishedAt = Date.now();
        }
        assistantText += token;
        opts.onToken(token);
      },
      hasVisionInput
        ? {
            temperature: 0.5,
            top_p: 0.85,
            top_k: 20,
            num_ctx: 2048,
            num_predict: 1024,
          }
        : useThinking
          ? { temperature: 0.6, top_p: 0.95, top_k: 20 }
          : { temperature: 0.7, top_p: 0.8, top_k: 20 },
      generationSignal,
      (token) => {
        if (thinkingStartedAt === null) thinkingStartedAt = Date.now();
        thinkingText += token;
        opts.onThinking?.(token);
      },
      useThinking
    );
  } catch (err) {
    if (
      visionTimeoutController?.signal.aborted &&
      !opts.signal?.aborted
    ) {
      throw new Error(
        "Vision processing timed out. The local model does not have enough available resources."
      );
    }
    if (opts.signal?.aborted || isAbortError(err)) {
      return {
        assistantText,
        thinkingText,
        thinkingDurationMs: getThinkingDurationMs(),
        aborted: true,
      };
    }
    throw err;
  } finally {
    if (visionTimeout) clearTimeout(visionTimeout);
  }

  if (thinkingStartedAt !== null && thinkingFinishedAt === null) {
    thinkingFinishedAt = Date.now();
  }

  if (opts.signal?.aborted) {
    return {
      assistantText,
      thinkingText,
      thinkingDurationMs: getThinkingDurationMs(),
      aborted: true,
    };
  }

  return {
    assistantText,
    thinkingText,
    thinkingDurationMs: getThinkingDurationMs(),
    aborted: false,
  };
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, systemPrompt: true, createdAt: true, updatedAt: true },
  });
}

function createSearchSnippet(content: string, query: string): string {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const matchIndex = normalizedContent.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (matchIndex === -1) return normalizedContent.slice(0, 180);

  const start = Math.max(0, matchIndex - 70);
  const end = Math.min(normalizedContent.length, matchIndex + query.length + 110);
  return (
    (start > 0 ? "…" : "") +
    normalizedContent.slice(start, end) +
    (end < normalizedContent.length ? "…" : "")
  );
}

export async function searchConversations(userId: string, rawQuery: string) {
  const query = rawQuery.trim();
  if (!query) return [];

  const conversations = await prisma.conversation.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: query } },
        {
          messages: {
            some: {
              role: { in: ["user", "assistant"] },
              content: { contains: query },
            },
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      messages: {
        where: {
          role: { in: ["user", "assistant"] },
          content: { contains: query },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, content: true },
      },
    },
  });

  return conversations.map((conversation) => {
    const matchedMessage = conversation.messages[0];

    return {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      matchType: matchedMessage ? ("message" as const) : ("title" as const),
      messageId: matchedMessage?.id ?? null,
      snippet: matchedMessage ? createSearchSnippet(matchedMessage.content, query) : null,
    };
  });
}

export async function createConversation(userId: string, title?: string, systemPrompt?: string) {
  const prefs = (systemPrompt ?? "").trim();
  return prisma.conversation.create({
    data: {
      userId,
      title: title?.trim() || "New chat",
      systemPrompt: prefs.length ? prefs : null,
    },
    select: { id: true, title: true, systemPrompt: true, createdAt: true, updatedAt: true },
  });
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  data: { title?: string; systemPrompt?: string }
) {
  await ensureOwnership(userId, conversationId);

  const updateData: any = {};

  if (typeof data.title === "string") {
    const trimmed = data.title.trim();
    if (!trimmed) {
      throw (
        ServiceError.validationFailed?.("Title is required") ??
        ServiceError.conflict("Title is required")
      );
    }
    updateData.title = trimmed;
  }

  if (typeof data.systemPrompt === "string") {
    const trimmed = data.systemPrompt.trim();
    updateData.systemPrompt = trimmed.length ? trimmed : null;
  }

  if (Object.keys(updateData).length === 0) {
    throw (
      ServiceError.validationFailed?.("No valid fields to update") ??
      ServiceError.conflict("No valid fields to update")
    );
  }

  return prisma.conversation.update({
    where: { id: conversationId },
    data: updateData,
    select: { id: true, title: true, systemPrompt: true, createdAt: true, updatedAt: true },
  });
}

export async function renameConversation(userId: string, conversationId: string, title: string) {
  return updateConversation(userId, conversationId, { title });
}

export async function deleteConversation(userId: string, conversationId: string) {
  await ensureOwnership(userId, conversationId);
  await prisma.conversation.delete({ where: { id: conversationId } });
}

export async function getConversationMessages(userId: string, conversationId: string) {
  await ensureOwnership(userId, conversationId);

  return prisma.message.findMany({
    where: { conversationId, role: { in: ["user", "assistant"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      conversationId: true,
      role: true,
      content: true,
      thinking: true,
      thinkingDurationMs: true,
      sources: true,
      createdAt: true,
      attachments: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: attachmentMetadataSelect,
      },
    },
  });
}

export async function getMessageAttachment(
  userId: string,
  conversationId: string,
  attachmentId: string
) {
  await ensureOwnership(userId, conversationId);

  const attachment = await prisma.messageAttachment.findFirst({
    where: {
      id: attachmentId,
      message: { conversationId },
    },
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      data: true,
    },
  });

  if (!attachment) throw ServiceError.notFound("Attachment not found");
  return attachment;
}

export async function sendMessageNonStream(
  userId: string,
  conversationId: string,
  content: string,
  incomingAttachments: IncomingAttachment[] = []
) {
  await ensureOwnership(userId, conversationId);
  const attachments = prepareAttachments(incomingAttachments);
  const trimmed = assertMessageInput(content, attachments);
  const userPrompt = toOllamaAttachmentMessage("user", trimmed, attachments);

  const history = await preparePersistentHistory(
    conversationId,
    userPrompt.content,
    userPrompt.images?.length ?? 0
  );
  const assistantText = await ollamaChat([...history, userPrompt]);

  const now = new Date();
  const assistantMessage = await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId,
        role: "user",
        content: trimmed,
        attachments: {
          create: attachments.map((attachment) => ({
            kind: attachment.kind,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            data: Uint8Array.from(attachment.data),
            extractedText: attachment.extractedText,
          })),
        },
      },
      select: { id: true },
    });

    const assistant = await tx.message.create({
      data: { conversationId, role: "assistant", content: assistantText },
      select: {
        id: true,
        conversationId: true,
        role: true,
        content: true,
        thinking: true,
        thinkingDurationMs: true,
        sources: true,
        createdAt: true,
        attachments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: attachmentMetadataSelect,
        },
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
      select: { id: true },
    });

    return assistant;
  });

  await maybeAutoTitleConversation(conversationId, trimmed || attachments[0]?.name || "Image");

  return assistantMessage;
}

export async function sendMessageStream(
  userId: string,
  conversationId: string,
  content: string,
  onTokenOrOpts:
    | ((token: string) => void)
    | {
        onToken: (token: string) => void;
        onThinking?: (token: string) => void;
        signal?: AbortSignal;
        webSearchMode?: WebSearchMode;
        thinkingMode?: ThinkingMode;
        onToolEvent?: (evt: ToolEvent) => void;
        onCompaction?: (event: CompactionEvent) => void;
        attachments?: IncomingAttachment[];
      },
  maybeSignal?: AbortSignal
): Promise<{
  assistantMessage: any | null;
  titleUpdated: string | null;
  aborted: boolean;
}> {
  await ensureOwnership(userId, conversationId);
  const incomingAttachments =
    typeof onTokenOrOpts === "function" ? [] : onTokenOrOpts.attachments ?? [];
  const attachments = prepareAttachments(incomingAttachments);
  const trimmed = assertMessageInput(content, attachments);
  const userPrompt = toOllamaAttachmentMessage("user", trimmed, attachments);

  const onToken = typeof onTokenOrOpts === "function" ? onTokenOrOpts : onTokenOrOpts.onToken;
  const signal = typeof onTokenOrOpts === "function" ? maybeSignal : onTokenOrOpts.signal;

  const webSearchMode: WebSearchMode =
    typeof onTokenOrOpts === "function" ? "auto" : onTokenOrOpts.webSearchMode ?? "auto";

  const thinkingMode: ThinkingMode =
    typeof onTokenOrOpts === "function" ? "auto" : onTokenOrOpts.thinkingMode ?? "auto";

  const onThinking = typeof onTokenOrOpts === "function" ? undefined : onTokenOrOpts.onThinking;

  const onToolEvent = typeof onTokenOrOpts === "function" ? undefined : onTokenOrOpts.onToolEvent;
  const onCompaction =
    typeof onTokenOrOpts === "function" ? undefined : onTokenOrOpts.onCompaction;
  let webSources: BraveWebResult[] = [];

  const handleToolEvent = (evt: ToolEvent) => {
    if (evt.type === "tool_result" && evt.tool === "web_search") {
      webSources = evt.results;
    }
    onToolEvent?.(evt);
  };

  if (signal?.aborted) {
    return { assistantMessage: null, titleUpdated: null, aborted: true };
  }

  const history = await preparePersistentHistory(
    conversationId,
    userPrompt.content,
    userPrompt.images?.length ?? 0,
    {
      signal,
      onCompaction,
    }
  );

  const streamResult = await runStreamWithHistory(history, userPrompt.content, {
    onToken,
    onThinking,
    signal,
    webSearchMode,
    thinkingMode,
    onToolEvent: handleToolEvent,
    userImages: userPrompt.images,
  });

  if (streamResult.aborted) {
    return { assistantMessage: null, titleUpdated: null, aborted: true };
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const userMsg = await tx.message.create({
      data: {
        conversationId,
        role: "user",
        content: trimmed,
        attachments: {
          create: attachments.map((attachment) => ({
            kind: attachment.kind,
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
            data: Uint8Array.from(attachment.data),
            extractedText: attachment.extractedText,
          })),
        },
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        attachments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: attachmentMetadataSelect,
        },
      },
    });

    const assistantMsg = await tx.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: streamResult.assistantText,
        thinking: streamResult.thinkingText || null,
        thinkingDurationMs: streamResult.thinkingDurationMs,
        sources: webSources.length > 0 ? webSources : undefined,
      },
      select: {
        id: true,
        conversationId: true,
        role: true,
        content: true,
        thinking: true,
        thinkingDurationMs: true,
        sources: true,
        createdAt: true,
        attachments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: attachmentMetadataSelect,
        },
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
      select: { id: true },
    });

    return { userMsg, assistantMsg };
  });

  const titleUpdated = await maybeAutoTitleConversation(
    conversationId,
    trimmed || attachments[0]?.name || "Image"
  );

  return { assistantMessage: result.assistantMsg, titleUpdated, aborted: false };
}

export async function sendTemporaryMessageStream(
  content: string,
  history: Array<{
    role: "user" | "assistant";
    content: string;
    attachments?: IncomingAttachment[];
  }>,
  systemPrompt: string,
  opts: {
    onToken: (token: string) => void;
    onThinking?: (token: string) => void;
    signal?: AbortSignal;
    webSearchMode?: WebSearchMode;
    thinkingMode?: ThinkingMode;
    onToolEvent?: (evt: ToolEvent) => void;
    previousSummary?: string | null;
    compactedMessageCount?: number;
    onCompaction?: (event: CompactionEvent) => void;
    attachments?: IncomingAttachment[];
  }
): Promise<StreamResult> {
  let attachmentBytes = 0;

  const validHistory = history
    .filter(
      (
        m
      ): m is {
        role: "user" | "assistant";
        content: string;
        attachments?: IncomingAttachment[];
      } =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    )
    .map((message) => {
      const prepared = prepareAttachments(
        message.attachments,
        Math.max(0, MAX_TOTAL_ATTACHMENT_BYTES - attachmentBytes)
      );
      attachmentBytes += prepared.reduce((sum, attachment) => sum + attachment.size, 0);
      const modelMessage = toOllamaAttachmentMessage(message.role, message.content, prepared);
      return {
        role: message.role,
        content: modelMessage.content,
        images: modelMessage.images,
      };
    });

  const attachments = prepareAttachments(
    opts.attachments,
    Math.max(0, MAX_TOTAL_ATTACHMENT_BYTES - attachmentBytes)
  );
  const trimmed = assertMessageInput(content, attachments);
  const userPrompt = toOllamaAttachmentMessage("user", trimmed, attachments);

  const composedHistory = await prepareTemporaryHistory(
    validHistory,
    systemPrompt,
    userPrompt.content,
    userPrompt.images?.length ?? 0,
    {
      previousSummary: opts.previousSummary,
      compactedMessageCount: opts.compactedMessageCount,
      signal: opts.signal,
      onCompaction: opts.onCompaction,
    }
  );

  return runStreamWithHistory(composedHistory, userPrompt.content, {
    onToken: opts.onToken,
    onThinking: opts.onThinking,
    signal: opts.signal,
    webSearchMode: opts.webSearchMode,
    thinkingMode: opts.thinkingMode,
    onToolEvent: opts.onToolEvent,
    userImages: userPrompt.images,
  });
}
