/**
 * Runtime configuration, read from environment variables on demand (server-side only).
 * Works in Node and in the Cloudflare Worker runtime (with nodejs_compat, `process.env` holds the
 * Worker's variables and secrets).
 */
import type { ChunkingOptions } from "./types.ts";

export const DEFAULT_CHUNKING: ChunkingOptions = {
  maxChars: 1500,
  overlapChars: 200,
  minChars: 300,
};

export const MAX_QUESTION_CHARS = 1000;

export interface RagConfig {
  /** Number of passages given to the answer model. */
  topK: number;
  /** At most this many passages from any single page (keeps multi-source questions balanced). */
  maxChunksPerSource: number;
  /** OpenAI chat model used to write answers. */
  answerModel: string;
  /** Sampling temperature; undefined means "don't send it" (required by some reasoning models). */
  answerTemperature: number | undefined;
  /** "auto" uses OpenAI embeddings when OPENAI_API_KEY is set; "none" disables embeddings. */
  embeddingProvider: "auto" | "openai" | "none";
  embeddingModel: string;
  /** Vector size requested when building the index (smaller keeps the bundled index small). */
  embeddingDimensions: number;
}

export function readEnv(name: string): string | undefined {
  const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return value || undefined;
}

function intFromEnv(name: string, fallback: number): number {
  const n = Number.parseInt(readEnv(name) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getRagConfig(): RagConfig {
  const provider = readEnv("RAG_EMBEDDING_PROVIDER");
  const temperature = readEnv("RAG_ANSWER_TEMPERATURE");
  return {
    topK: intFromEnv("RAG_TOP_K", 6),
    maxChunksPerSource: intFromEnv("RAG_MAX_CHUNKS_PER_SOURCE", 3),
    answerModel: readEnv("RAG_ANSWER_MODEL") ?? readEnv("OPENAI_MODEL") ?? "gpt-4o-mini",
    answerTemperature:
      temperature === "none"
        ? undefined
        : temperature !== undefined && Number.isFinite(Number(temperature))
          ? Number(temperature)
          : 0,
    embeddingProvider: provider === "openai" || provider === "none" ? provider : "auto",
    embeddingModel: readEnv("RAG_EMBEDDING_MODEL") ?? "text-embedding-3-small",
    embeddingDimensions: intFromEnv("RAG_EMBEDDING_DIMENSIONS", 512),
  };
}
