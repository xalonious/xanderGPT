import { ollamaChat, type OllamaMessage } from "./ollamaService";
import {
  buildMoreWebResultsMessages,
  buildRequestPlannerMessages,
} from "../prompts/routingPrompts";

export type RequestPlan = {
  useWeb: boolean;
  query: string | null;
  useCalculator: boolean;
  expression: string | null;
  useThinking: boolean;
  reason: string;
};

export type MoreResultsDecision =
  | {
      needMore: false;
      query: null;
      moreCount: 0;
      candidateIndexes: number[];
      reason: string;
    }
  | {
      needMore: true;
      query: string;
      moreCount: number;
      candidateIndexes: number[];
      reason: string;
    };

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/\bhttps?:\/\/[^\s<>()"']+/i);
  return match ? match[0] : null;
}

function extractJsonObject(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampInt(n: unknown, min: number, max: number): number {
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sanitizeCandidateIndexes(
  values: unknown,
  resultCount: number,
  maxCandidates: number
): number[] {
  const fallback = Array.from(
    { length: Math.min(resultCount, maxCandidates) },
    (_, index) => index + 1
  );

  if (!Array.isArray(values)) return fallback;

  const indexes = Array.from(
    new Set(
      values
        .map((value: unknown) => Number(value))
        .filter(
          (value: number) =>
            Number.isInteger(value) && value >= 1 && value <= resultCount
        )
    )
  ).slice(0, maxCandidates) as number[];

  return indexes.length > 0 ? indexes : fallback;
}

function cleanSearchQuery(value: unknown, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/"/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return cleaned || fallback.replace(/\s+/g, " ").trim().slice(0, 180);
}

const EXPLICIT_SEARCH_PATTERN =
  /\b(search(?: for)?|look(?: it)? up|browse(?: the web)?|check online|verify online|google)\b/i;

const FRESHNESS_PATTERN =
  /\b(current|latest|newest|most recent|up-to-date|today|tonight|right now|as of (?:today|now|\d{4}))\b/i;

const LOCAL_CONTEXT_PATTERN =
  /\b(current|latest|existing)\s+(code|implementation|function|component|file|branch|input|message|prompt|conversation|selection|state|value|page)\b/i;

const CHANGING_FACT_PATTERN =
  /\b(weather|forecast|live score|stock price|exchange rate|standings|polling|election results|breaking news|most popular|popularity ranking|currently popular)\b/i;

export function hasStrongWebSearchCue(userText: string): boolean {
  const text = userText.replace(/\s+/g, " ").trim();
  if (!text) return false;

  if (EXPLICIT_SEARCH_PATTERN.test(text) || CHANGING_FACT_PATTERN.test(text)) {
    return true;
  }

  if (!FRESHNESS_PATTERN.test(text)) return false;
  return !LOCAL_CONTEXT_PATTERN.test(text);
}

function fallbackSearchQuery(recentHistory: OllamaMessage[], userText: string): string {
  const previousUserMessage = [...recentHistory]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());

  if (!previousUserMessage) return cleanSearchQuery(userText, userText);

  const contextualFallback = `${previousUserMessage.content.slice(-100)} ${userText.slice(0, 80)}`;
  return cleanSearchQuery(contextualFallback, userText);
}

export async function planRequest(
  recentHistory: OllamaMessage[],
  userText: string,
  opts: {
    allowWeb: boolean;
    requireWeb: boolean;
    allowCalculator: boolean;
    allowThinking: boolean;
    requireThinking: boolean;
    signal?: AbortSignal;
  }
): Promise<RequestPlan> {
  const fallbackQuery = fallbackSearchQuery(recentHistory, userText);
  const prompt: OllamaMessage[] = buildRequestPlannerMessages({
    recentHistory,
    userText,
    allowWeb: opts.allowWeb,
    requireWeb: opts.requireWeb,
    allowCalculator: opts.allowCalculator,
    allowThinking: opts.allowThinking,
    requireThinking: opts.requireThinking,
  });

  const raw = await ollamaChat(
    prompt,
    {
      temperature: 0,
      top_p: 0.9,
      repeat_penalty: 1.05,
      num_predict: 220
    },
    opts.signal
  );

  const parsed = extractJsonObject(raw);

  if (!parsed) {
    return {
      useWeb: opts.allowWeb && opts.requireWeb,
      query: opts.allowWeb && opts.requireWeb ? fallbackQuery : null,
      useCalculator: false,
      expression: null,
      useThinking: opts.allowThinking && opts.requireThinking,
      reason: "Planner JSON parse failed",
    };
  }

  const reason = String(parsed.reason ?? "").trim() || "No reason provided";

  const useWeb = opts.allowWeb && (opts.requireWeb || parsed.use_web === true);
  const rawExpression = String(parsed.expression ?? "").trim();
  const useCalculator =
    opts.allowCalculator && parsed.use_calculator === true && rawExpression.length > 0;

  return {
    useWeb,
    query: useWeb ? cleanSearchQuery(parsed.query, fallbackQuery) : null,
    useCalculator,
    expression: useCalculator ? rawExpression.slice(0, 240) : null,
    useThinking:
      opts.allowThinking && (opts.requireThinking || parsed.use_thinking === true),
    reason,
  };
}

export async function decideMoreWebResults(
  userText: string,
  currentQuery: string,
  results: Array<{ title: string; url: string; description: string }>,
  opts?: {
    maxAdditional?: number;
    maxCandidates?: number;
    signal?: AbortSignal;
  }
): Promise<MoreResultsDecision> {
  const maxAdditional = clampInt(opts?.maxAdditional ?? 7, 0, 10);
  const maxCandidates = clampInt(opts?.maxCandidates ?? 2, 1, 3);

  const compact = results.slice(0, 10).map((result, index) => ({
    index: index + 1,
    title: result.title,
    url: result.url,
    description: result.description
  }));

  const prompt: OllamaMessage[] = buildMoreWebResultsMessages({
    userText,
    currentQuery,
    results,
    maxAdditional,
    maxCandidates,
  });

  const raw = await ollamaChat(
    prompt,
    {
      temperature: 0,
      top_p: 0.9,
      repeat_penalty: 1.05,
      num_predict: 180
    },
    opts?.signal
  );

  const parsed = extractJsonObject(raw);
  const candidateIndexes = sanitizeCandidateIndexes(
    parsed?.candidate_indexes,
    compact.length,
    maxCandidates
  );

  if (!parsed || typeof parsed.need_more !== "boolean") {
    return {
      needMore: false,
      query: null,
      moreCount: 0,
      candidateIndexes,
      reason: "More-results JSON parse failed"
    };
  }

  const reason = String(parsed.reason ?? "").trim() || "No reason provided";

  if (parsed.need_more && maxAdditional > 0) {
    return {
      needMore: true,
      query: cleanSearchQuery(parsed.query, currentQuery),
      moreCount: clampInt(parsed.more_count, 1, maxAdditional),
      candidateIndexes,
      reason
    };
  }

  return {
    needMore: false,
    query: null,
    moreCount: 0,
    candidateIndexes,
    reason
  };
}
