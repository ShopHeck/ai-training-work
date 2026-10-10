import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendItems,
  canonicalizeUrl,
  filterUnseen,
  itemId,
  itemsWithinDays,
  loadItems,
  loadSeen,
  pruneSeen,
  saveSeen,
  type SeenState,
} from "../src/lib/state.js";
import { CollectedItemSchema, type CollectedItem } from "../src/lib/types.js";

function makeItem(overrides: Partial<CollectedItem> = {}): CollectedItem {
  return CollectedItemSchema.parse({
    id: itemId("https://example.com/jobs/1"),
    title: "AI trainer needed",
    company: "DataAnnotation",
    url: "https://example.com/jobs/1",
    summary: "Remote AI training work.",
    type: "job",
    date: null,
    sourceId: "dataannotation",
    ...overrides,
  });
}

describe("canonicalizeUrl", () => {
  it("strips tracking params, hash, www, and trailing slash", () => {
    const a = canonicalizeUrl(
      "https://www.Example.com/jobs/1/?utm_source=x&utm_medium=y&b=2&a=1#frag",
    );
    const b = canonicalizeUrl("https://example.com/jobs/1?a=1&b=2");
    expect(a).toBe(b);
  });

  it("keeps meaningful query params, sorted", () => {
    expect(canonicalizeUrl("https://x.com/p?b=2&a=1")).toBe(
      canonicalizeUrl("https://x.com/p?a=1&b=2"),
    );
    expect(canonicalizeUrl("https://x.com/p?a=1")).not.toBe(
      canonicalizeUrl("https://x.com/p?a=2"),
    );
  });

  it("degrades gracefully on non-URLs", () => {
    expect(canonicalizeUrl("  NOT A URL  ")).toBe("not a url");
  });
});

describe("itemId", () => {
  it("is stable across cosmetic URL variants", () => {
    const id1 = itemId("https://www.example.com/a?utm_campaign=z");
    const id2 = itemId("https://example.com/a");
    expect(id1).toBe(id2);
  });

  it("differs for different URLs", () => {
    expect(itemId("https://example.com/a")).not.toBe(itemId("https://example.com/b"));
  });
});

describe("filterUnseen", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("passes all items when state is empty", () => {
    const items = [makeItem(), makeItem({ url: "https://x.com/2", id: itemId("https://x.com/2") })];
    const { fresh, state } = filterUnseen(items, {}, now);
    expect(fresh).toHaveLength(2);
    expect(Object.keys(state)).toHaveLength(2);
  });

  it("drops items whose id is already seen", () => {
    const item = makeItem();
    const seen: SeenState = { [item.id]: "2026-10-01T00:00:00Z" };
    const { fresh } = filterUnseen([item], seen, now);
    expect(fresh).toHaveLength(0);
  });

  it("collapses duplicates within a single batch", () => {
    const item = makeItem();
    const dup = { ...item, title: "same URL, different snippet" };
    const { fresh, state } = filterUnseen([item, dup], {}, now);
    expect(fresh).toHaveLength(1);
    expect(state[item.id]).toBe(now.toISOString());
  });

  it("preserves existing state entries", () => {
    const seen: SeenState = { other: "2026-09-01T00:00:00Z" };
    const { state } = filterUnseen([makeItem()], seen, now);
    expect(state["other"]).toBe("2026-09-01T00:00:00Z");
  });
});

describe("pruneSeen", () => {
  it("drops entries older than the TTL", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const state: SeenState = {
      old: "2026-06-01T00:00:00Z",
      recent: "2026-10-09T00:00:00Z",
      garbage: "not-a-date",
    };
    const pruned = pruneSeen(state, 90, now);
    expect(pruned["old"]).toBeUndefined();
    expect(pruned["recent"]).toBe("2026-10-09T00:00:00Z");
    expect(pruned["garbage"]).toBe("not-a-date"); // unparseable kept, safe side
  });
});

describe("seen/items file round-trip", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("saves and loads seen state", () => {
    dir = mkdtempSync(join(tmpdir(), "dedupe-"));
    const path = join(dir, "seen.json");
    saveSeen(path, { a: "2026-10-10T00:00:00Z" });
    expect(loadSeen(path)).toEqual({ a: "2026-10-10T00:00:00Z" });
  });

  it("appends and loads items.jsonl, deduped by id", () => {
    dir = mkdtempSync(join(tmpdir(), "dedupe-"));
    const path = join(dir, "sub", "items.jsonl");
    const item = makeItem();
    appendItems(path, [item]);
    appendItems(path, [{ ...item, title: "edited later" }]);
    const items = loadItems(path);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("edited later");
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("loadItems skips malformed lines", () => {
    dir = mkdtempSync(join(tmpdir(), "dedupe-"));
    const path = join(dir, "items.jsonl");
    appendItems(path, [makeItem()]);
    appendFileSync(path, "{broken json\n");
    expect(loadItems(path)).toHaveLength(1);
  });
});

describe("itemsWithinDays", () => {
  it("filters by first-seen timestamp", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const a = makeItem({ id: "a" });
    const b = makeItem({ id: "b", url: "https://x.com/b" });
    const seen: SeenState = {
      a: "2026-10-09T00:00:00Z",
      b: "2026-09-01T00:00:00Z",
    };
    const within = itemsWithinDays([a, b], seen, 7, now);
    expect(within.map((i) => i.id)).toEqual(["a"]);
  });
});
