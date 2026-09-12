/**
 * The prebuilt index, bundled with the app as a JSON module.
 *
 * The app runs as a Cloudflare Worker, which has no filesystem at request time, so the index is
 * imported rather than read from disk. Rebuild it with `npm run rag:index` and redeploy.
 */
import rawIndex from "../../data/rag-index.json" with { type: "json" };
import { parseRagIndex } from "./index-format.ts";
import type { RagIndex } from "./types.ts";

let cached: RagIndex | null = null;

export function getBundledIndex(): RagIndex {
  cached ??= parseRagIndex(rawIndex);
  return cached;
}
