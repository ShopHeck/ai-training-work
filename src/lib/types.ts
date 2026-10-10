import { z } from "zod";

/** What kind of thing a collected item is. */
export const ItemTypeSchema = z.enum(["job", "news", "market-outlook"]);
export type ItemType = z.infer<typeof ItemTypeSchema>;

/** Normalized shape every collected result is coerced into. */
export const CollectedItemSchema = z.object({
  /** Stable dedupe id — sha256 of the canonicalized URL. */
  id: z.string().min(1),
  title: z.string().min(1),
  /** Canonical company name when known, else null. */
  company: z.string().nullable(),
  url: z.string().url(),
  summary: z.string(),
  type: ItemTypeSchema,
  /** ISO date string when the provider reports one, else null. */
  date: z.string().nullable(),
  /** `id` of the SourceConfig that produced this item. */
  sourceId: z.string(),
});
export type CollectedItem = z.infer<typeof CollectedItemSchema>;

export const DigestModeSchema = z.enum(["daily", "weekly"]);
export type DigestMode = z.infer<typeof DigestModeSchema>;

/** Everything written for one platform set of drafts. */
export const DraftsSchema = z.object({
  mode: DigestModeSchema,
  /** Long-form article in Markdown. */
  article: z.string(),
  /** X/Twitter thread — each post must stay under 280 chars. */
  xThread: z.array(z.string()),
  linkedin: z.string(),
  reddit: z.string(),
});
export type Drafts = z.infer<typeof DraftsSchema>;

/** Shape of the JSON blob the LLM is asked to return before injection. */
export const RawDraftsSchema = z.object({
  article: z.string().min(1),
  xThread: z.array(z.string().min(1)).min(1),
  linkedin: z.string().min(1),
  reddit: z.string().min(1),
});
export type RawDrafts = z.infer<typeof RawDraftsSchema>;
