# ai-training-work

Automated **AI-training / data-annotation job digest + content pipeline**. On a
schedule it collects what's new in the AI-training gig economy (DataAnnotation,
Outlier/Scale AI, Remotasks, Mercor, Alignerr, Surge AI, Appen, Prolific, plus
subreddits and market news), dedupes it, and generates **ready-to-post drafts
with your affiliate links attached**: a long-form article, an X/Twitter thread,
a LinkedIn post, and a Reddit post.

Nothing is auto-posted. Drafts land in `output/<date>/` for human review.

```
collect ──▶ .state/seen.json (dedupe) + .state/items.jsonl (history)
generate ─▶ LLM drafts with {{AFF:key}} tokens ─▶ inject real affiliate links
            ─▶ output/<date>/{article,x-thread,linkedin,reddit,items,meta}
publish ──▶ gated: --publish flag AND per-platform ENABLE_*_POSTING toggle
            (X implemented; LinkedIn/Reddit scaffolded stubs)
```

## Setup

```bash
npm ci
cp .env.example .env   # then fill in the keys below
```

| Env var | Required | What |
|---|---|---|
| `TAVILY_API_KEY` | collect | [Tavily](https://tavily.com) search/extract key (free tier works) |
| `LLM_PROVIDER` | generate | `anthropic` (default) or `openai` |
| `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | generate | Claude key |
| `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) | generate | alternative provider |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | X publish | OAuth 1.0a user-context creds from [developer.x.com](https://developer.x.com) |
| `ENABLE_X_POSTING` | X publish | must be `true` *and* `--publish` passed to post |
| `ENABLE_LINKEDIN_POSTING`, `LINKEDIN_*` | LinkedIn | stub — see below |
| `ENABLE_REDDIT_POSTING`, `REDDIT_*` | Reddit | stub — see below |
| `HN_SEARCH_ENABLED` | optional | also search Hacker News (no key needed) |

## Commands

```bash
npm run collect                          # search all sources, dedupe, store new items
npm run generate -- --mode daily         # daily digest (items from last ~24h)
npm run generate -- --mode weekly        # weekly roundup (items from last 7 days)
npm run run -- --mode weekly             # collect + generate in one shot
npm run publish -- --platforms x         # DRY RUN — shows what would post
npm run publish -- --platforms x --publish   # actually post (if toggle on)
npm test && npm run typecheck
```

`generate` with no recent items exits with a clear error — run `collect` first.

## Configuring sources

`config/sources.ts` is the watchlist. Each entry is one search: company job
boards, subreddit monitors (`includeDomains: ["reddit.com"]`), or broad
market-outlook queries. Add/remove entries or flip `enabled: false` — no other
code changes needed.

## Affiliate links

`config/affiliate.ts` maps `program key -> { url, label, match[] }`. **Every
URL ships as a `?ref=YOUR_REF_CODE` placeholder — replace them with your real
referral links.** The generator asks the LLM to place `{{AFF:key}}` tokens
inline, which are swapped for the real URL deterministically; a "Where to
apply" CTA block is appended for any matched program that wasn't linked
inline, and links already present are never duplicated.

## Reviewing drafts

Each run writes a fresh `output/YYYY-MM-DD/<mode>-<HHMMSS>/` directory —
every generation gets its own folder, so a re-run never overwrites a draft
you already reviewed:

| File | What |
|---|---|
| `article.md` | long-form article (Markdown) |
| `x-thread.md` / `x-thread.json` | thread for humans / for the publisher |
| `linkedin.md` | LinkedIn post |
| `reddit.md` | Reddit post (title + body) |
| `items.json` | the collected items the drafts were built from |
| `meta.json` | mode, counts, over-280 audit |

`publish` defaults to the newest run directory; pass `--dir` to pick a
specific one. In CI the `output/` tree is downloadable as a **workflow
artifact**.

## Enabling publishing

Posting always needs two switches: `--publish` on the command AND the
platform's `ENABLE_*_POSTING=true` env var.

- **X/Twitter** — implemented. Create a project + app at developer.x.com with
  read+write permissions, put the four OAuth 1.0a creds in `.env`, set
  `ENABLE_X_POSTING=true`.
- **LinkedIn** — stubbed. Create an app at developer.linkedin.com, request the
  "Share on LinkedIn" product (`w_member_social`), OAuth-authorize, fill
  `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_AUTHOR_URN`, then implement
  `publishLinkedIn()` in `src/publish.ts`.
- **Reddit** — stubbed and *intentionally* discouraged: auto-posting referral
  links violates most subreddits' self-promotion rules and can get accounts
  banned. Review `reddit.md` and post manually where it fits. If you still
  want it, create a script app at reddit.com/prefs/apps and implement
  `publishReddit()`.

## GitHub Actions

`.github/workflows/ai-job-digest.yml` runs the digest daily (Tue–Sun 14:00
UTC) and weekly (Mon 14:00 UTC), plus `workflow_dispatch` with a mode input.
Dedupe state persists between runs via `actions/cache`; drafts are uploaded
as artifacts — **nothing posts from CI** unless you uncomment the publish
step.

Repo secrets to add: `TAVILY_API_KEY`, `ANTHROPIC_API_KEY` (or
`OPENAI_API_KEY`); optional vars `LLM_PROVIDER`, `ANTHROPIC_MODEL`,
`OPENAI_MODEL`; and the four `X_*` secrets + `ENABLE_X_POSTING` repo variable
only if you enable CI publishing.

## Project layout

```
config/sources.ts     watchlist (edit me)
config/affiliate.ts   referral links (edit me)
src/collect.ts        search → normalize → dedupe → .state/
src/generate.ts       LLM drafts → affiliate injection → output/<date>/
src/publish.ts        gated posting (X real, LinkedIn/Reddit stubs)
src/index.ts          CLI
src/lib/{types,env,state,search,llm,affiliate}.ts
tests/                vitest: dedupe, affiliate injection, thread splitting
```
