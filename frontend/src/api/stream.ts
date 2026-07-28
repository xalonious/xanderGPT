export type CompactionEvent =
  | { type: "compaction"; status: "start" }
  | {
      type: "compaction";
      status: "complete";
      summary?: string;
      compactedMessageCount?: number;
    };

type StreamEvent =
  | CompactionEvent
  | { type: "thinking"; token: string }
  | { type: "token"; token: string }
  | { type: "title"; title: string }
  | { type: "tool"; tool: "web_search"; query: string }
  | { type: "tool"; tool: "calculator"; expression: string }
  | {
      type: "tool_result";
      tool: "web_search";
      query: string;
      queries: string[];
      results: Array<{ title: string; url: string; description: string }>;
    }
  | {
      type: "tool_result";
      tool: "calculator";
      expression: string;
      result: string;
      value?: number;
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
  | { type: "done"; thinkingDurationMs?: number | null }
  | { type: "error"; message: string };

function getApiUrl() {
  const base = import.meta.env.VITE_API_URL;
  if (!base) throw new Error("VITE_API_URL is not set");
  return base;
}

async function* ndjsonStream(res: Response): AsyncGenerator<StreamEvent> {
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) break;

      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);

      if (!line) continue;

      let evt: StreamEvent;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }

      yield evt;
    }
  }

  const tail = buffer.trim();
  if (tail) {
    try {
      yield JSON.parse(tail);
    } catch {
    }
  }
}

function streamErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/model runner has unexpectedly stopped|resource limitations/i.test(raw)) {
    return "The local model ran out of resources while processing this request.";
  }
  return raw || "The response stream failed.";
}

export async function sendMessageStream(opts: {
  conversationId: string;
  content: string;
  attachments?: Array<{
    kind: "image";
    name: string;
    mimeType: string;
    size: number;
    data: string;
  }>;
  webSearch?: "auto" | "force" | "off";
  thinking?: "auto" | "force" | "off";
  signal?: AbortSignal;

  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  onCompaction?: (event: CompactionEvent) => void;
  onDone?: (thinkingDurationMs: number | null) => void;
  onTitle?: (title: string) => void;

  onTool?: (evt: Extract<StreamEvent, { type: "tool" | "tool_result" }>) => void;
}) {
  const {
    conversationId,
    content,
    attachments = [],
    webSearch = "auto",
    thinking = "auto",
    signal,
    onToken,
    onThinking,
    onCompaction,
    onDone,
    onTitle,
    onTool,
  } = opts;

  const res = await fetch(`${getApiUrl()}/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify({ content, attachments, webSearch, thinking }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(streamErrorMessage(text || `Request failed (${res.status})`));
  }

  for await (const evt of ndjsonStream(res)) {
    if (evt.type === "thinking") {
      onThinking?.(evt.token);
    } else if (evt.type === "compaction") {
      onCompaction?.(evt);
    } else if (evt.type === "token") {
      onToken(evt.token);
    } else if (evt.type === "title") {
      onTitle?.(evt.title);
    } else if (evt.type === "tool" || evt.type === "tool_result") {
      onTool?.(evt);
    } else if (evt.type === "error") {
      throw new Error(streamErrorMessage(evt.message));
    } else if (evt.type === "done") {
      onDone?.(evt.thinkingDurationMs ?? null);
      return;
    }
  }

  throw new Error("The response stream ended before completion.");
}

export async function sendTemporaryMessageStream(opts: {
  content: string;
  attachments?: Array<{
    kind: "image";
    name: string;
    mimeType: string;
    size: number;
    data: string;
  }>;
  history: Array<{
    role: "user" | "assistant";
    content: string;
    attachments?: Array<{
      kind: "image";
      name: string;
      mimeType: string;
      size: number;
      data: string;
    }>;
  }>;
  systemPrompt?: string;
  contextSummary?: string | null;
  compactedMessageCount?: number;
  webSearch?: "auto" | "force" | "off";
  thinking?: "auto" | "force" | "off";
  signal?: AbortSignal;

  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  onCompaction?: (event: CompactionEvent) => void;
  onDone?: (thinkingDurationMs: number | null) => void;
  onTool?: (evt: Extract<StreamEvent, { type: "tool" | "tool_result" }>) => void;
}) {
  const {
    content,
    attachments = [],
    history,
    systemPrompt = "",
    contextSummary = null,
    compactedMessageCount = 0,
    webSearch = "auto",
    thinking = "auto",
    signal,
    onToken,
    onThinking,
    onCompaction,
    onDone,
    onTool,
  } = opts;

  const res = await fetch(`${getApiUrl()}/conversations/temp/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify({
      content,
      attachments,
      history,
      systemPrompt,
      contextSummary,
      compactedMessageCount,
      webSearch,
      thinking,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(streamErrorMessage(text || `Request failed (${res.status})`));
  }

  for await (const evt of ndjsonStream(res)) {
    if (evt.type === "thinking") {
      onThinking?.(evt.token);
    } else if (evt.type === "compaction") {
      onCompaction?.(evt);
    } else if (evt.type === "token") {
      onToken(evt.token);
    } else if (evt.type === "tool" || evt.type === "tool_result") {
      onTool?.(evt);
    } else if (evt.type === "error") {
      throw new Error(streamErrorMessage(evt.message));
    } else if (evt.type === "done") {
      onDone?.(evt.thinkingDurationMs ?? null);
      return;
    }
  }

  throw new Error("The response stream ended before completion.");
}
