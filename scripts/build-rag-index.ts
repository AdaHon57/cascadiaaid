/**
 * Build or rebuild the RAG index (data/rag-index.json) from the approved sources.
 *
 *   npm run rag:index
 *   npm run rag:index -- --allow-partial    write the index even if some sources fail
 *   npm run rag:index -- --no-embeddings    keyword retrieval only
 *   npm run rag:index -- --max-chars=1200 --overlap=150 --min-chars=300
 *
 * Exit code 1 if any source fails (unless --allow-partial) or if nothing could be indexed.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRagIndex } from "../lib/rag/index-format.ts";
import { buildIndex } from "../lib/rag/ingest/build-index.ts";
import { APPROVED_SOURCES } from "../lib/rag/sources.ts";
import type { RagIndex } from "../lib/rag/types.ts";
import { loadEnvFiles } from "./load-env.ts";

loadEnvFiles();

const INDEX_PATH = resolve("data", "rag-index.json");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const num = (name: string) => {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  return raw === undefined ? undefined : Number(raw);
};

function readPreviousIndex(): RagIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  try {
    return parseRagIndex(JSON.parse(readFileSync(INDEX_PATH, "utf8")));
  } catch (err) {
    console.warn(`Ignoring unreadable previous index: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  console.log(`Building RAG index from ${APPROVED_SOURCES.length} approved sources…`);
  const { index, failures } = await buildIndex({
    previousIndex: readPreviousIndex(),
    useEmbeddings: flag("no-embeddings") ? false : undefined,
    chunking: {
      ...(num("max-chars") !== undefined && { maxChars: num("max-chars") }),
      ...(num("overlap") !== undefined && { overlapChars: num("overlap") }),
      ...(num("min-chars") !== undefined && { minChars: num("min-chars") }),
    },
    onProgress: (m) => console.log(m),
  });

  console.log("\nSource report:");
  console.table(
    index.sources.map((s) => ({
      id: s.id,
      status: s.status,
      chunks: s.chunkCount,
      title: s.title ?? "",
      error: s.error ?? "",
    })),
  );

  if (index.chunks.length === 0) {
    console.error("\nERROR: no content could be indexed. The index was NOT written.");
    process.exit(1);
  }
  if (failures.length && !flag("allow-partial")) {
    console.error(`\nERROR: ${failures.length} source(s) failed:`);
    for (const f of failures) console.error(`  - ${f.url}\n    ${f.error}`);
    console.error("The index was NOT written. Fix the problem, or rerun with --allow-partial.");
    process.exit(1);
  }

  const tmp = `${INDEX_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(index)}\n`, "utf8");
  renameSync(tmp, INDEX_PATH);

  const mode = index.embedding
    ? `hybrid (${index.embedding.provider}/${index.embedding.model}, ${index.embedding.dimensions}d)`
    : "keyword (BM25) only";
  console.log(`\nWrote ${index.chunks.length} chunks to ${INDEX_PATH}`);
  console.log(`Retrieval mode: ${mode}`);
  console.log("The index is bundled into the app: rebuild/redeploy for changes to take effect.");
  if (failures.length) {
    console.warn(`WARNING: ${failures.length} source(s) failed (see report above).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
