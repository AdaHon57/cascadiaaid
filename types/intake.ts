import type { RecoveryJourney } from "@/types/journey";
import type { RecoveryCase } from "@/types/recovery-case";
import type { HouseholdOrganizations } from "@/types/organizations";

/** Missing key = unanswered; explicit unknown/skipped are retained separately. */
export type IntakeValue = string | string[];
export type IntakeAnswers = Record<string, IntakeValue>;
export interface AssistanceApplication {
  id: string;
  organization: string;
  status: string;
  outstanding: string;
  action: string;
  deadline: string;
}
export interface IntakeDraft {
  answers: IntakeAnswers;
  applications: AssistanceApplication[];
  stage: number;
}
export interface DocumentFields {
  name: string;
  address: string;
  date: string;
  dateMeaning: string;
  scope: string;
}
export interface IntakeDocument {
  reviewedText?: string;
  testData?: boolean;
  id: string;
  type: string;
  uploadedAt: string;
  fields: DocumentFields;
  confirmedAt: string | null;
  recipientStatus: "unknown" | "pending" | "accepted" | "rejected";
  recipient: string;
  conflictAcknowledgment: string;
}
export interface IntakeRecord {
  organizations?: HouseholdOrganizations;
  journey?: RecoveryJourney;
  dashboard?: { skippedStepIds: string[]; activeStepId: string | null };
  id: string;
  revision: number;
  draft: IntakeDraft;
  confirmed: IntakeDraft | null;
  confirmedAt: string | null;
  caseRecord: RecoveryCase;
  documents: IntakeDocument[];
}
export const emptyDocumentFields: DocumentFields = {
  name: "",
  address: "",
  date: "",
  dateMeaning: "unknown",
  scope: "unknown",
};
