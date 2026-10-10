import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CollectedItemSchema, type CollectedItem } from "./types.js";

/**
 * Dedupe / persistence layer.
 *
 * Two files live under .state/:
 * - seen.json    { itemId: firstSeenIso } — suppresses reporting the same
 *                opportunity twice. Entries older than SEEN_TTL_DAYS are
 *                pruned so links can resurface in a later roundup.
 * - items.jsonl  one CollectedItem per line — every *fresh* item ever
 *                collected. `generate` slices this by recency window.
 */

export interface SeenState {
  [itemId: string]: string;
}

export const SEEN_TTL_DAYS = 90;

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "spm",
  "igshid",
]);

/** Canonicalize a URL so trivial variants hash to the same dedupe id. */
export function canonicalizeUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return rawUrl.trim().toLowerCase();
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      u.searchParams.delete(key);
    }
  }
  u.searchParams.sort();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

/** Deterministic item id used for dedupe. */
export function itemId(url: string): string {
  return createHash("sha256").update(canonicalizeUrl(url)).digest("hex").slice(0, 16);
}

export function loadSeen(path: string): SeenState {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as SeenState;
    return {};
  } catch {
    return {};
  }
}

export function saveSeen(path: string, state: SeenState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

/**
 * Split items into fresh vs already-seen (by id), collapsing duplicates that
 * appear twice inside the same batch. Returns the fresh items plus an updated
 * state containing the fresh ids stamped with `now`.
 */
export function filterUnseen(
  items: readonly CollectedItem[],
  seen: SeenState,
  now: Date = new Date(),
): { fresh: CollectedItem[]; state: SeenState } {
  const state = { ...seen };
  const fresh: CollectedItem[] = [];
  const batchIds = new Set<string>();
  const stamp = now.toISOString();
  for (const item of items) {
    if (state[item.id] !== undefined || batchIds.has(item.id)) continue;
    batchIds.add(item.id);
    state[item.id] = stamp;
    fresh.push(item);
  }
  return { fresh, state };
}

/** Drop entries older than `ttlDays` so the state file stays bounded. */
export function pruneSeen(
  state: SeenState,
  ttlDays: number = SEEN_TTL_DAYS,
  now: Date = new Date(),
): SeenState {
  const cutoff = now.getTime() - ttlDays * 24 * 60 * 60 * 1000;
  const out: SeenState = {};
  for (const [id, iso] of Object.entries(state)) {
    const t = Date.parse(iso);
    if (Number.isNaN(t) || t >= cutoff) out[id] = iso;
  }
  return out;
}

/** Append fresh items to items.jsonl (one JSON object per line). */
export function appendItems(path: string, items: readonly CollectedItem[]): void {
  if (items.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  const lines = items.map((i) => JSON.stringify(i)).join("\n") + "\n";
  appendFileSync(path, lines);
}

/** Load all stored items from items.jsonl, deduped by id (latest wins). */
export function loadItems(path: string): CollectedItem[] {
  if (!existsSync(path)) return [];
  const byId = new Map<string, CollectedItem>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const item = CollectedItemSchema.parse(JSON.parse(trimmed));
      byId.set(item.id, item);
    } catch {
      // skip malformed lines rather than killing the run
    }
  }
  return [...byId.values()];
}

/** Items whose first-seen time falls within the last `days` days. */
export function itemsWithinDays(
  items: readonly CollectedItem[],
  seen: SeenState,
  days: number,
  now: Date = new Date(),
): CollectedItem[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const firstSeen = seen[item.id];
    if (!firstSeen) return true; // unknown => treat as fresh
    const t = Date.parse(firstSeen);
    return Number.isNaN(t) ? true : t >= cutoff;
  });
}
