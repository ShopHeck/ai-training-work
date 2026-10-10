import { AFFILIATE_LINKS } from "../../config/affiliate.js";
import type { CollectedItem } from "./types.js";

/**
 * Affiliate-link injection.
 *
 * The LLM is instructed to place `{{AFF:key}}` tokens inline where a referral
 * link belongs. This module replaces those tokens with the real URLs from
 * config/affiliate.ts and — as a safety net — appends a "where to apply" CTA
 * block listing the links for every program that matches the collected items.
 * Everything is deterministic string surgery, fully unit-tested.
 */

const TOKEN_RE = /\{\{\s*AFF:([a-z0-9][a-z0-9-]*)\s*\}\}/gi;

/** Find the affiliate key whose aliases match a company/source name. */
export function findAffiliateKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const hay = name.toLowerCase();
  for (const [key, link] of Object.entries(AFFILIATE_LINKS)) {
    if (link.match.some((alias) => hay.includes(alias.toLowerCase()))) {
      return key;
    }
  }
  return null;
}

/**
 * Replace `{{AFF:key}}` tokens with URLs. Tokens referencing unknown keys are
 * removed (leaving surrounding text intact). Pure — no I/O.
 */
export function replaceAffiliateTokens(text: string): string {
  return text
    .replace(TOKEN_RE, (whole, rawKey: string) => {
      const key = rawKey.toLowerCase();
      const link = AFFILIATE_LINKS[key];
      return link ? link.url : "";
    })
    .replace(/[ \t]{2,}/g, " ");
}

/** All affiliate keys matching any of the collected items' company/title. */
export function matchingAffiliateKeys(items: readonly CollectedItem[]): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    const fields = [item.company, item.title, item.sourceId];
    for (const field of fields) {
      const key = findAffiliateKey(field);
      if (key) keys.add(key);
    }
    // sourceId (e.g. "surge-ai") can match a key directly even when aliases miss
    if (AFFILIATE_LINKS[item.sourceId]) keys.add(item.sourceId);
  }
  return [...keys];
}

/** Markdown bullet list of CTA links for the given affiliate keys. */
export function affiliateCtaBlock(keys: readonly string[]): string {
  const lines = keys
    .map((key) => AFFILIATE_LINKS[key])
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .map((l) => `- [${l.label}](${l.url})`);
  if (lines.length === 0) return "";
  return `\n\n**Where to apply / learn more:**\n${lines.join("\n")}\n`;
}

/**
 * Full injection pass for one draft body:
 * 1. replace {{AFF:key}} tokens with real URLs
 * 2. append a CTA block for programs matched by the collected items, unless
 *    the draft already links to them
 */
export function injectAffiliateLinks(
  text: string,
  items: readonly CollectedItem[],
  opts: { appendCtaBlock?: boolean } = {},
): string {
  const appendBlock = opts.appendCtaBlock ?? true;
  let out = replaceAffiliateTokens(text);
  if (!appendBlock) return out;
  const missing = matchingAffiliateKeys(items).filter(
    (key) => !out.includes(AFFILIATE_LINKS[key]!.url),
  );
  if (missing.length > 0) out += affiliateCtaBlock(missing);
  return out;
}

/** Prompt fragment telling the LLM how to place affiliate tokens. */
export function affiliatePromptInstructions(): string {
  const keys = Object.keys(AFFILIATE_LINKS);
  return [
    "Affiliate links: where you naturally point readers at a platform, write the",
    "token {{AFF:key}} inline (it is replaced with the real link later).",
    `Valid keys: ${keys.join(", ")}.`,
    "Use a token at most once per document. Never invent URLs yourself.",
  ].join("\n");
}
