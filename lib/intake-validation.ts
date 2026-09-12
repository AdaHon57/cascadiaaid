import { intakeQuestions, applicationStatuses, documentTypes } from "@/data/intake-questions";
import type { IntakeDraft, IntakeDocument } from "@/types/intake";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const short = (v: unknown, max = 2000) => typeof v === "string" && v.length <= max;
export function validateDraft(value: unknown): asserts value is IntakeDraft {
  if (
    !object(value) ||
    !object(value.answers) ||
    !Array.isArray(value.applications) ||
    value.applications.length > 30 ||
    !Number.isInteger(value.stage) ||
    Number(value.stage) < 0 ||
    Number(value.stage) > 3
  )
    throw new Error("Invalid intake draft.");
  for (const [key, v] of Object.entries(value.answers)) {
    const q = intakeQuestions.find((q) => q.id === key);
    if (!q) throw new Error("Unknown intake question.");
    if (v === "unknown" || v === "skipped") continue;
    if (q.kind === "multi") {
      if (
        !Array.isArray(v) ||
        v.length > 10 ||
        new Set(v).size !== v.length ||
        v.some((x) => !q.options?.some(([id]) => id === x))
      )
        throw new Error("Invalid selected answers.");
    } else if (q.options) {
      if (!q.options.some(([id]) => id === v)) throw new Error("Invalid answer.");
    } else if (
      !short(v) ||
      (q.kind === "date" && v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)))
    )
      throw new Error("Invalid text or date.");
  }
  const ids = new Set<string>();
  for (const app of value.applications) {
    if (!object(app) || !short(app.id, 80) || !app.id || ids.has(String(app.id)))
      throw new Error("Invalid application ID.");
    ids.add(String(app.id));
    for (const key of ["organization", "status", "outstanding", "action", "deadline"])
      if (!short(app[key])) throw new Error("Invalid application.");
    if (
      !["", "skipped", ...applicationStatuses.map(([id]) => id)].includes(String(app.status)) ||
      !["", "yes", "no", "unknown", "skipped"].includes(String(app.outstanding))
    )
      throw new Error("Invalid application status.");
  }
}
export function validateDocument(value: unknown): asserts value is IntakeDocument {
  if (
    !object(value) ||
    !short(value.id, 80) ||
    !documentTypes.some(([id]) => id === value.type) ||
    !object(value.fields)
  )
    throw new Error("Invalid document.");
  if (value.reviewedText !== undefined && !short(value.reviewedText, 24000))
    throw new Error("Invalid reviewed document text.");
  for (const key of ["name", "address", "date", "dateMeaning", "scope"])
    if (!short(value.fields[key], 500)) throw new Error("Invalid document field.");
  if (
    !["affected-property", "household", "other", "unknown"].includes(String(value.fields.scope)) ||
    !["wildfire", "issued", "other", "unknown"].includes(String(value.fields.dateMeaning))
  )
    throw new Error("Invalid document scope or date meaning.");
  if (
    !["unknown", "pending", "accepted", "rejected"].includes(String(value.recipientStatus)) ||
    !short(value.recipient, 200) ||
    !short(value.conflictAcknowledgment)
  )
    throw new Error("Invalid recipient review.");
  if (value.recipientStatus !== "unknown" && !String(value.recipient).trim())
    throw new Error("Name the recipient for this status.");
  if (value.confirmedAt !== null && !short(value.confirmedAt, 80))
    throw new Error("Invalid confirmation.");
}
