/**
 * Public API of the CascadiaAid RAG module. Server-side only: never import this from a client
 * component (it reads the OpenAI key from the environment).
 *
 *   const result = await askRecoveryQuestion({
 *     question: "What should I save for my claim?",
 *     context: { nodeId: "insurance-claim", status: "READY" },
 *   }, { workflow: { nodes: recoveryNodes, edges: recoveryEdges } });
 */
export {
  askRecoveryQuestion,
  NOT_FOUND_ANSWER,
  type AskRecoveryQuestionOptions,
} from "./answer.ts";
export { RagError, type RagErrorCode } from "./errors.ts";
export type {
  RagAnswer,
  RagAnswerStatus,
  RagContextRelatedNode,
  RagQuestionInput,
  RagSourceCitation,
  RagWorkflowContext,
  RagWorkflowDefinitions,
} from "./types.ts";
