/**
 * Affiliate / referral links injected into generated drafts.
 *
 * ⚠️  EVERY `url` BELOW IS A PLACEHOLDER. Replace each `YOUR_REF_CODE` with
 * your real referral code / link from the platform's referral program before
 * publishing. Most of these programs hand you a link shaped like
 * `https://<site>/?ref=YOUR_CODE` — paste it in verbatim.
 *
 * How it works:
 * - `match` lists aliases used to detect when a collected item or a generated
 *   draft mentions this company (case-insensitive substring match).
 * - The generator asks the LLM to emit `{{AFF:key}}` tokens inline; they are
 *   replaced with the URL below at publish time. Unknown tokens are stripped.
 * - `injectAffiliateLinks` also appends a "where to apply" CTA block listing
 *   the links for whichever companies actually appear in the digest.
 *
 * To add a program: add an entry, give it a stable key, list its name aliases
 * in `match`, and set a CTA `label`.
 */
export interface AffiliateLink {
  /** Referral URL — replace the placeholder with your real link. */
  url: string;
  /** CTA text used in generated content. */
  label: string;
  /** Case-insensitive aliases that identify this program in text/items. */
  match: string[];
}

export const AFFILIATE_LINKS: Record<string, AffiliateLink> = {
  dataannotation: {
    url: "https://dataannotation.tech/?ref=YOUR_REF_CODE",
    label: "Apply to DataAnnotation",
    match: ["dataannotation", "data annotation"],
  },
  outlier: {
    url: "https://app.outlier.ai/?ref=YOUR_REF_CODE",
    label: "Apply to Outlier",
    match: ["outlier", "outlier.ai", "outlier ai", "scale ai"],
  },
  remotasks: {
    url: "https://www.remotasks.com/?ref=YOUR_REF_CODE",
    label: "Sign up for Remotasks",
    match: ["remotasks", "remotasks.com"],
  },
  mercor: {
    url: "https://mercor.com/?ref=YOUR_REF_CODE",
    label: "Apply on Mercor",
    match: ["mercor", "mercor.com"],
  },
  alignerr: {
    url: "https://alignerr.com/?ref=YOUR_REF_CODE",
    label: "Apply to Alignerr",
    match: ["alignerr", "alignerr.com"],
  },
  "surge-ai": {
    url: "https://surgeai.com/?ref=YOUR_REF_CODE",
    label: "Check out Surge AI",
    match: ["surge ai", "surgeai", "surge.ai"],
  },
  appen: {
    url: "https://appen.com/?ref=YOUR_REF_CODE",
    label: "Browse Appen projects",
    match: ["appen", "appen.com"],
  },
  prolific: {
    url: "https://app.prolific.com/?ref=YOUR_REF_CODE",
    label: "Join Prolific",
    match: ["prolific", "prolific.com"],
  },
};
