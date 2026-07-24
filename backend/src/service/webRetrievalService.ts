import {
  braveWebSearch,
  type BraveWebResult,
} from "./braveSearchService";
import { decideMoreWebResults } from "./toolRoutingService";
import { fetchAndExtractUrl, type FetchUrlResult } from "./urlFetchService";
import type { OllamaMessage } from "./ollamaService";
import { buildWebGroundingMessages } from "../prompts/webPrompts";

const SEARCH_INITIAL_RESULTS = 5;
const SEARCH_MAX_RESULTS = 10;
const SEARCH_MAX_ROUNDS = 3;
const MAX_FETCH_CANDIDATES = 2;
const MAX_FETCH_ATTEMPTS = 3;
const MAX_EVIDENCE_SOURCES = 2;

const PAGE_TEXT_LIMIT = 20_000;
const PASSAGE_TARGET_CHARS = 900;
const PASSAGES_PER_PAGE = 2;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "before",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "other",
  "should",
  "some",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
]);

type EvidenceItem = {
  source: BraveWebResult;
  kind: "page" | "snippet";
  passages: string[];
};

export type WebRetrievalResult = {
  queries: string[];
  sources: BraveWebResult[];
  systemBlocks: OllamaMessage[];
};

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, "").toLowerCase();
  }
}

function mergeUniqueResults(
  current: BraveWebResult[],
  incoming: BraveWebResult[]
): BraveWebResult[] {
  const seen = new Set(current.map((result) => canonicalUrl(result.url)));
  const merged = [...current];

  for (const result of incoming) {
    const key = canonicalUrl(result.url);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(result);
  }

  return merged;
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9.+#-]{2,}/g) ?? [];
  return Array.from(new Set(words.filter((word) => !STOP_WORDS.has(word))));
}

function splitIntoPassages(text: string): string[] {
  const normalized = text
    .slice(0, PAGE_TEXT_LIMIT)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean);
  const units = paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= PASSAGE_TARGET_CHARS) return [paragraph];
    return paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
  });

  const passages: string[] = [];
  let current = "";

  for (const rawUnit of units) {
    const unit = rawUnit.replace(/\s+/g, " ").trim();
    if (!unit) continue;

    if (unit.length > PASSAGE_TARGET_CHARS) {
      if (current) {
        passages.push(current);
        current = "";
      }
      for (let start = 0; start < unit.length; start += PASSAGE_TARGET_CHARS) {
        passages.push(unit.slice(start, start + PASSAGE_TARGET_CHARS).trim());
      }
      continue;
    }

    const combined = current ? `${current} ${unit}` : unit;
    if (combined.length > PASSAGE_TARGET_CHARS && current) {
      passages.push(current);
      current = unit;
    } else {
      current = combined;
    }
  }

  if (current) passages.push(current);
  return passages;
}

