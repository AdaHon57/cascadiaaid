/** Shared types for the CascadiaAid RAG module. No runtime code lives here. */
import type {
  RecoveryEdgeType,
  RecoveryNodeDefinition,
  RecoveryNodeStatus,
} from "../../types/recovery-node.ts";

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/** Input to `askRecoveryQuestion`. */
export interface RagQuestionInput {
  /** The user's question, 1–1000 characters. */
  question: string;
  /** Optional recovery-workflow context describing where in the app the user is asking from. */
  context?: RagWorkflowContext;
}

/**
 * Where the user is in their recovery workflow. Everything is optional.
 *
 * Context helps retrieval ("what do I need for this step?") and tells the model which step the
 * question is about. It is never treated as a source: answers are still grounded only in the
 * approved pages, and context is never cited.
 */
export interface RagWorkflowContext {
  /** Recovery node ID, e.g. "insurance-claim". */
  nodeId?: string;
  /** Node title. Resolved from the workflow definitions when only `nodeId` is supplied. */
  nodeTitle?: string;
  nodeDescription?: string;
  /** Evidence labels shown in the app for this node (illustrative, not verified requirements). */
  requiredEvidence?: string[];
  /** Status calculated by the recovery status engine for this household. */
  status?: RecoveryNodeStatus;
  /** Direct prerequisites (incoming edges) of the node. */
  prerequisites?: RagContextRelatedNode[];
  /** Nodes that depend on this node (outgoing edges). */
  dependents?: RagContextRelatedNode[];
}

export interface RagContextRelatedNode {
  nodeId: string;
  title?: string;
  status?: RecoveryNodeStatus;
  edgeType?: RecoveryEdgeType;
}

/** Workflow data used to fill in context from just a node ID. */
export interface RagWorkflowDefinitions {
  nodes: readonly Pick<
    RecoveryNodeDefinition,
    "id" | "title" | "description" | "requiredEvidence"
  >[];
  edges?: readonly { from: string; to: string; type: RecoveryEdgeType }[];
}

export interface RagSourceCitation {
  title: string;
  url: string;
  /** Chunk IDs from this page that the answer actually used. */
  chunkIds: string[];
}

export type RagAnswerStatus = "answered" | "partial" | "not_found";

export interface RagAnswer {
  /**
   * answered  – the approved sources support the answer.
   * partial   – only part of the question is covered; the answer says what is missing.
   * not_found – the approved sources do not contain enough information.
   */
  status: RagAnswerStatus;
  /** Answer text. Inline markers like [1] refer to positions in `sources` (1-based). */
  answer: string;
  /** Deduplicated pages actually cited by the answer. Empty when status is not_found. */
  sources: RagSourceCitation[];
  /** Non-fatal problems, e.g. a source failed during the last index build. */
  warnings: string[];
  /** Only present when `includeRetrievedChunks` is requested. */
  retrievedChunks?: RetrievedChunk[];
}

// ---------------------------------------------------------------------------------------------
// Sources, chunks, index
// ---------------------------------------------------------------------------------------------

export interface SourceExtractionOptions {
  /** CSS selector for the main content container. Defaults to the innermost <main>/[role=main]. */
  contentSelector?: string;
  /** Extra CSS selectors to delete before extracting text. */
  removeSelectors?: string[];
  /** Headings (exact text, case-insensitive) whose whole section should be dropped. */
  dropSectionHeadings?: string[];
}

export interface ApprovedSource {
  /** Stable, unique slug. Used as the chunk-ID prefix. */
  id: string;
  /** Exact URL to download. Nothing else is fetched. */
  url: string;
  extraction?: SourceExtractionOptions;
}

/** One heading-delimited section of an extracted page. */
export interface PageSection {
  /** Heading trail, e.g. ["Wildfire Relief", "Driver licenses and ID cards"]. */
  headingPath: string[];
  /** Heading level of the last heading in the trail (1-6), or 0 for text before any heading. */
  level: number;
  /** Text blocks (paragraphs, list items, table rows) in document order. */
  blocks: string[];
}

export interface ExtractedPage {
  sourceId: string;
  sourceUrl: string;
  title: string;
  fetchedAt: string;
  sections: PageSection[];
}

export interface RagChunk {
  /** Stable ID: `<sourceId>:<content hash>`. Unchanged content keeps the same ID across rebuilds. */
  id: string;
  content: string;
  sourceUrl: string;
  sourceTitle: string;
  heading: string;
  fetchedAt: string;
}

export interface IndexedChunk extends RagChunk {
  embedding?: number[];
}

export type SourceIngestStatus = "ok" | "failed" | "stale";

export interface IndexedSourceRecord {
  id: string;
  url: string;
  title: string | null;
  status: SourceIngestStatus;
  /** When the chunks currently in the index for this source were fetched. */
  fetchedAt: string | null;
  chunkCount: number;
  /** Present when the most recent fetch/extract attempt failed. */
  error?: string;
}

export interface ChunkingOptions {
  /** Target upper bound on chunk length, in characters. */
  maxChars: number;
  /** Characters of trailing context repeated at the start of the next chunk in the same section. */
  overlapChars: number;
  /** Sections shorter than this are merged with following sections when they fit. */
  minChars: number;
}

export interface EmbeddingInfo {
  provider: string;
  model: string;
  dimensions: number;
}

export interface RagIndex {
  formatVersion: 1;
  builtAt: string;
  chunking: ChunkingOptions;
  /** null when the index was built without embeddings (keyword retrieval only). */
  embedding: EmbeddingInfo | null;
  sources: IndexedSourceRecord[];
  chunks: IndexedChunk[];
}

export interface RetrievedChunk extends RagChunk {
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  method: "hybrid" | "keyword";
  warnings: string[];
}
