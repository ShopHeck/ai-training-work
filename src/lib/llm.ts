import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env, envRequired } from "./env.js";

/**
 * Thin wrapper over the configured LLM provider so the rest of the codebase
 * never talks SDK specifics. Provider is chosen by LLM_PROVIDER
 * ("anthropic" default, "openai" alternative).
 */

export interface CompletionOptions {
  /** Ask the provider for strict JSON output. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  complete(system: string, user: string, opts?: CompletionOptions): Promise<string>;
}

const DEFAULT_MAX_TOKENS = 8192;

function createAnthropicClient(): LlmClient {
  const client = new Anthropic({ apiKey: envRequired("ANTHROPIC_API_KEY") });
  const model = env("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
  return {
    provider: "anthropic",
    model,
    async complete(system, user, opts = {}) {
      const res = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? 0.7,
        system,
        messages: [{ role: "user", content: user }],
      });
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    },
  };
}

function createOpenAiClient(): LlmClient {
  const client = new OpenAI({ apiKey: envRequired("OPENAI_API_KEY") });
  const model = env("OPENAI_MODEL") ?? "gpt-5-mini";
  return {
    provider: "openai",
    model,
    async complete(system, user, opts = {}) {
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

export function createLlm(): LlmClient {
  const provider = (env("LLM_PROVIDER") ?? "anthropic").toLowerCase();
  switch (provider) {
    case "anthropic":
      return createAnthropicClient();
    case "openai":
      return createOpenAiClient();
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${provider}". Expected "anthropic" or "openai".`,
      );
  }
}

/** Extract the first JSON object from an LLM reply (handles ```json fences). */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM response did not contain a JSON object");
  }
  return candidate.slice(start, end + 1);
}
