/** Shared OpenAI client for the answer model and embeddings. Server-side only. */
import OpenAI from "openai";
import { readEnv } from "./config.ts";
import { RagError } from "./errors.ts";

const clients = new Map<string, OpenAI>();

/** Resolve the API key: an explicit value wins, otherwise OPENAI_API_KEY. */
export function resolveOpenAIKey(explicitKey?: string): string | undefined {
  return explicitKey || readEnv("OPENAI_API_KEY");
}

export function getOpenAIClient(explicitKey?: string): OpenAI {
  const apiKey = resolveOpenAIKey(explicitKey);
  if (!apiKey) {
    throw new RagError(
      "MODEL_NOT_CONFIGURED",
      "OPENAI_API_KEY is not set. Add it to .env.local (or the hosting environment's secrets).",
    );
  }
  let client = clients.get(apiKey);
  if (!client) {
    client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
    clients.set(apiKey, client);
  }
  return client;
}
