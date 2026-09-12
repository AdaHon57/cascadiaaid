/**
 * Ingestion: scrape every approved source → chunk → (optionally) embed → assemble a RagIndex.
 * Node-only. Writing the index to disk is left to scripts/build-rag-index.ts.
 */
import {
  createEmbeddingProvider,
  embeddingTextForChunk,
  type EmbeddingProvider,
} from "../embeddings.ts";
import { APPROVED_SOURCES } from "../sources.ts";
import type {
  ApprovedSource,
  ChunkingOptions,
  IndexedChunk,
  IndexedSourceRecord,
  RagIndex,
} from "../types.ts";
import { chunkPage, resolveChunkingOptions } from "./chunk.ts";
import { scrapeSource, type FetchOptions } from "./scrape.ts";

export interface BuildIndexOptions {
  sources?: readonly ApprovedSource[];
  chunking?: Partial<ChunkingOptions>;
  /** Set false to skip embeddings (keyword retrieval only). Default: embed when an OpenAI key is set. */
  useEmbeddings?: boolean;
  /** Override the configured provider (mainly for tests). */
  embeddingProvider?: EmbeddingProvider | null;
  /** Previous index, used to keep a failed source's last good chunks and to reuse embeddings. */
  previousIndex?: RagIndex | null;
  fetchOptions?: FetchOptions;
  onProgress?: (message: string) => void;
}

export interface SourceFailure {
  sourceId: string;
  url: string;
  error: string;
  /** True when the previous index's chunks for this source were kept. */
  keptPreviousChunks: boolean;
}

export interface BuildIndexReport {
  index: RagIndex;
  failures: SourceFailure[];
}

export async function buildIndex(options: BuildIndexOptions = {}): Promise<BuildIndexReport> {
  const sources = options.sources ?? APPROVED_SOURCES;
  const chunking = resolveChunkingOptions(options.chunking);
  const log = options.onProgress ?? (() => {});
  const previous = options.previousIndex ?? null;

  assertUniqueSources(sources);

  const results = await Promise.all(
    sources.map(async (source) => {
      log(`Fetching ${source.url}`);
      return { source, result: await scrapeSource(source, options.fetchOptions) };
    }),
  );

  const chunks: IndexedChunk[] = [];
  const records: IndexedSourceRecord[] = [];
  const failures: SourceFailure[] = [];

  for (const { source, result } of results) {
    if (result.ok) {
      const pageChunks = chunkPage(result.page, chunking);
      chunks.push(...pageChunks);
      records.push({
        id: source.id,
        url: source.url,
        title: result.page.title,
        status: "ok",
        fetchedAt: result.page.fetchedAt,
        chunkCount: pageChunks.length,
      });
      log(`  ✓ ${source.id}: "${result.page.title}" → ${pageChunks.length} chunks`);
      continue;
    }

    const kept = previous?.chunks.filter((c) => c.sourceUrl === source.url) ?? [];
    const prevRecord = previous?.sources.find((s) => s.url === source.url);
    chunks.push(
      ...kept.map((c) => ({
        id: c.id,
        content: c.content,
        sourceUrl: c.sourceUrl,
        sourceTitle: c.sourceTitle,
        heading: c.heading,
        fetchedAt: c.fetchedAt,
      })),
    );
    records.push({
      id: source.id,
      url: source.url,
      title: prevRecord?.title ?? null,
      status: kept.length ? "stale" : "failed",
      fetchedAt: kept.length ? (prevRecord?.fetchedAt ?? null) : null,
      chunkCount: kept.length,
      error: result.error,
    });
    failures.push({
      sourceId: source.id,
      url: source.url,
      error: result.error,
      keptPreviousChunks: kept.length > 0,
    });
    log(
      `  ✗ ${source.id}: ${result.error}${kept.length ? ` (kept ${kept.length} chunks from previous index)` : ""}`,
    );
  }

  const provider =
    options.useEmbeddings === false
      ? null
      : options.embeddingProvider !== undefined
        ? options.embeddingProvider
        : createEmbeddingProvider();

  let embedding: RagIndex["embedding"] = null;
  if (provider && chunks.length) {
    embedding = await embedChunks(chunks, provider, previous, log);
  } else {
    log("No embedding provider configured: index will use keyword (BM25) retrieval only.");
  }

  return {
    index: {
      formatVersion: 1,
      builtAt: new Date().toISOString(),
      chunking,
      embedding,
      sources: records,
      chunks,
    },
    failures,
  };
}

async function embedChunks(
  chunks: IndexedChunk[],
  provider: EmbeddingProvider,
  previous: RagIndex | null,
  log: (message: string) => void,
): Promise<NonNullable<RagIndex["embedding"]>> {
  // Chunk IDs are content hashes, so an unchanged chunk can reuse its previous vector.
  const reusable = new Map<string, number[]>();
  const prev = previous?.embedding;
  if (
    prev?.provider === provider.name &&
    prev.model === provider.model &&
    prev.dimensions === provider.dimensions
  ) {
    for (const c of previous!.chunks) if (c.embedding) reusable.set(c.id, c.embedding);
  }
  const todo = chunks.filter((c) => !reusable.has(c.id));
  log(
    `Embedding ${todo.length} chunks with ${provider.name}/${provider.model} (${provider.dimensions}d, ${chunks.length - todo.length} reused)`,
  );

  const vectors = await provider.embed(todo.map(embeddingTextForChunk));
  todo.forEach((c, i) => reusable.set(c.id, vectors[i]));
  for (const c of chunks) {
    c.embedding = reusable.get(c.id)!.map((x) => Math.round(x * 1e5) / 1e5);
  }
  return { provider: provider.name, model: provider.model, dimensions: provider.dimensions };
}

function assertUniqueSources(sources: readonly ApprovedSource[]): void {
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const s of sources) {
    if (ids.has(s.id)) throw new Error(`Duplicate source id in allowlist: ${s.id}`);
    if (urls.has(s.url)) throw new Error(`Duplicate source url in allowlist: ${s.url}`);
    ids.add(s.id);
    urls.add(s.url);
  }
}
