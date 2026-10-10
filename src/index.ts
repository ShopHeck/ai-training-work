#!/usr/bin/env node
/**
 * ai-training-work — AI-training / data-annotation job digest CLI.
 *
 * Commands:
 *   collect                          run sources, dedupe, store fresh items
 *   generate --mode daily|weekly     write drafts to output/<date>/
 *   publish --platforms x[,linkedin,reddit] [--publish] [--dir output/<date>]
 *   run --mode daily|weekly [--publish]
 *                                    collect + generate (+ optionally publish)
 *
 * Publishing is always a dry run unless `--publish` is passed AND the
 * platform's ENABLE_*_POSTING env toggle is true.
 */
import { collectAll, itemsForGeneration } from "./collect.js";
import { generateDrafts, writeDrafts } from "./generate.js";
import { loadEnv } from "./lib/env.js";
import { DigestModeSchema, type DigestMode } from "./lib/types.js";
import { publish, type Platform } from "./publish.js";

const USAGE = `Usage: tsx src/index.ts <command> [flags]

Commands:
  collect                              search all sources, dedupe, store items
  generate --mode daily|weekly         generate drafts into output/<date>/
  publish --platforms x[,linkedin,reddit]
                                       [--publish] [--dir output/YYYY-MM-DD]
  run --mode daily|weekly [--publish]  collect + generate (+ optional publish)

Flags:
  --mode <daily|weekly>   digest mode (default: daily)
  --platforms <csv>       platforms for publish (default: x)
  --publish               actually post (default: dry run)
  --dir <path>            output dir for publish (default: latest)
  --help                  show this help
`;

interface Args {
  command: string;
  mode: DigestMode;
  platforms: Platform[];
  publish: boolean;
  dir?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const args: Args = {
    command: command ?? "help",
    mode: "daily",
    platforms: ["x"],
    publish: false,
    help: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const next = () => rest[++i];
    switch (flag) {
      case "--mode": {
        const v = DigestModeSchema.safeParse(next());
        if (!v.success) throw new Error("--mode must be daily or weekly");
        args.mode = v.data;
        break;
      }
      case "--platforms": {
        const list = (next() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const valid = new Set(["x", "linkedin", "reddit"]);
        for (const p of list) {
          if (!valid.has(p)) throw new Error(`unknown platform "${p}" (x|linkedin|reddit)`);
        }
        args.platforms = list as Platform[];
        break;
      }
      case "--publish":
        args.publish = true;
        break;
      case "--dir":
        args.dir = next();
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`unknown flag "${flag}"`);
    }
  }
  return args;
}

async function cmdCollect(): Promise<void> {
  console.log("Collecting from configured sources…");
  const res = await collectAll();
  console.log(`Scanned ${res.scanned} results → ${res.fresh.length} new item(s).`);
  for (const item of res.fresh) {
    console.log(`  + [${item.type}] ${item.title} — ${item.url}`);
  }
  if (res.failedSources.length) {
    console.warn(`Failed sources: ${res.failedSources.join(", ")}`);
  }
}

async function cmdGenerate(mode: DigestMode): Promise<string> {
  const days = mode === "weekly" ? 7 : 1;
  const items = itemsForGeneration(days);
  if (items.length === 0) {
    throw new Error(
      `No items collected in the last ${days} day(s). Run \`collect\` first.`,
    );
  }
  console.log(`Generating ${mode} drafts from ${items.length} item(s)…`);
  const drafts = await generateDrafts(items, mode);
  const out = writeDrafts(drafts, items);
  console.log(`Drafts written for review:`);
  for (const f of out.files) console.log(`  ${f}`);
  console.log(`\nReview them, then publish with:`);
  console.log(`  npm run publish -- --platforms x --dir ${out.dir} --publish`);
  return out.dir;
}

async function cmdPublish(
  platforms: Platform[],
  publishFlag: boolean,
  dir?: string,
): Promise<void> {
  const outcomes = await publish(platforms, { publish: publishFlag, outputDir: dir });
  for (const o of outcomes) {
    const icon =
      o.status === "posted" ? "✓" : o.status === "failed" ? "✗" : "•";
    console.log(`${icon} ${o.platform}: ${o.status} — ${o.detail}`);
  }
  if (outcomes.some((o) => o.status === "failed")) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  loadEnv();
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error(USAGE);
    process.exit(2);
  }
  if (args.help || args.command === "help") {
    console.log(USAGE);
    return;
  }

  switch (args.command) {
    case "collect":
      await cmdCollect();
      break;
    case "generate":
      await cmdGenerate(args.mode);
      break;
    case "publish":
      await cmdPublish(args.platforms, args.publish, args.dir);
      break;
    case "run": {
      await cmdCollect();
      const dir = await cmdGenerate(args.mode);
      if (args.publish) await cmdPublish(args.platforms, true, dir);
      break;
    }
    default:
      console.error(`Unknown command "${args.command}".\n${USAGE}`);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
