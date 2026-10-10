import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TwitterApi } from "twitter-api-v2";
import { env, envBool, envRequired } from "./lib/env.js";
import { X_LIMIT } from "./generate.js";

/**
 * Publishing — gated behind BOTH an explicit `--publish` flag AND a
 * per-platform env toggle. Without `--publish` everything is a dry run.
 *
 * - X/Twitter: fully implemented (OAuth 1.0a user context, tweetThread).
 * - LinkedIn:  scaffolded, disabled — needs a LinkedIn app + OAuth token.
 * - Reddit:    scaffolded, disabled — needs a Reddit script app + OAuth.
 *   WARNING: auto-posting affiliate links commonly violates subreddit
 *   self-promotion rules and can get accounts banned. Post Reddit manually
 *   after reviewing the draft.
 */

export type Platform = "x" | "linkedin" | "reddit";

export interface PublishOutcome {
  platform: Platform;
  status: "posted" | "dry-run" | "skipped" | "disabled" | "failed";
  detail: string;
}

// ---------------------------------------------------------------------------
// X / Twitter — implemented
// ---------------------------------------------------------------------------

function xClient(): TwitterApi {
  return new TwitterApi({
    appKey: envRequired("X_API_KEY"),
    appSecret: envRequired("X_API_SECRET"),
    accessToken: envRequired("X_ACCESS_TOKEN"),
    accessSecret: envRequired("X_ACCESS_SECRET"),
  });
}

async function publishX(thread: string[]): Promise<string> {
  const client = xClient();
  const posted = await client.v2.tweetThread(thread.slice(0, 25));
  const first = posted[0];
  return `posted ${posted.length} tweets (first id ${first?.data.id ?? "?"})`;
}

// ---------------------------------------------------------------------------
// LinkedIn — STUB. To enable:
//   1. Create an app at https://developer.linkedin.com/ and request the
//      "Share on LinkedIn" product (w_member_social scope).
//   2. OAuth 2.0 authorize → store the access token as LINKEDIN_ACCESS_TOKEN
//      and your person URN (urn:li:person:XXX) as LINKEDIN_AUTHOR_URN.
//   3. Set ENABLE_LINKEDIN_POSTING=true and implement the POST below:
//      POST https://api.linkedin.com/v2/ugcPosts with the share commentary.
// ---------------------------------------------------------------------------

async function publishLinkedIn(_text: string): Promise<string> {
  throw new Error(
    "LinkedIn posting is scaffolded but not implemented — create a LinkedIn " +
      "app (OAuth, w_member_social), set LINKEDIN_ACCESS_TOKEN / " +
      "LINKEDIN_AUTHOR_URN, and fill in publishLinkedIn() in src/publish.ts. " +
      "The reviewed draft is ready to paste manually in output/<date>/linkedin.md.",
  );
}

// ---------------------------------------------------------------------------
// Reddit — STUB. To enable:
//   1. Create a "script" app at https://www.reddit.com/prefs/apps →
//      REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USERNAME /
//      REDDIT_PASSWORD / REDDIT_SUBREDDIT.
//   2. POST to https://oauth.reddit.com/api/submit with kind=self.
//   WARNING: most subreddits ban unsolicited affiliate links and self-promo.
//   Auto-posting this content will likely get the account flagged — review
//   each community's rules and post manually instead.
// ---------------------------------------------------------------------------

async function publishReddit(_text: string): Promise<string> {
  throw new Error(
    "Reddit posting is scaffolded but intentionally disabled — affiliate " +
      "links violate most subreddit self-promotion rules. Review " +
      "output/<date>/reddit.md and post manually where it fits.",
  );
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function readOutput(dir: string, platform: Platform): string | string[] | null {
  const file =
    platform === "x"
      ? "x-thread.json"
      : platform === "linkedin"
        ? "linkedin.md"
        : "reddit.md";
  const path = join(dir, file);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  if (platform === "x") {
    const thread = JSON.parse(content) as string[];
    return thread.filter((t) => t.length <= X_LIMIT);
  }
  return content;
}

/** Latest dated output dir, or an explicit path. */
export function resolveOutputDir(base = "output", dir?: string): string {
  if (dir) return dir;
  if (!existsSync(base)) throw new Error(`No output dir at ${base} — run generate first.`);
  const dated = readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort();
  const latest = dated[dated.length - 1];
  if (!latest) throw new Error(`No dated drafts found under ${base}/`);
  return join(base, latest);
}

const TOGGLES: Record<Platform, string> = {
  x: "ENABLE_X_POSTING",
  linkedin: "ENABLE_LINKEDIN_POSTING",
  reddit: "ENABLE_REDDIT_POSTING",
};

export async function publish(
  platforms: readonly Platform[],
  opts: { publish?: boolean; outputDir?: string } = {},
): Promise<PublishOutcome[]> {
  const dir = resolveOutputDir("output", opts.outputDir);
  const doPost = opts.publish === true;
  const outcomes: PublishOutcome[] = [];

  for (const platform of platforms) {
    const content = readOutput(dir, platform);
    if (content === null) {
      outcomes.push({ platform, status: "skipped", detail: `no draft in ${dir}` });
      continue;
    }
    const toggle = TOGGLES[platform];
    if (!envBool(toggle)) {
      outcomes.push({
        platform,
        status: "disabled",
        detail: `${toggle} is not "true" — draft stays in ${dir}`,
      });
      continue;
    }
    if (!doPost) {
      const n = Array.isArray(content) ? `${content.length} posts` : "1 post";
      outcomes.push({
        platform,
        status: "dry-run",
        detail: `would post ${n} (pass --publish to send)`,
      });
      continue;
    }
    try {
      const detail =
        platform === "x"
          ? await publishX(content as string[])
          : platform === "linkedin"
            ? await publishLinkedIn(content as string)
            : await publishReddit(content as string);
      outcomes.push({ platform, status: "posted", detail });
    } catch (err) {
      outcomes.push({
        platform,
        status: "failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}

/** Convenience: which platforms look configured (for CLI help text). */
export function configuredPlatforms(): Platform[] {
  const out: Platform[] = [];
  if (env("X_API_KEY") && envBool("ENABLE_X_POSTING")) out.push("x");
  if (envBool("ENABLE_LINKEDIN_POSTING")) out.push("linkedin");
  if (envBool("ENABLE_REDDIT_POSTING")) out.push("reddit");
  return out;
}
