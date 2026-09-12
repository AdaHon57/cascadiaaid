import type { DocumentTextResult } from "@/types/image-capture";

export function parseDocumentTextResult(value: unknown): DocumentTextResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid document transcription.");
  }
  const result = value as Record<string, unknown>;
  if (
    typeof result.text !== "string" ||
    result.text.length > 24000 ||
    !["CLEAR", "LIMITED", "UNREADABLE"].includes(result.imageQuality as string) ||
    !Array.isArray(result.limitations) ||
    result.limitations.length > 8 ||
    !result.limitations.every(
      (item) => typeof item === "string" && item.trim().length > 0 && item.length <= 500,
    ) ||
    (result.imageQuality === "UNREADABLE" && result.text.trim().length > 0)
  ) {
    throw new Error("Invalid document transcription.");
  }
  return {
    text: result.text,
    imageQuality: result.imageQuality as DocumentTextResult["imageQuality"],
    limitations: result.limitations as string[],
  };
}
