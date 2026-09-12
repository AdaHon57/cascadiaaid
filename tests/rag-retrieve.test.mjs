import assert from "node:assert/strict";
import test from "node:test";
import { getBundledIndex } from "../lib/rag/bundled-index.ts";
import { retrieve, tokenize } from "../lib/rag/retrieve.ts";
import { APPROVED_SOURCES } from "../lib/rag/sources.ts";
import { CHUNKS, DOL_URL, DOR_URL, OIC_URL, makeIndex } from "./rag-fixtures.mjs";

const index = makeIndex();
const keyword = { index, embeddingProvider: null };

test("keyword retrieval ranks the directly relevant passage first with full metadata", async () => {
  const r = await retrieve("Can I replace my driver's license for free?", keyword);
  assert.equal(r.method, "keyword");
  assert.equal(r.chunks[0].id, "dol-wildfire-relief:aaa");
  assert.equal(r.chunks[0].sourceUrl, DOL_URL);
  for (const field of ["heading", "sourceTitle", "fetchedAt", "content"])
    assert.ok(r.chunks[0][field]);
  assert.ok(!("embedding" in r.chunks[0]));
});

test("query expansion finds passages that use different wording", async () => {
  const r = await retrieve("What should I save for my insurance claim?", { ...keyword, topK: 2 });
  assert.equal(r.chunks[0].sourceUrl, OIC_URL);
});

test("multi-part questions retrieve passages from several sources", async () => {
  const r = await retrieve(
    "Does destroyed property get property tax abatement, and what receipts should I keep for insurance?",
    keyword,
  );
  const urls = new Set(r.chunks.map((c) => c.sourceUrl));
  assert.ok(urls.has(DOR_URL) && urls.has(OIC_URL));
});

test("context text biases ranking without replacing the question", async () => {
  const without = await retrieve("What do I need?", { ...keyword, topK: 1 });
  assert.equal(without.chunks.length, 0);
  const withContext = await retrieve("What do I need?", {
    ...keyword,
    topK: 1,
    contextText:
      "Property-tax relief. Record a possible request for property-tax relief after damage.",
  });
  assert.equal(withContext.chunks[0].sourceUrl, DOR_URL);
});

test("returns nothing when no passage shares a term, and respects topK and per-source caps", async () => {
  assert.equal((await retrieve("xylophone zebra quantum", keyword)).chunks.length, 0);
  const r = await retrieve("no-charge replacement wildfire", {
    ...keyword,
    maxChunksPerSource: 1,
    topK: 3,
  });
  assert.ok(r.chunks.length <= 3);
  assert.equal(r.chunks.filter((c) => c.sourceUrl === DOL_URL).length, 1);
});

test("ignores chunks from non-approved pages and warns about failed or stale sources", async () => {
  const rogue = { ...CHUNKS[0], id: "rogue:1", sourceUrl: "https://example.com/not-approved" };
  const r = await retrieve("driver license replacement", {
    index: makeIndex([...CHUNKS, rogue]),
    embeddingProvider: null,
  });
  assert.ok(r.chunks.every((c) => c.sourceUrl !== rogue.sourceUrl));
  assert.ok(r.warnings.some((w) => w.includes("no longer in the approved source list")));

  const stale = makeIndex();
  stale.sources[0] = { ...stale.sources[0], status: "stale", error: "HTTP 503" };
  const r2 = await retrieve("driver license", { index: stale, embeddingProvider: null });
  assert.ok(r2.warnings.some((w) => w.includes("failed to refresh")));
});

test("hybrid retrieval fuses vector and keyword rankings, with keyword fallback", async () => {
  const topics = ["license", "tax", "claim", "hazardous"];
  const embedText = (t) => topics.map((k) => (t.toLowerCase().includes(k) ? 1 : 0.01));
  const provider = {
    name: "fake",
    model: "fake-1",
    dimensions: topics.length,
    embed: async (texts) => texts.map(embedText),
  };
  const chunks = CHUNKS.map((c) => ({ ...c, embedding: embedText(`${c.heading} ${c.content}`) }));
  const hybridIndex = makeIndex(chunks, {
    embedding: { provider: "fake", model: "fake-1", dimensions: topics.length },
  });

  const r = await retrieve("claim", { index: hybridIndex, embeddingProvider: provider, topK: 3 });
  assert.equal(r.method, "hybrid");
  assert.equal(r.chunks[0].sourceUrl, OIC_URL);
  assert.ok(r.chunks.every((c) => !("embedding" in c)));

  const mismatch = await retrieve("insurance claim", {
    index: hybridIndex,
    embeddingProvider: { ...provider, dimensions: 99 },
  });
  assert.equal(mismatch.method, "keyword");
  assert.ok(mismatch.warnings.some((w) => w.includes("Rebuild the index")));

  const failing = {
    ...provider,
    embed: async () => {
      throw new Error("boom");
    },
  };
  const failed = await retrieve("insurance claim", {
    index: hybridIndex,
    embeddingProvider: failing,
  });
  assert.equal(failed.method, "keyword");
  assert.ok(failed.warnings.some((w) => w.includes("boom")));
});

test("tokenize normalizes possessives, plurals, and verb forms", () => {
  assert.deepEqual(tokenize("driver's licenses"), tokenize("driver license"));
  assert.deepEqual(tokenize("damaged"), tokenize("damage"));
  assert.deepEqual(tokenize("rebuilding"), tokenize("rebuild"));
});

test("the bundled index is valid and covers every approved source", () => {
  const bundled = getBundledIndex();
  assert.equal(bundled.formatVersion, 1);
  const indexed = new Map(bundled.sources.map((s) => [s.url, s]));
  for (const source of APPROVED_SOURCES) {
    assert.equal(indexed.get(source.url)?.status, "ok", source.url);
    assert.ok(
      bundled.chunks.some((c) => c.sourceUrl === source.url),
      source.url,
    );
  }
  if (bundled.embedding) {
    for (const c of bundled.chunks) assert.equal(c.embedding?.length, bundled.embedding.dimensions);
  }
});
