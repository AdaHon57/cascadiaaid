/**
 * Retrieval over the prebuilt index.
 *
 * - Keyword: BM25 over title + heading + content (always available, no API key needed).
 * - Vector: cosine similarity against stored OpenAI embeddings (when the index has embeddings
 *   and an OpenAI key is available at query time).
 * - When both are available the rankings are combined with reciprocal rank fusion (RRF).
 */
import { getBundledIndex } from "./bundled-index.ts";
import { getRagConfig } from "./config.ts";
import { cosineSimilarity, createEmbeddingProvider, type EmbeddingProvider } from "./embeddings.ts";
import { errorMessage, RagError } from "./errors.ts";
import { APPROVED_SOURCES, isApprovedSourceUrl } from "./sources.ts";
import type { IndexedChunk, RagIndex, RetrievalResult, RetrievedChunk } from "./types.ts";

export interface RetrieveOptions {
  topK?: number;
  maxChunksPerSource?: number;
  /** Extra text (e.g. the current workflow step) that biases retrieval at lower weight. */
  contextText?: string;
  /** Provide an index directly instead of using the bundled one. */
  index?: RagIndex;
  /** Override the query-time embedding provider (null forces keyword-only retrieval). */
  embeddingProvider?: EmbeddingProvider | null;
  openaiApiKey?: string;
}

const RRF_K = 60;

export async function retrieve(
  question: string,
  options: RetrieveOptions = {},
): Promise<RetrievalResult> {
  const config = getRagConfig();
  const topK = options.topK ?? config.topK;
  const maxPerSource = options.maxChunksPerSource ?? config.maxChunksPerSource;
  const index = options.index ?? getBundledIndex();
  const contextText = options.contextText?.trim() ?? "";

  try {
    const warnings = indexWarnings(index);
    const chunks = index.chunks.filter((c) => isApprovedSourceUrl(c.sourceUrl));
    if (chunks.length < index.chunks.length) {
      warnings.push(
        `${index.chunks.length - chunks.length} indexed passages come from pages no longer in the approved source list and were ignored.`,
      );
    }
    if (chunks.length === 0) return { chunks: [], method: "keyword", warnings };

    const rankings: Map<string, number>[] = [];
    rankings.push(toRankMap(getBm25(chunks).search(question, contextText)));

    let method: RetrievalResult["method"] = "keyword";
    const vectorQuery = contextText
      ? `${question}\n\nCurrent recovery step: ${contextText}`
      : question;
    const vector = await vectorSearch(vectorQuery, chunks, index, options, warnings);
    if (vector) {
      rankings.push(toRankMap(vector));
      method = "hybrid";
    }

    const fused = new Map<string, number>();
    for (const ranking of rankings) {
      for (const [id, rank] of ranking) fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + rank));
    }

    const byId = new Map(chunks.map((c) => [c.id, c]));
    const perSource = new Map<string, number>();
    const selected: RetrievedChunk[] = [];
    for (const [id, score] of [...fused].sort((a, b) => b[1] - a[1])) {
      const chunk = byId.get(id)!;
      const count = perSource.get(chunk.sourceUrl) ?? 0;
      if (count >= maxPerSource) continue;
      perSource.set(chunk.sourceUrl, count + 1);
      selected.push({
        id: chunk.id,
        content: chunk.content,
        sourceUrl: chunk.sourceUrl,
        sourceTitle: chunk.sourceTitle,
        heading: chunk.heading,
        fetchedAt: chunk.fetchedAt,
        score: Number(score.toFixed(6)),
      });
      if (selected.length >= topK) break;
    }
    return { chunks: selected, method, warnings };
  } catch (err) {
    if (err instanceof RagError) throw err;
    throw new RagError("RETRIEVAL_FAILED", `Retrieval failed: ${errorMessage(err)}`, {
      cause: err,
    });
  }
}

function indexWarnings(index: RagIndex): string[] {
  const warnings: string[] = [];
  for (const s of index.sources) {
    if (!isApprovedSourceUrl(s.url)) continue;
    if (s.status === "failed") {
      warnings.push(
        `Approved source could not be ingested and is missing from the knowledge base: ${s.url} (${s.error ?? "unknown error"})`,
      );
    } else if (s.status === "stale") {
      warnings.push(
        `Approved source failed to refresh; using content fetched ${s.fetchedAt}: ${s.url}`,
      );
    }
  }
  const indexed = new Set(index.sources.map((s) => s.url));
  for (const s of APPROVED_SOURCES) {
    if (!indexed.has(s.url)) {
      warnings.push(`Approved source is not in the index yet (rebuild needed): ${s.url}`);
    }
  }
  return warnings;
}

