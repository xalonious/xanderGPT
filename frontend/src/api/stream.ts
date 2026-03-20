type StreamEvent =
  | { type: "token"; token: string }
  | { type: "title"; title: string }
  | { type: "tool"; tool: "web_search"; query: string }
  | { type: "tool"; tool: "calculator"; expression: string }
  | {
      type: "tool_result";
      tool: "web_search";
      query: string;
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
  | { type: "done" }
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

export async function sendMessageStream(opts: {
  conversationId: string;
  content: string;
  webSearch?: "auto" | "force" | "off";
  signal?: AbortSignal;

  onToken: (token: string) => void;
  onTitle?: (title: string) => void;

  onTool?: (evt: Extract<StreamEvent, { type: "tool" | "tool_result" }>) => void;
}) {
  const { conversationId, content, webSearch = "auto", signal, onToken, onTitle, onTool } = opts;

  const res = await fetch(`${getApiUrl()}/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify({ content, webSearch }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }

  for await (const evt of ndjsonStream(res)) {
    if (evt.type === "token") {
      onToken(evt.token);
    } else if (evt.type === "title") {
      onTitle?.(evt.title);
    } else if (evt.type === "tool" || evt.type === "tool_result") {
      onTool?.(evt);
    } else if (evt.type === "error") {
      throw new Error(evt.message || "Stream error");
    } else if (evt.type === "done") {
      return;
    }
  }
}

export async function sendTemporaryMessageStream(opts: {
  content: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  systemPrompt?: string;
  webSearch?: "auto" | "force" | "off";
  signal?: AbortSignal;

  onToken: (token: string) => void;
  onTool?: (evt: Extract<StreamEvent, { type: "tool" | "tool_result" }>) => void;
}) {
  const {
    content,
    history,
    systemPrompt = "",
    webSearch = "auto",
    signal,
    onToken,
    onTool,
  } = opts;

  const res = await fetch(`${getApiUrl()}/conversations/temp/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify({
      content,
      history,
      systemPrompt,
      webSearch,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }

  for await (const evt of ndjsonStream(res)) {
    if (evt.type === "token") {
      onToken(evt.token);
    } else if (evt.type === "tool" || evt.type === "tool_result") {
      onTool?.(evt);
    } else if (evt.type === "error") {
      throw new Error(evt.message || "Stream error");
    } else if (evt.type === "done") {
      return;
    }
  }
}