// Dev helper: seed .state/ with sample items so `generate` can be smoke-tested
// without a TAVILY_API_KEY. Not used by CI. Run: npx tsx scripts/seed-sample.ts
import { appendItems, saveSeen, itemId } from "../src/lib/state.js";

const now = new Date().toISOString();
const raw = [
  {
    title: "DataAnnotation is onboarding new AI trainers for coding evals",
    company: "DataAnnotation",
    url: "https://dataannotation.tech/careers",
    summary:
      "DataAnnotation opened applications for coding-assessment projects paying $25+/hr for experienced developers. Assessment required before project access.",
    type: "job",
    date: "2026-10-09",
    sourceId: "dataannotation",
  },
  {
    title: "Mercor expands expert marketplace with new RLHF contracts",
    company: "Mercor",
    url: "https://example.com/mercor-news",
    summary:
      "Mercor is expanding its AI-expert marketplace with new RLHF and domain-expert contracts for lawyers, doctors, and engineers, reportedly paying $50-150/hr.",
    type: "news",
    date: "2026-10-08",
    sourceId: "mercor",
  },
  {
    title: "Report: data-labeling market keeps growing as RLHF demand rises",
    company: null,
    url: "https://example.com/market-report",
    summary:
      "Analysts expect continued growth in human-feedback data work as labs scale reasoning-model post-training; contractor demand concentrated in STEM and languages.",
    type: "market-outlook",
    date: "2026-10-07",
    sourceId: "q-market-outlook",
  },
  {
    title: "r/remotasks: task availability picked up this week",
    company: "Remotasks",
    url: "https://reddit.com/r/remotasks/example",
    summary:
      "Multiple users report new image-annotation and LLM-eval tasks appearing after a slow month; payouts still weekly via PayPal.",
    type: "news",
    date: "2026-10-10",
    sourceId: "r-remotasks",
  },
] as const;

const items = raw.map((i) => ({ ...i, id: itemId(i.url) }));
appendItems(".state/items.jsonl", items);
saveSeen(".state/seen.json", Object.fromEntries(items.map((i) => [i.id, now])));
console.log(`seeded ${items.length} items into .state/`);
