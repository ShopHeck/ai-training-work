import { env, envRequired } from "./env.js";

/**
 * Tavily search + extract client (https://docs.tavily.com).
 * Plain REST — no SDK dependency.
 */

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: TavilySearchResult[];
  answer?: string;
}

export interface SearchOptions {
  maxResults?: number;
  days?: number;
  includeDomains?: string[];
  /** "general" (default) or "news" — news adds recency ranking. */
  topic?: "general" | "news";
}

export class SearchApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SearchApiError";
  }
}

const TAVILY_BASE = "https://api.tavily.com";

async function tavilyPost<T>(path: string, body: unknown): Promise<T> {
  const apiKey = envRequired("TAVILY_API_KEY");
  const res = await fetch(`${TAVILY_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SearchApiError(
      `Tavily ${path} failed: ${res.status} ${text.slice(0, 300)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/** Run a single Tavily search. */
export async function tavilySearch(
  query: string,
  opts: SearchOptions = {},
): Promise<TavilySearchResult[]> {
  const body: Record<string, unknown> = {
    query,
    max_results: opts.maxResults ?? 8,
    topic: opts.topic ?? "general",
    search_depth: "basic",
    include_answer: false,
    include_raw_content: false,
  };
  if (opts.days) body.days = opts.days;
  if (opts.includeDomains?.length) body.include_domains = opts.includeDomains;
  const data = await tavilyPost<TavilySearchResponse>("/search", body);
  return data.results ?? [];
}

export interface TavilyExtractResult {
  url: string;
  raw_content?: string;
  failed_reason?: string;
}

interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
  failed_results?: { url: string; error: string }[];
}

/**
 * Extract readable page content for URLs. Used to enrich summaries for the
 * top results when the search snippet is too thin. Best-effort — failures
 * return an empty map, not an error.
 */
export async function tavilyExtract(
  urls: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (urls.length === 0 || !env("TAVILY_API_KEY")) return out;
  try {
    const data = await tavilyPost<TavilyExtractResponse>("/extract", {
      urls: [...urls],
      extract_depth: "basic",
    });
    for (const r of data.results ?? []) {
      if (r.raw_content) out.set(r.url, r.raw_content);
    }
  } catch {
    // extraction is enrichment only — search snippets still carry the run
  }
  return out;
}
