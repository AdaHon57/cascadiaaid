// Provider configuration and error mapping. No network: requests fail before being sent.
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { getRagConfig } from "../lib/rag/config.ts";
import { createEmbeddingProvider } from "../lib/rag/embeddings.ts";
import { RagError } from "../lib/rag/errors.ts";
import { parseRagIndex } from "../lib/rag/index-format.ts";
import { createAnswerModel } from "../lib/rag/llm.ts";
import { makeIndex } from "./rag-fixtures.mjs";

const KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "RAG_ANSWER_MODEL",
  "RAG_ANSWER_TEMPERATURE",
  "RAG_EMBEDDING_PROVIDER",
  "RAG_EMBEDDING_MODEL",
  "RAG_EMBEDDING_DIMENSIONS",
];
let saved = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("answer model fails with MODEL_NOT_CONFIGURED before any request when no key is set", async () => {
  await assert.rejects(
    createAnswerModel().generateJson({ system: "s", prompt: "p", schemaName: "x", schema: {} }),
    (e) => e instanceof RagError && e.code === "MODEL_NOT_CONFIGURED" && e.httpStatus === 500,
  );
});

test("answer model uses RAG_ANSWER_MODEL, then OPENAI_MODEL, then gpt-4o-mini", () => {
  assert.equal(getRagConfig().answerModel, "gpt-4o-mini");
  process.env.OPENAI_MODEL = "shared-model";
  assert.equal(getRagConfig().answerModel, "shared-model");
  process.env.RAG_ANSWER_MODEL = "rag-model";
  assert.equal(createAnswerModel().name, "openai/rag-model");
  assert.equal(getRagConfig().answerTemperature, 0);
  process.env.RAG_ANSWER_TEMPERATURE = "none";
  assert.equal(getRagConfig().answerTemperature, undefined);
});

test("OpenAI embeddings turn on only when a key is available", () => {
  assert.equal(createEmbeddingProvider(), null);
  const explicit = createEmbeddingProvider({ openaiApiKey: "sk-test", dimensions: 256 });
  assert.equal(explicit.name, "openai");
  assert.equal(explicit.model, "text-embedding-3-small");
  assert.equal(explicit.dimensions, 256);

  process.env.OPENAI_API_KEY = "sk-test";
  assert.equal(createEmbeddingProvider().dimensions, 512);
  process.env.RAG_EMBEDDING_PROVIDER = "none";
  assert.equal(createEmbeddingProvider(), null);

  delete process.env.OPENAI_API_KEY;
  process.env.RAG_EMBEDDING_PROVIDER = "openai";
  assert.throws(
    () => createEmbeddingProvider(),
    (e) => e instanceof RagError && e.code === "EMBEDDING_FAILED",
  );
});

test("index validation accepts a valid index and rejects malformed ones", () => {
  assert.ok(parseRagIndex(makeIndex()));
  for (const broken of [
    null,
    { ...makeIndex(), formatVersion: 2 },
    { ...makeIndex(), chunks: [{ id: 1 }] },
  ]) {
    assert.throws(
      () => parseRagIndex(broken),
      (e) => e instanceof RagError && e.code === "INDEX_INVALID",
    );
  }
});
