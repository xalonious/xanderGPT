type ChatRole = "system" | "user" | "assistant";
export type OllamaMessage = { role: ChatRole; content: string };

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "xandergpt";

const DEFAULT_OPTIONS = {
  temperature: 0.6,
  top_p: 0.9,
  repeat_penalty: 1.1,
  num_predict: 384,
};

type OllamaOptions = Partial<typeof DEFAULT_OPTIONS> & Record<string, any>;

function buildBody(messages: OllamaMessage[], stream: boolean, optionsOverride?: OllamaOptions) {
  return {
    model: OLLAMA_MODEL,
    messages,
    stream,
    options: { ...DEFAULT_OPTIONS, ...(optionsOverride ?? {}) },
  };
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  return anyErr?.name === "AbortError" || anyErr?.code === "ABORT_ERR";
}

export async function ollamaChat(
  messages: OllamaMessage[],
  optionsOverride?: OllamaOptions,
  signal?: AbortSignal
): Promise<string> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBody(messages, false, optionsOverride)),
    signal,
  });

  if (!r.ok) {
    const details = await r.text();
    throw new Error(`Ollama error: ${details}`);
  }

  const data = await r.json();
  return data?.message?.content ?? "";
}

export async function ollamaChatStream(
  messages: OllamaMessage[],
  onToken: (token: string) => void,
  optionsOverride?: OllamaOptions,
  signal?: AbortSignal
): Promise<string> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(messages, true, optionsOverride)),
      signal,
    });

    if (!r.ok || !r.body) {
      const details = await r.text().catch(() => "");
      throw new Error(`Ollama stream error: ${details}`);
    }

    reader = r.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let full = "";

    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
        }
        const e: any = new Error("Aborted");
        e.name = "AbortError";
        throw e;
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let chunk: any;
        try {
          chunk = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const token = chunk?.message?.content ?? "";
        if (token) {
          full += token;
          onToken(token);
        }

        if (chunk?.done) {
          return full;
        }
      }
    }

    return full;
  } catch (err) {
    if (signal?.aborted || isAbortError(err)) {
      const e: any = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }
    throw err;
  } finally {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
      }
    }
  }
}