import { SOURCES, type SourceConfig } from "../config/sources.js";
import { envBool } from "./lib/env.js";
import {
  tavilySearch,
  tavilyExtract,
  type TavilySearchResult,
} from "./lib/search.js";
import {
  appendItems,
  filterUnseen,
  itemId,
  itemsWithinDays,
  loadItems,
  loadSeen,
  pruneSeen,
  saveSeen,
} from "./lib/state.js";
import {
  CollectedItemSchema,
  type CollectedItem,
} from "./lib/types.js";

const SEEN_PATH = ".state/seen.json";
const ITEMS_PATH = ".state/items.jsonl";

const KNOWN_COMPANIES = [
  "DataAnnotation",
  "Outlier",
  "Scale AI",
  "Remotasks",
  "Mercor",
  "Alignerr",
  "Surge AI",
  "Appen",
  "Prolific",
];

/** Best-effort company detection from a result's text + the source config. */
function detectCompany(source: SourceConfig, text: string): string | null {
  if (source.company) return source.company;
  const hay = text.toLowerCase();
  for (const c of KNOWN_COMPANIES) {
    if (hay.includes(c.toLowerCase())) return c;
  }
  return null;
}

function normalizeResult(
  source: SourceConfig,
  r: TavilySearchResult,
  extracted?: string,
): CollectedItem | null {
  const summary = (extracted ?? r.content ?? "").replace(/\s+/g, " ").trim();
  return safeParse({
    id: itemId(r.url),
    title: (r.title ?? "").trim() || r.url,
    company: detectCompany(source, `${r.title} ${summary}`),
    url: r.url,
    summary: summary.slice(0, 2000),
    type: source.itemType,
    date: r.published_date ?? null,
    sourceId: source.id,
  });
}

function safeParse(raw: unknown): CollectedItem | null {
  const parsed = CollectedItemSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Collect fresh items for one source. Returns [] on per-source failure. */
async function collectSource(source: SourceConfig): Promise<CollectedItem[]> {
  const results = await tavilySearch(source.query, {
    maxResults: source.maxResults ?? 8,
    days: source.days ?? 7,
    includeDomains: source.includeDomains,
    topic: source.kind === "company" || source.kind === "subreddit" ? "news" : "general",
  });

  // Enrich the top few thin snippets with full-page extraction (best effort).
  const thin = results.filter((r) => (r.content ?? "").length < 280).slice(0, 3);
  const extracted = await tavilyExtract(thin.map((r) => r.url));

  return results
    .map((r) => normalizeResult(source, r, extracted.get(r.url)))
    .filter((i): i is CollectedItem => i !== null);
}

export interface CollectResult {
  /** Items never seen before (this run's report). */
  fresh: CollectedItem[];
  /** Total items returned by the sources before dedupe. */
  scanned: number;
  /** Source ids that failed this run. */
  failedSources: string[];
}

/**
 * Run every enabled source, normalize + dedupe against .state/, persist the
 * new items, and return what is new.
 */
export async function collect(): Promise<CollectResult> {
  const enabled = SOURCES.filter((s) => s.enabled !== false);
  const seen = loadSeen(SEEN_PATH);

  const settled = await Promise.allSettled(enabled.map(collectSource));
  const all: CollectedItem[] = [];
  const failedSources: string[] = [];
  settled.forEach((res, i) => {
    const src = enabled[i]!;
    if (res.status === "fulfilled") {
      all.push(...res.value);
    } else {
      failedSources.push(src.id);
      console.warn(
        `  ! source "${src.id}" failed: ${res.reason instanceof Error ? res.reason.message : res.reason}`,
      );
    }
  });

  const { fresh, state } = filterUnseen(all, seen);
  // Persist items BEFORE committing seen timestamps — a failed append must
  // not permanently suppress items (worst case of this order: items are
  // re-collected next run, which loadItems dedupes by id).
  appendItems(ITEMS_PATH, fresh);
  saveSeen(SEEN_PATH, pruneSeen(state));

  return { fresh, scanned: all.length, failedSources };
}

/**
 * Items available for generation: fresh ones from this run if given, else the
 * stored items first seen within `days` (daily => 1, weekly => 7).
 */
export function itemsForGeneration(days: number, fresh?: CollectedItem[]): CollectedItem[] {
  const stored = loadItems(ITEMS_PATH);
  const seen = loadSeen(SEEN_PATH);
  const pool = stored.length > 0 ? stored : (fresh ?? []);
  return itemsWithinDays(pool, seen, days);
}

/** Hacker News Algolia search — free, no key. Off unless HN_SEARCH_ENABLED. */
async function collectHn(): Promise<CollectedItem[]> {
  if (!envBool("HN_SEARCH_ENABLED")) return [];
  const queries = ["AI training jobs", "data annotation", "RLHF"];
  const out: CollectedItem[] = [];
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=10`,
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        hits?: { title?: string; url?: string; objectID?: string; created_at?: string }[];
      };
      for (const h of data.hits ?? []) {
        if (!h.url || !h.title) continue;
        const item = safeParse({
          id: itemId(h.url),
          title: h.title,
          company: null,
          url: h.url,
          summary: h.title,
          type: "market-outlook",
          date: h.created_at ?? null,
          sourceId: "hacker-news",
        });
        if (item) out.push(item);
      }
    } catch {
      // best effort
    }
  }
  return out;
}

/** collect() plus optional keyless extras (currently HN). */
export async function collectAll(): Promise<CollectResult> {
  const base = await collect();
  const hn = await collectHn();
  if (hn.length === 0) return base;
  const seen = loadSeen(SEEN_PATH);
  const { fresh, state } = filterUnseen(hn, seen);
  appendItems(ITEMS_PATH, fresh);
  saveSeen(SEEN_PATH, pruneSeen(state));
  return {
    fresh: [...base.fresh, ...fresh],
    scanned: base.scanned + hn.length,
    failedSources: base.failedSources,
  };
}
