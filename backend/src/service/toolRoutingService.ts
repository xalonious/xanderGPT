import { ollamaChat, type OllamaMessage } from "./ollamaService";

export type WebSearchDecision =
  | { useWeb: false; query: null; reason: string }
  | { useWeb: true; query: string; reason: string };

export type MoreResultsDecision =
  | { needMore: false; moreCount: 0; reason: string }
  | { needMore: true; moreCount: number; reason: string };

export function extractFirstUrl(text: string): string | null {
  const m = text.match(/\bhttps?:\/\/[^\s<>()"']+/i);
  return m ? m[0] : null;
}

function extractJsonObject(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function clampInt(n: unknown, min: number, max: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

export async function decideWebSearch(
  recentHistory: OllamaMessage[],
  userText: string,
  signal?: AbortSignal
): Promise<WebSearchDecision> {
  const prompt: OllamaMessage[] = [
    {
      role: "system",
      content: `You are a routing component that decides if a web search is required.

Use web search when:
- The user asks for up-to-date info (news, prices, availability, schedules, current events)
- The user asks you to look up / verify / search
- The question is niche and likely needs a source

Do NOT use web search when:
- The user wants brainstorming, writing, opinions, general explanations, or code help that doesn't require up-to-date facts

Return ONLY valid JSON exactly matching this schema:
{
  "use_web": true|false,
  "query": string|null,
  "reason": string
}

Rules:
- If use_web is true, query must be 3–12 words and NOT include quotes.
- If use_web is false, query must be null.`
    },
    ...recentHistory.slice(-6),
    { role: "user", content: userText }
  ];

  const raw = await ollamaChat(
    prompt,
    {
      temperature: 0,
      top_p: 0.9,
      repeat_penalty: 1.05,
      num_predict: 180
    },
    signal
  );

  const parsed = extractJsonObject(raw);

  if (!parsed || typeof parsed.use_web !== "boolean") {
    return { useWeb: false, query: null, reason: "Router JSON parse failed" };
  }

  const reason = String(parsed.reason ?? "").trim() || "No reason provided";

  if (parsed.use_web) {
    const q = String(parsed.query ?? "").trim();
    return {
      useWeb: true,
      query: q || userText.slice(0, 120),
      reason
    };
  }

  return { useWeb: false, query: null, reason };
}

export async function decideMoreWebResults(
  userText: string,
  firstBatch: Array<{ title: string; url: string; description: string }>,
  opts?: {
    maxAdditional?: number;
    signal?: AbortSignal;
  }
): Promise<MoreResultsDecision> {
  const maxAdditional = clampInt(opts?.maxAdditional ?? 7, 0, 10);

  const compact = firstBatch.slice(0, 6).map((r, i) => ({
    n: i + 1,
    title: r.title,
    url: r.url,
    description: r.description
  }));

  const prompt: OllamaMessage[] = [
    {
      role: "system",
      content: `You decide whether the current web search results are sufficient.

Return ONLY valid JSON in this exact schema:
{
  "need_more": true|false,
  "more_count": number,
  "reason": string
}

Rules:
- If need_more is false: more_count must be 0.
- If need_more is true: more_count must be an integer between 1 and ${maxAdditional}.
- Prefer need_more=false when the answer is already clear from the results.
- Only request more results if the current set is missing critical details, conflicting, or too thin.`
    },
    {
      role: "user",
      content:
        `User question:\n${userText}\n\n` +
        `Current web results (snippets):\n${JSON.stringify(compact, null, 2)}\n\n` +
        `Do we need more results to answer confidently?`
    }
  ];

  const raw = await ollamaChat(
    prompt,
    {
      temperature: 0,
      top_p: 0.9,
      repeat_penalty: 1.05,
      num_predict: 140
    },
    opts?.signal
  );

  const parsed = extractJsonObject(raw);

  if (!parsed || typeof parsed.need_more !== "boolean") {
    return { needMore: false, moreCount: 0, reason: "More-results JSON parse failed" };
  }

  const reason = String(parsed.reason ?? "").trim() || "No reason provided";

  if (parsed.need_more) {
    const moreCount = clampInt(parsed.more_count, 1, maxAdditional);
    return { needMore: true, moreCount, reason };
  }

  return { needMore: false, moreCount: 0, reason };
}