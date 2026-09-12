/** Validation for the index file, shared by the runtime loader and the build script. */
import { RagError } from "./errors.ts";
import type { RagIndex } from "./types.ts";

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Check the shape of an index object and return it typed. Throws INDEX_INVALID. */
export function parseRagIndex(data: unknown): RagIndex {
  const fail = (detail: string): never => {
    throw new RagError("INDEX_INVALID", `RAG index has an unexpected format: ${detail}`);
  };
  if (!isObject(data)) fail("not an object");
  const index = data as Record<string, unknown>;
  if (index.formatVersion !== 1) fail("formatVersion must be 1");
  if (!isString(index.builtAt)) fail("builtAt");
  const chunking = index.chunking;
  if (
    !isObject(chunking) ||
    !isNumber(chunking.maxChars) ||
    !isNumber(chunking.overlapChars) ||
    !isNumber(chunking.minChars)
  ) {
    fail("chunking");
  }
  const embedding = index.embedding;
  if (
    embedding !== null &&
    (!isObject(embedding) ||
      !isString(embedding.provider) ||
      !isString(embedding.model) ||
      !isNumber(embedding.dimensions))
  ) {
    fail("embedding");
  }
  if (!Array.isArray(index.sources)) fail("sources");
  (index.sources as unknown[]).forEach((s, i) => {
    if (
      !isObject(s) ||
      !isString(s.id) ||
      !isString(s.url) ||
      !["ok", "failed", "stale"].includes(s.status as string) ||
      !isNumber(s.chunkCount)
    ) {
      fail(`sources[${i}]`);
    }
  });
  if (!Array.isArray(index.chunks)) fail("chunks");
  (index.chunks as unknown[]).forEach((c, i) => {
    if (
      !isObject(c) ||
      !isString(c.id) ||
      !isString(c.content) ||
      !isString(c.sourceUrl) ||
      !isString(c.sourceTitle) ||
      !isString(c.heading) ||
      !isString(c.fetchedAt) ||
      (c.embedding !== undefined && !Array.isArray(c.embedding))
    ) {
      fail(`chunks[${i}]`);
    }
  });
  return data as RagIndex;
}
