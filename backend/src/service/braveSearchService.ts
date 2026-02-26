export type BraveWebResult = {
  title: string;
  url: string;
  description: string;
};

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

function getApiKey(): string {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error("BRAVE_API_KEY is not set");
  return key;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function braveWebSearch(
  query: string,
  opts?: {
    count?: number; 
    offset?: number; 
    safesearch?: "off" | "moderate" | "strict";
    country?: string; 
    lang?: string; 
    signal?: AbortSignal;
  }
): Promise<BraveWebResult[]> {
  const q = String(query ?? "").trim();
  if (!q) return [];

  const apiKey = getApiKey();
  const count = clamp(opts?.count ?? 5, 1, 10);

  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("count", String(count));

  if (typeof opts?.offset === "number" && opts.offset >= 0) {
    url.searchParams.set("offset", String(opts.offset));
  }

  url.searchParams.set("safesearch", opts?.safesearch ?? "moderate");
  if (opts?.country) url.searchParams.set("country", opts.country);
  if (opts?.lang) url.searchParams.set("search_lang", opts.lang);

  const r = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: opts?.signal,
  });

  if (!r.ok) {
    const details = await r.text().catch(() => "");
    throw new Error(`Brave Search error (${r.status}): ${details || "Request failed"}`);
  }

  const data: any = await r.json();

  const items: any[] = data?.web?.results ?? [];
  return items
    .map((x) => ({
      title: String(x?.title ?? "").trim(),
      url: String(x?.url ?? "").trim(),
      description: String(x?.description ?? "").trim(),
    }))
    .filter((x) => x.title && x.url);
}

export function formatWebResultsForPrompt(results: BraveWebResult[]): string {
  if (!results?.length) return "No results.";

  return results
    .slice(0, 8)
    .map((r, i) => {
      const n = i + 1;
      return `[${n}] ${r.title}\n${r.url}\n${r.description}`;
    })
    .join("\n\n");
}