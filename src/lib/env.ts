import { config as loadDotenv } from "dotenv";

let loaded = false;

/** Load .env once. Safe to call from every entrypoint. */
export function loadEnv(): void {
  if (loaded) return;
  loadDotenv({ quiet: true });
  loaded = true;
}

export function env(name: string): string | undefined {
  loadEnv();
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function envRequired(name: string): string {
  const v = env(name);
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v;
}

export function envBool(name: string, fallback = false): boolean {
  const v = env(name);
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}