function selectRelevantPassages(
  pageText: string,
  question: string,
  queries: string[],
  source: BraveWebResult
): string[] {
  const passages = splitIntoPassages(pageText);
  if (passages.length <= PASSAGES_PER_PAGE) return passages;

  const keywords = extractKeywords(
    `${question} ${queries.join(" ")} ${source.title} ${source.description}`
  );

  const scored = passages.map((passage, index) => {
    const lower = passage.toLowerCase();
    const score = keywords.reduce((total, keyword) => {
      const occurrences = lower.split(keyword).length - 1;
      return total + Math.min(occurrences, 3);
    }, 0);

    return { passage, index, score };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = scored.slice(0, PASSAGES_PER_PAGE);

  if (selected.every((item) => item.score === 0)) {
    return passages.slice(0, Math.min(2, passages.length));
  }

  return selected.sort((a, b) => a.index - b.index).map((item) => item.passage);
}

async function fetchCandidate(
  result: BraveWebResult,
  signal?: AbortSignal
): Promise<{ result: BraveWebResult; page: FetchUrlResult } | null> {
  try {
    const page = await fetchAndExtractUrl(result.url, { signal });
    return { result, page };
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

export async function retrieveWebEvidence(
  question: string,
  initialQuery: string,
  opts?: {
    signal?: AbortSignal;
    onSearch?: (query: string) => void;
  }
): Promise<WebRetrievalResult> {
  let results: BraveWebResult[] = [];
  let currentQuery = initialQuery;
  let requestedCount = SEARCH_INITIAL_RESULTS;
  let hadSearchFailure = false;
  let selectedIndexes: number[] = [];

  const queries: string[] = [];
  const offsets = new Map<string, number>();

  for (let round = 0; round < SEARCH_MAX_ROUNDS; round++) {
    if (results.length >= SEARCH_MAX_RESULTS) break;

    const queryKey = normalizeQuery(currentQuery);
    const offset = offsets.get(queryKey) ?? 0;
    const count = Math.min(requestedCount, SEARCH_MAX_RESULTS - results.length);

    if (!queries.some((query) => normalizeQuery(query) === queryKey)) {
      queries.push(currentQuery);
    }

    opts?.onSearch?.(currentQuery);

    let batch: BraveWebResult[];
    try {
      batch = await braveWebSearch(currentQuery, {
        count,
        offset,
        signal: opts?.signal
      });
    } catch (error) {
      if (opts?.signal?.aborted) throw error;
      hadSearchFailure = true;
      break;
    }

    offsets.set(queryKey, offset + count);
    const previousLength = results.length;
    results = mergeUniqueResults(results, batch).slice(0, SEARCH_MAX_RESULTS);

    if (results.length === 0) break;

    const remaining = SEARCH_MAX_RESULTS - results.length;
    let decision;
    try {
      decision = await decideMoreWebResults(question, currentQuery, results, {
        maxAdditional: Math.min(remaining, 10),
        maxCandidates: MAX_FETCH_CANDIDATES,
        signal: opts?.signal
      });
    } catch (error) {
      if (opts?.signal?.aborted) throw error;
      break;
    }

    selectedIndexes = decision.candidateIndexes;

    if (
      !decision.needMore ||
      remaining === 0 ||
      batch.length === 0 ||
      round === SEARCH_MAX_ROUNDS - 1
    ) {
      break;
    }

    const nextQueryKey = normalizeQuery(decision.query);
    if (results.length === previousLength && nextQueryKey === queryKey) break;

    currentQuery = decision.query;
    requestedCount = Math.min(decision.moreCount, remaining);
  }

  if (results.length === 0) {
    return {
      queries,
      sources: [],
      systemBlocks: buildWebGroundingMessages([], hadSearchFailure)
    };
  }

  if (selectedIndexes.length === 0) {
    selectedIndexes = results.slice(0, MAX_FETCH_CANDIDATES).map((_, index) => index + 1);
  }

  const preferred = selectedIndexes
    .map((index) => results[index - 1])
    .filter((result): result is BraveWebResult => Boolean(result));

  const preferredUrls = new Set(preferred.map((result) => canonicalUrl(result.url)));
  const fallbacks = results.filter((result) => !preferredUrls.has(canonicalUrl(result.url)));

  const fetched: Array<{ result: BraveWebResult; page: FetchUrlResult }> = [];
  const attempted = new Set<string>();

  const fetchBatch = async (candidates: BraveWebResult[]) => {
    const available = candidates.filter((candidate) => {
      const key = canonicalUrl(candidate.url);
      if (attempted.has(key) || attempted.size >= MAX_FETCH_ATTEMPTS) return false;
      attempted.add(key);
      return true;
    });

    const outcomes = await Promise.all(
      available.map((candidate) => fetchCandidate(candidate, opts?.signal))
    );

    for (const outcome of outcomes) {
      if (outcome) fetched.push(outcome);
      if (fetched.length >= MAX_EVIDENCE_SOURCES) break;
    }
  };

  await fetchBatch(preferred);

  if (fetched.length < MAX_EVIDENCE_SOURCES && attempted.size < MAX_FETCH_ATTEMPTS) {
    await fetchBatch(fallbacks.slice(0, 1));
  }

  const evidenceItems: EvidenceItem[] = fetched
    .slice(0, MAX_EVIDENCE_SOURCES)
    .map(({ result, page }) => ({
      source: {
        title: page.title || result.title,
        url: page.finalUrl || result.url,
        description: result.description
      },
      kind: "page" as const,
      passages: selectRelevantPassages(page.text, question, queries, result)
    }));

  const evidenceUrls = new Set(
    fetched.flatMap(({ result, page }) => [canonicalUrl(result.url), canonicalUrl(page.finalUrl)])
  );
  const snippetCandidates = [...preferred, ...fallbacks];

  for (const result of snippetCandidates) {
    if (evidenceItems.length >= MAX_EVIDENCE_SOURCES) break;
    if (!result.description) continue;

    const key = canonicalUrl(result.url);
    if (evidenceUrls.has(key)) continue;

    evidenceUrls.add(key);
    evidenceItems.push({ source: result, kind: "snippet", passages: [] });
  }

  return {
    queries,
    sources: evidenceItems.map((item) => item.source),
    systemBlocks: buildWebGroundingMessages(evidenceItems, hadSearchFailure)
  };
}
