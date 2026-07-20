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

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: opts?.signal,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Brave Search error (${response.status}): ${details || "Request failed"}`);
  }

  const data: any = await response.json();
  const items: any[] = data?.web?.results ?? [];

  return items
    .map((item) => ({
      title: String(item?.title ?? "").trim(),
      url: String(item?.url ?? "").trim(),
      description: String(item?.description ?? "").trim(),
    }))
    .filter((item) => item.title && item.url);
}
