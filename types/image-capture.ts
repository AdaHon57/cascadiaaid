export type DocumentKind = "ID" | "UTILITY_BILL" | "OTHER";

/** An AI transcription draft, not identity or address verification. */
export interface DocumentTextResult {
  text: string;
  imageQuality: "CLEAR" | "LIMITED" | "UNREADABLE";
  limitations: string[];
}

export interface DamageObservation {
  location: string;
  description: string;
  certainty: "LOW" | "MEDIUM" | "HIGH";
}

/** Describes visible features only; never a structural or habitability assessment. */
export interface DamagePhotoAnalysis {
  subject: "BUILDING" | "OTHER" | "UNCLEAR";
  imageQuality: "CLEAR" | "LIMITED" | "UNUSABLE";
  summary: string;
  observations: DamageObservation[];
  limitations: string[];
}
