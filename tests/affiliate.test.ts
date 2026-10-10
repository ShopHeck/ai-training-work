import { describe, expect, it } from "vitest";
import {
  affiliateCtaBlock,
  findAffiliateKey,
  injectAffiliateLinks,
  matchingAffiliateKeys,
  replaceAffiliateTokens,
} from "../src/lib/affiliate.js";
import { AFFILIATE_LINKS } from "../config/affiliate.js";
import { CollectedItemSchema, type CollectedItem } from "../src/lib/types.js";

function makeItem(overrides: Partial<CollectedItem> = {}): CollectedItem {
  return CollectedItemSchema.parse({
    id: "x".repeat(16),
    title: "Outlier is hiring AI trainers",
    company: "Outlier",
    url: "https://example.com/1",
    summary: "Flexible expert work.",
    type: "job",
    date: null,
    sourceId: "outlier",
    ...overrides,
  });
}

describe("findAffiliateKey", () => {
  it("matches company names case-insensitively via aliases", () => {
    expect(findAffiliateKey("Outlier")).toBe("outlier");
    expect(findAffiliateKey("outlier.ai")).toBe("outlier");
    expect(findAffiliateKey("DATAANNOTATION")).toBe("dataannotation");
    expect(findAffiliateKey("Prolific")).toBe("prolific");
  });

  it("returns null for unknown companies and empty input", () => {
    expect(findAffiliateKey("Acme Corp")).toBeNull();
    expect(findAffiliateKey(null)).toBeNull();
    expect(findAffiliateKey("")).toBeNull();
  });
});

describe("replaceAffiliateTokens", () => {
  it("replaces known {{AFF:key}} tokens with the configured URL", () => {
    const out = replaceAffiliateTokens("Apply at {{AFF:outlier}} today");
    expect(out).toBe(`Apply at ${AFFILIATE_LINKS["outlier"]!.url} today`);
  });

  it("is case-insensitive and tolerates spaces in the token", () => {
    const out = replaceAffiliateTokens("go {{ AFF:Outlier }} now");
    expect(out).toContain(AFFILIATE_LINKS["outlier"]!.url);
  });

  it("strips unknown tokens instead of leaving them visible", () => {
    const out = replaceAffiliateTokens("link {{AFF:no-such-key}} here");
    expect(out).not.toContain("{{");
    expect(out).not.toContain("no-such-key");
  });
});

describe("matchingAffiliateKeys", () => {
  it("finds programs from item company, title, and sourceId", () => {
    const items = [
      makeItem(),
      makeItem({ company: "DataAnnotation", title: "DA roles", sourceId: "dataannotation" }),
      makeItem({ company: null, title: "Generic news", sourceId: "q-market-outlook" }),
    ];
    const keys = matchingAffiliateKeys(items);
    expect(keys).toContain("outlier");
    expect(keys).toContain("dataannotation");
    expect(keys).toHaveLength(2);
  });
});

describe("affiliateCtaBlock", () => {
  it("renders a markdown bullet list of CTAs", () => {
    const block = affiliateCtaBlock(["outlier", "prolific"]);
    expect(block).toContain(AFFILIATE_LINKS["outlier"]!.url);
    expect(block).toContain(AFFILIATE_LINKS["prolific"]!.url);
    expect(block).toContain(AFFILIATE_LINKS["outlier"]!.label);
  });

  it("returns empty string for no keys", () => {
    expect(affiliateCtaBlock([])).toBe("");
  });
});

describe("injectAffiliateLinks", () => {
  it("replaces tokens and appends a CTA block for unmatched programs", () => {
    const draft = "Outlier is hiring again. Apply: {{AFF:outlier}}";
    const out = injectAffiliateLinks(draft, [
      makeItem(),
      makeItem({ company: "Mercor", sourceId: "mercor", url: "https://example.com/2" }),
    ]);
    // token became the URL
    expect(out).toContain(AFFILIATE_LINKS["outlier"]!.url);
    // mercor wasn't linked inline → CTA block adds it
    expect(out).toContain(AFFILIATE_LINKS["mercor"]!.url);
    // outlier already linked inline → not duplicated in the block
    const blockIdx = out.indexOf("Where to apply");
    expect(blockIdx).toBeGreaterThan(-1);
    expect(out.slice(blockIdx)).not.toContain(AFFILIATE_LINKS["outlier"]!.url);
  });

  it("appends nothing when no item matches an affiliate program", () => {
    const out = injectAffiliateLinks("plain text", [
      makeItem({ company: "Acme", title: "x", sourceId: "q-market-outlook" }),
    ]);
    expect(out).toBe("plain text");
  });

  it("can skip the CTA block (used for tweets)", () => {
    const out = injectAffiliateLinks(
      "short post",
      [makeItem()],
      { appendCtaBlock: false },
    );
    expect(out).toBe("short post");
  });
});
