import type { DamagePhotoAnalysis } from "@/types/image-capture";

export const PHOTO_LIMITATION =
  "Photo observations only. This cannot establish structural safety, habitability, hidden damage, hazardous materials, repair costs, or eligibility for assistance. A qualified professional must assess the property.";

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function shortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

/** Treat even schema-constrained model output as untrusted until validated. */
export function parseDamageAnalysis(value: unknown): DamagePhotoAnalysis {
  if (
    !record(value) ||
    !["BUILDING", "OTHER", "UNCLEAR"].includes(value.subject as string) ||
    !["CLEAR", "LIMITED", "UNUSABLE"].includes(value.imageQuality as string) ||
    !shortText(value.summary, 1200) ||
    !Array.isArray(value.observations) ||
    value.observations.length > 12 ||
    !Array.isArray(value.limitations) ||
    value.limitations.length < 1 ||
    value.limitations.length > 8 ||
    !value.limitations.every((item) => shortText(item, 500))
  ) {
    throw new Error("Invalid photo analysis.");
  }
  const observations = value.observations.map((item: unknown) => {
    if (
      !record(item) ||
      !shortText(item.location, 800) ||
      !shortText(item.description, 800) ||
      !["LOW", "MEDIUM", "HIGH"].includes(item.certainty as string)
    ) {
      throw new Error("Invalid photo observation.");
    }
    return {
      location: item.location,
      description: item.description,
      certainty: item.certainty as "LOW" | "MEDIUM" | "HIGH",
    };
  });
  if ((value.subject !== "BUILDING" || value.imageQuality === "UNUSABLE") && observations.length) {
    throw new Error("Unusable photos cannot support damage observations.");
  }
  return {
    subject: value.subject as DamagePhotoAnalysis["subject"],
    imageQuality: value.imageQuality as DamagePhotoAnalysis["imageQuality"],
    summary: value.summary,
    observations,
    limitations: value.limitations as string[],
  };
}
