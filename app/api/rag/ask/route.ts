/**
 * POST /api/rag/ask
 *
 * Body:
 *   {
 *     "question": "What should I keep track of for this step?",
 *     "context": { "nodeId": "insurance-claim", "status": "READY" }   // optional
 *   }
 *
 * Response: { "status", "answer", "sources": [{ "title", "url", "chunkIds" }], "warnings" }
 * Errors:   { "error": { "code", "message" } } with an appropriate HTTP status.
 *
 * When only `context.nodeId` is given, the node's title, description, evidence labels, and
 * direct relationships are filled in from the workflow definitions. Statuses are never
 * calculated here; pass the value from the recovery status engine if you have one.
 */
import { recoveryEdges } from "@/data/recovery-edges";
import { recoveryNodes } from "@/data/recovery-nodes";
import { askRecoveryQuestion, RagError, type RagWorkflowContext } from "@/lib/rag";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "INVALID_JSON",
      'Request body must be JSON like {"question": "..."}.',
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse(
      400,
      "INVALID_QUESTION",
      'Request body must be an object like {"question": "..."}.',
    );
  }

  const { question, context } = body as { question?: unknown; context?: unknown };
  if (typeof question !== "string") {
    return errorResponse(
      400,
      "INVALID_QUESTION",
      'Field "question" is required and must be a string.',
    );
  }

  try {
    const result = await askRecoveryQuestion(
      // `context` is validated inside askRecoveryQuestion (400 INVALID_CONTEXT when malformed).
      { question, context: context as RagWorkflowContext | undefined },
      { workflow: { nodes: recoveryNodes, edges: recoveryEdges } },
    );
    return Response.json(result);
  } catch (err) {
    if (err instanceof RagError) {
      if (err.httpStatus >= 500) console.error(`[rag] ${err.code}: ${err.message}`);
      return errorResponse(err.httpStatus, err.code, err.publicMessage);
    }
    console.error("[rag] Unexpected error", err);
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Something went wrong while answering the question.",
    );
  }
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