async function vectorSearch(
  query: string,
  chunks: IndexedChunk[],
  index: RagIndex,
  options: RetrieveOptions,
  warnings: string[],
): Promise<{ id: string; score: number }[] | null> {
  if (!index.embedding || !chunks.some((c) => c.embedding)) return null;

  let provider: EmbeddingProvider | null;
  try {
    provider =
      options.embeddingProvider !== undefined
        ? options.embeddingProvider
        : createEmbeddingProvider({
            openaiApiKey: options.openaiApiKey,
            model: index.embedding.model,
            dimensions: index.embedding.dimensions,
          });
  } catch (err) {
    warnings.push(
      `Embedding provider misconfigured; used keyword search only (${errorMessage(err)}).`,
    );
    return null;
  }
  if (!provider) {
    warnings.push(
      "Index has embeddings but no embedding API key is configured; used keyword search only.",
    );
    return null;
  }
  if (
    provider.name !== index.embedding.provider ||
    provider.model !== index.embedding.model ||
    provider.dimensions !== index.embedding.dimensions
  ) {
    warnings.push(
      `Index was embedded with ${index.embedding.provider}/${index.embedding.model} (${index.embedding.dimensions}d) but ${provider.name}/${provider.model} (${provider.dimensions}d) is configured; used keyword search only. Rebuild the index.`,
    );
    return null;
  }

  let queryVector: number[];
  try {
    [queryVector] = await provider.embed([query]);
  } catch (err) {
    warnings.push(`Query embedding failed; used keyword search only (${errorMessage(err)}).`);
    return null;
  }
  return chunks
    .filter((c) => c.embedding)
    .map((c) => ({ id: c.id, score: cosineSimilarity(queryVector, c.embedding!) }))
    .sort((a, b) => b.score - a.score);
}

function toRankMap(results: { id: string }[]): Map<string, number> {
  return new Map(results.map((r, i) => [r.id, i + 1]));
}

// ---------------------------------------------------------------------------------------------
// BM25
// ---------------------------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "a about after also am an and any are as at be been before being but by can could did do does " +
    "for from get got had has have how i if in into is it its just me might my of on or our should so " +
    "than that the their them then there these they this those to up was we were what when where " +
    "which who whom why will with would you your"
  ).split(" "),
);

/**
 * Keyword search can't see that "free" and "no-charge" mean the same thing (vector search can).
 * These expansions are added to the query at half weight. Keep them generic; they only affect
 * ranking, never what content is available to the answer model.
 */
const QUERY_EXPANSIONS: Record<string, string[]> = {
  free: ["no-charge", "no cost", "waived"],
  cost: ["fee", "charge"],
  save: ["keep", "copies", "receipts", "documentation"],
  document: ["documentation", "receipts", "records"],
  cleanup: ["removal", "remove", "disposal"],
  clean: ["removal", "remove", "disposal"],
  money: ["cash", "financial", "assistance"],
  help: ["assistance", "support"],
  aid: ["assistance"],
  rebuild: ["rebuilding", "permit", "demolition"],
  tax: ["abatement", "assessed"],
  replace: ["replacement"],
  lost: ["destroyed", "damaged"],
  burned: ["destroyed", "damaged", "fire"],
};

function queryTermWeights(query: string, contextText = ""): Map<string, number> {
  const weights = new Map<string, number>();
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
  for (const term of tokenize(query)) weights.set(term, 1);
  for (const word of words) {
    for (const expansion of QUERY_EXPANSIONS[word] ??
      QUERY_EXPANSIONS[word.replace(/s$/, "")] ??
      []) {
      for (const term of tokenize(expansion)) if (!weights.has(term)) weights.set(term, 0.5);
    }
  }
  // Workflow context narrows the topic without outweighing the user's own words.
  for (const term of tokenize(contextText)) if (!weights.has(term)) weights.set(term, 0.5);
  return weights;
}

/** Lowercase, split on non-alphanumerics, drop stopwords, and apply light suffix stemming. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function stem(token: string): string {
  let t = token;
  if (/^\d+$/.test(t)) return t;
  if (t.length > 4 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.endsWith("sses")) t = t.slice(0, -2);
  else if (/(x|ch|sh|z)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  if (t.length > 3 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

const K1 = 1.2;
const B = 0.75;

class Bm25 {
  private readonly docs: { id: string; tf: Map<string, number>; length: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLength: number;

  constructor(chunks: IndexedChunk[]) {
    this.docs = chunks.map((c) => {
      // Title and heading are repeated so they weigh a little more than body text.
      const tokens = tokenize(`${c.sourceTitle} ${c.heading} ${c.heading} ${c.content}`);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { id: c.id, tf, length: tokens.length };
    });
    this.avgLength = this.docs.reduce((n, d) => n + d.length, 0) / Math.max(this.docs.length, 1);
  }

  search(query: string, contextText = ""): { id: string; score: number }[] {
    const terms = queryTermWeights(query, contextText);
    const n = this.docs.length;
    const results: { id: string; score: number }[] = [];
    for (const doc of this.docs) {
      let score = 0;
      for (const [term, weight] of terms) {
        const f = doc.tf.get(term);
        if (!f) continue;
        const df = this.df.get(term)!;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score +=
          (weight * idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.length) / this.avgLength));
      }
      if (score > 0) results.push({ id: doc.id, score });
    }
    return results.sort((a, b) => b.score - a.score);
  }
}

let bm25Cache: { key: string; bm25: Bm25 } | null = null;

/** Reuse the BM25 statistics while the set of chunks is unchanged (i.e. until the index is rebuilt). */
function getBm25(chunks: IndexedChunk[]): Bm25 {
  const key = chunks.map((c) => c.id).join("|");
  if (bm25Cache?.key !== key) bm25Cache = { key, bm25: new Bm25(chunks) };
  return bm25Cache.bm25;
}
