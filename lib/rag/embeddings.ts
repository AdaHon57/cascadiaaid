/**
 * Embedding provider abstraction.
 *
 * Everything outside this file depends only on the `EmbeddingProvider` interface. The built-in
 * provider is OpenAI; to add another, implement the interface and return it from
 * `createEmbeddingProvider`.
 *
 * Embeddings are optional: with no provider configured, retrieval uses keyword (BM25) search.
 */
import { getRagConfig } from "./config.ts";
import { errorMessage, RagError } from "./errors.ts";
import { getOpenAIClient, resolveOpenAIKey } from "./openai-client.ts";

export interface EmbeddingProvider {
  /** Provider name recorded in the index, e.g. "openai". */
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface CreateEmbeddingProviderOptions {
  openaiApiKey?: string;
  /** Override the configured model (used to match an existing index). */
  model?: string;
  /** Override the configured vector size (used to match an existing index). */
  dimensions?: number;
}

const BATCH_SIZE = 64;

/**
 * Resolve the configured provider, or null when embeddings are disabled.
 * RAG_EMBEDDING_PROVIDER=auto (default) uses OpenAI when an API key is available.
 */
export function createEmbeddingProvider(
  options: CreateEmbeddingProviderOptions = {},
): EmbeddingProvider | null {
  const config = getRagConfig();
  if (config.embeddingProvider === "none") return null;
  const apiKey = resolveOpenAIKey(options.openaiApiKey);
  if (!apiKey) {
    if (config.embeddingProvider === "openai") {
      throw new RagError(
        "EMBEDDING_FAILED",
        "RAG_EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set",
      );
    }
    return null;
  }
  return new OpenAIEmbeddingProvider(
    apiKey,
    options.model ?? config.embeddingModel,
    options.dimensions ?? config.embeddingDimensions,
  );
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string, dimensions: number) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const client = getOpenAIClient(this.apiKey);
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      try {
        const res = await client.embeddings.create({
          model: this.model,
          input: batch,
          dimensions: this.dimensions,
        });
        if (res.data.length !== batch.length) {
          throw new Error("unexpected number of embeddings returned");
        }
        out.push(...[...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
      } catch (err) {
        throw new RagError(
          "EMBEDDING_FAILED",
          `OpenAI embeddings request failed: ${errorMessage(err)}`,
          { cause: err },
        );
      }
    }
    return out;
  }
}

/** Text that represents a chunk for embedding: page title and heading give the passage context. */
export function embeddingTextForChunk(chunk: {
  sourceTitle: string;
  heading: string;
  content: string;
}): string {
  return `${chunk.sourceTitle}\n${chunk.heading}\n\n${chunk.content}`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
