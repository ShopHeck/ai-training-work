import type { ItemType } from "../src/lib/types.js";

/**
 * Sources monitored by `npm run collect`.
 *
 * Each source becomes one or more searches via the configured search API
 * (Tavily by default). Results are normalized into CollectedItems and deduped
 * against .state/seen.json.
 *
 * Add / remove / edit freely — this file is the single place that controls
 * what gets watched.
 *
 * - id:            stable identifier (shows up as item.sourceId)
 * - kind:          "company" | "subreddit" | "query" — informational grouping
 * - itemType:      "job" | "news" | "market-outlook" — used to group drafts
 * - query:         the search query sent to the provider
 * - company:       canonical company name (used for affiliate matching)
 * - includeDomains: restrict the search to these domains (e.g. reddit.com)
 * - days:          recency window in days for the search (default 7)
 * - maxResults:    max results per search (default 8)
 * - enabled:       set false to disable without deleting
 */
export interface SourceConfig {
  id: string;
  kind: "company" | "subreddit" | "query";
  itemType: ItemType;
  query: string;
  company?: string;
  includeDomains?: string[];
  days?: number;
  maxResults?: number;
  enabled?: boolean;
}

export const SOURCES: SourceConfig[] = [
  // ------------------------------------------------------------------
  // AI-training / data-annotation employers
  // ------------------------------------------------------------------
  {
    id: "dataannotation",
    kind: "company",
    itemType: "job",
    company: "DataAnnotation",
    query: "DataAnnotation AI trainer jobs hiring application pay",
    days: 7,
  },
  {
    id: "outlier",
    kind: "company",
    itemType: "job",
    company: "Outlier",
    query: "Outlier AI Scale AI contributor jobs hiring experts",
    days: 7,
  },
  {
    id: "remotasks",
    kind: "company",
    itemType: "job",
    company: "Remotasks",
    query: "Remotasks AI training jobs tasks hiring",
    days: 7,
  },
  {
    id: "mercor",
    kind: "company",
    itemType: "job",
    company: "Mercor",
    query: "Mercor AI training jobs hiring contractors",
    days: 7,
  },
  {
    id: "alignerr",
    kind: "company",
    itemType: "job",
    company: "Alignerr",
    query: "Alignerr AI trainer jobs hiring",
    days: 7,
  },
  {
    id: "surge-ai",
    kind: "company",
    itemType: "job",
    company: "Surge AI",
    query: "Surge AI data labeling RLHF jobs hiring",
    days: 7,
  },
  {
    id: "appen",
    kind: "company",
    itemType: "job",
    company: "Appen",
    query: "Appen crowd jobs AI data annotation projects",
    days: 7,
  },
  {
    id: "prolific",
    kind: "company",
    itemType: "job",
    company: "Prolific",
    query: "Prolific AI training data studies participants",
    days: 7,
  },

  // ------------------------------------------------------------------
  // Subreddits where workers discuss these gigs
  // ------------------------------------------------------------------
  {
    id: "r-remotasks",
    kind: "subreddit",
    itemType: "news",
    query: "remotasks hiring tasks pay",
    includeDomains: ["reddit.com"],
    days: 7,
  },
  {
    id: "r-dataannotation",
    kind: "subreddit",
    itemType: "news",
    query: "dataannotation projects onboarding",
    includeDomains: ["reddit.com"],
    days: 7,
  },
  {
    id: "r-outlier",
    kind: "subreddit",
    itemType: "news",
    query: "outlier ai projects pay onboarding",
    includeDomains: ["reddit.com"],
    days: 7,
  },
  {
    id: "r-workonline",
    kind: "subreddit",
    itemType: "news",
    query: "AI training data annotation work online",
    includeDomains: ["reddit.com"],
    days: 7,
  },

  // ------------------------------------------------------------------
  // General web / news queries — market outlook & trends
  // ------------------------------------------------------------------
  {
    id: "q-annotation-jobs",
    kind: "query",
    itemType: "market-outlook",
    query: "AI data annotation jobs market hiring",
    days: 7,
  },
  {
    id: "q-ai-training-gig",
    kind: "query",
    itemType: "market-outlook",
    query: "AI training gig hiring side hustle",
    days: 7,
  },
  {
    id: "q-rlhf",
    kind: "query",
    itemType: "market-outlook",
    query: "RLHF contractor opportunities AI feedback jobs",
    days: 7,
  },
  {
    id: "q-market-outlook",
    kind: "query",
    itemType: "market-outlook",
    query: "AI job market outlook data labeling industry",
    days: 30,
  },
];
