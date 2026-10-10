import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { affiliatePromptInstructions, injectAffiliateLinks } from "./lib/affiliate.js";
import { createLlm, extractJson, type LlmClient } from "./lib/llm.js";
import {
  DraftsSchema,
  RawDraftsSchema,
  type CollectedItem,
  type DigestMode,
  type Drafts,
  type RawDrafts,
} from "./lib/types.js";

export const X_LIMIT = 280;

const SYSTEM = [
  "You are a sharp content writer covering the AI-training / data-annotation",
  "gig economy (DataAnnotation, Outlier, Remotasks, Mercor, Alignerr, Surge AI,",
  "Appen, Prolific, and similar). Your readers are people looking for remote",
  "AI-training work and people tracking the AI labor market.",
  "",
  "Voice: direct, specific, genuinely useful — no hype, no filler, no",
  "engagement-bait. Concrete numbers (pay ranges, requirements) beat adjectives.",
  "Always add a clear call to action. Disclose that links may be referral",
  "links where the platform's norms require it (especially Reddit).",
  "",
  "Output contract: reply with ONE JSON object only, no prose around it:",
  '{ "article": "...", "xThread": ["...", "..."], "linkedin": "...", "reddit": "..." }',
  "- article: long-form Markdown (daily ~500-700 words; weekly ~900-1200).",
  "- xThread: array of posts, each STRICTLY under 280 characters including",
  "  any links. 4-8 posts. Number them like '1/' style is optional.",
  "- linkedin: a single post ~150-250 words, professional tone.",
  "- reddit: a single post with a markdown title line then body; honest,",
  "  non-salesy, discloses referral links ('(referral link)').",
].join("\n");

function itemsBlock(items: readonly CollectedItem[]): string {
  return items
    .map((i) => {
      const bits = [
        `- title: ${i.title}`,
        `  url: ${i.url}`,
        `  type: ${i.type}`,
        `  company: ${i.company ?? "n/a"}`,
        i.date ? `  date: ${i.date}` : null,
        `  summary: ${i.summary.slice(0, 600)}`,
      ];
      return bits.filter(Boolean).join("\n");
    })
    .join("\n");
}

function buildPrompt(items: readonly CollectedItem[], mode: DigestMode): string {
  const scope =
    mode === "daily"
      ? [
          "MODE: daily digest — cover ONLY the strongest 3-5 items below.",
          "Lead with what's new today. Keep it tight.",
        ]
      : [
          "MODE: weekly roundup — synthesize ALL items below.",
          "Group the article into sections: 'Who's hiring', 'Worth knowing',",
          "'Market outlook'. End with a short 'what to watch next week'.",
        ];
  return [
    ...scope,
    "",
    affiliatePromptInstructions(),
    "",
    "Items collected since the last run:",
    itemsBlock(items),
    "",
    "Write the four drafts now. JSON only.",
  ].join("\n");
}

/**
 * Enforce the 280-char limit. Posts that fit are untouched; an overlong post
 * is split at the last sentence/word boundary before the limit. URLs are never
 * split — a post that can't be split cleanly is hard-truncated before its
 * last URL or at 277 chars + "…".
 */
export function enforceTweetLimit(
  thread: readonly string[],
  limit: number = X_LIMIT,
): string[] {
  const out: string[] = [];
  for (const raw of thread) {
    let text = raw.trim();
    while (text.length > limit) {
      const window = text.slice(0, limit);
      const lastSpace = window.lastIndexOf(" ");
      const urlStart = window.lastIndexOf("http");
      // If a URL starts inside the window and runs past it, cut before the URL.
      let cut =
        urlStart > 0 && text.indexOf(" ", urlStart) > limit
          ? urlStart - 1
          : lastSpace > Math.floor(limit * 0.5)
            ? lastSpace
            : limit - 1;
      if (cut <= 0) cut = limit - 1; // always make progress
      const head = text.slice(0, cut).trimEnd();
      out.push(head.length <= limit - 1 && cut === limit - 1 ? head + "…" : head);
      text = text.slice(cut).trimStart();
      if (!text) break;
    }
    if (text) out.push(text);
  }
  return out;
}

/** Generate all platform drafts for the collected items. */
export async function generateDrafts(
  items: readonly CollectedItem[],
  mode: DigestMode,
  llm: LlmClient = createLlm(),
): Promise<Drafts> {
  if (items.length === 0) {
    throw new Error("No collected items to generate from — run collect first.");
  }
  const raw = await llm.complete(SYSTEM, buildPrompt(items, mode), {
    json: true,
    maxTokens: 8192,
  });
  const parsed = RawDraftsSchema.parse(JSON.parse(extractJson(raw)));
  const drafts = finalizeDrafts(parsed, items, mode);
  return DraftsSchema.parse(drafts);
}

/** Deterministic post-processing: affiliate injection + tweet limit. */
export function finalizeDrafts(
  raw: RawDrafts,
  items: readonly CollectedItem[],
  mode: DigestMode,
): Drafts {
  return {
    mode,
    article: injectAffiliateLinks(raw.article, items),
    xThread: enforceTweetLimit(
      raw.xThread.map((t) => injectAffiliateLinks(t, items, { appendCtaBlock: false })),
    ),
    linkedin: injectAffiliateLinks(raw.linkedin, items),
    reddit: injectAffiliateLinks(raw.reddit, items),
  };
}

export interface WrittenOutput {
  dir: string;
  files: string[];
}

function xThreadMarkdown(thread: readonly string[]): string {
  return thread
    .map((t, i) => `${i + 1}. (${t.length}/${X_LIMIT}) ${t}`)
    .join("\n\n");
}

/** Write drafts + source items to output/<date>/ for human review. */
export function writeDrafts(
  drafts: Drafts,
  items: readonly CollectedItem[],
  baseDir = "output",
  date: Date = new Date(),
): WrittenOutput {
  const day = date.toISOString().slice(0, 10);
  const dir = join(baseDir, day);
  mkdirSync(dir, { recursive: true });

  const meta = {
    mode: drafts.mode,
    generatedAt: date.toISOString(),
    itemCount: items.length,
    xPosts: drafts.xThread.length,
    xOverLimit: drafts.xThread.filter((t) => t.length > X_LIMIT).length,
  };

  const files: Record<string, string> = {
    "article.md": drafts.article,
    "x-thread.md": xThreadMarkdown(drafts.xThread) + "\n",
    "x-thread.json": JSON.stringify(drafts.xThread, null, 2) + "\n",
    "linkedin.md": drafts.linkedin,
    "reddit.md": drafts.reddit,
    "items.json": JSON.stringify(items, null, 2) + "\n",
    "meta.json": JSON.stringify(meta, null, 2) + "\n",
  };
  const written: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content.endsWith("\n") ? content : content + "\n");
    written.push(join(dir, name));
  }
  return { dir, files: written };
}
