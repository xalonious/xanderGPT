import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import dns from "dns/promises";
import net from "net";

const readabilityConsole = new VirtualConsole();
readabilityConsole.forwardTo(console, {
  jsdomErrors: ["not-implemented", "resource-loading", "unhandled-exception"]
});

export type FetchUrlResult = {
  url: string;
  finalUrl: string;
  title?: string;
  text: string;
  contentType?: string;
  status: number;
};

function isIpv4Private(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;

  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

function isIpv6Private(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === "::1") return true;
  if (norm.startsWith("fe80:")) return true;
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isIpv4Private(ip);
  if (kind === 6) return isIpv6Private(ip);
  return false;
}

async function assertUrlSafe(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error("Localhost URLs are not allowed");
  }

  const addrs = await dns.lookup(host, { all: true });
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new Error("Private-network URLs are not allowed");
    }
  }

  return u;
}

async function fetchTextWithLimits(
  url: string,
  signal?: AbortSignal
): Promise<{ status: number; finalUrl: string; contentType?: string; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  const combined = new AbortController();
  const abort = () => combined.abort();
  const onAbort = () => abort();

  if (signal?.aborted) combined.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  controller.signal.addEventListener("abort", onAbort, { once: true });

  try {
    let currentUrl = url;

    for (let redirects = 0; redirects <= 5; redirects++) {
      const safeUrl = await assertUrlSafe(currentUrl);
      const res = await fetch(safeUrl, {
        signal: combined.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "xanderGPT/1.0 (+fetch_url tool)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error(`Redirect response ${res.status} had no location`);
        if (redirects === 5) throw new Error("Too many redirects");

        currentUrl = new URL(location, safeUrl).toString();
        continue;
      }

      if (!res.ok) {
        throw new Error(`Page request failed (${res.status})`);
      }

      const contentType = res.headers.get("content-type") ?? undefined;

      if (!contentType || !contentType.toLowerCase().includes("text/html")) {
        throw new Error(`Unsupported content-type: ${contentType ?? "unknown"}`);
      }

      const html = await res.text();
      if (html.length > 2_000_000) {
        throw new Error("Page too large");
      }

      return {
        status: res.status,
        finalUrl: safeUrl.toString(),
        contentType,
        text: html
      };
    }

    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

export async function fetchAndExtractUrl(
  rawUrl: string,
  opts?: { signal?: AbortSignal }
): Promise<FetchUrlResult> {
  const safe = await assertUrlSafe(rawUrl);

  const fetched = await fetchTextWithLimits(safe.toString(), opts?.signal);

  const dom = new JSDOM(fetched.text, {
    url: fetched.finalUrl,
    virtualConsole: readabilityConsole
  });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const title = article?.title?.trim() || undefined;
  const text = (article?.textContent || "").trim();

  if (!text) {
    throw new Error("Could not extract readable text from the page");
  }

  return {
    url: rawUrl,
    finalUrl: fetched.finalUrl,
    title,
    text,
    contentType: fetched.contentType,
    status: fetched.status
  };
}
