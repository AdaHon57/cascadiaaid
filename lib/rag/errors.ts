export type RagErrorCode =
  | "INVALID_QUESTION"
  | "INVALID_CONTEXT"
  | "INDEX_INVALID"
  | "RETRIEVAL_FAILED"
  | "EMBEDDING_FAILED"
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_RATE_LIMITED"
  | "MODEL_REFUSED"
  | "MODEL_ERROR";

const HTTP_STATUS: Record<RagErrorCode, number> = {
  INVALID_QUESTION: 400,
  INVALID_CONTEXT: 400,
  INDEX_INVALID: 500,
  RETRIEVAL_FAILED: 500,
  EMBEDDING_FAILED: 502,
  MODEL_NOT_CONFIGURED: 500,
  MODEL_RATE_LIMITED: 503,
  MODEL_REFUSED: 502,
  MODEL_ERROR: 502,
};

/** Messages that are safe to show to end users (no internals, paths, or keys). */
const PUBLIC_MESSAGE: Record<RagErrorCode, string> = {
  INVALID_QUESTION: "Please provide a valid question.",
  INVALID_CONTEXT: "The workflow context is invalid.",
  INDEX_INVALID: "The recovery information knowledge base could not be loaded.",
  RETRIEVAL_FAILED: "Something went wrong while searching the approved sources.",
  EMBEDDING_FAILED: "Something went wrong while searching the approved sources.",
  MODEL_NOT_CONFIGURED: "The answer service is not configured.",
  MODEL_RATE_LIMITED: "The answer service is busy. Please try again shortly.",
  MODEL_REFUSED: "The answer service could not respond to this question.",
  MODEL_ERROR: "The answer service is temporarily unavailable.",
};

export class RagError extends Error {
  readonly code: RagErrorCode;

  constructor(code: RagErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RagError";
    this.code = code;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  /** Message for API responses; `message` itself may contain internal detail and should only be logged. */
  get publicMessage(): string {
    return this.code === "INVALID_QUESTION" || this.code === "INVALID_CONTEXT"
      ? this.message
      : PUBLIC_MESSAGE[this.code];
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` (cause: ${err.cause.message})` : "";
    return `${err.message}${cause}`;
  }
  return String(err);
}
