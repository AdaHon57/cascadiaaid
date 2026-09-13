import type { PriorityFactors } from "@/types/priority";
import type { AutomationJob } from "@/types/automation";

export type JourneyStatus =
  | "ready"
  | "blocked"
  | "waiting"
  | "information"
  | "denied"
  | "approved"
  | "partial"
  | "achieved"
  | "closed"
  | "not-applicable";
export interface JourneyArtifact {
  preparation?: "ai" | "autofill";
  id: string;
  version: number;
  recipient: string;
  text: string;
  documentIds: string[];
  preparedAt: string;
  approvedAt?: string;
  receipt?: string;
  simulated: boolean;
}
export interface JourneyTask {
  automation?: AutomationJob;
  ratings?: PriorityFactors;
  startedAt?: string;
  submittedAt?: string;
  response?: "information" | "denied" | "approved" | "partial";
  responseNote?: string;
  dueDate?: string;
  notes: string;
  artifact?: JourneyArtifact;
  outcome?: {
    kind: "achieved" | "closed";
    note: string;
    documentIds: string[];
    at: string;
    simulated: boolean;
  };
  notApplicable?: boolean;
}
export interface JourneyEvent {
  id: string;
  taskId: string;
  kind: string;
  detail: string;
  at: string;
  simulated: boolean;
  artifact?: JourneyArtifact;
}
export interface RecoveryJourney {
  version: 1;
  tasks: Record<string, JourneyTask>;
  events: JourneyEvent[];
  operationIds: string[];
  activeTaskId: string | null;
  skippedIds: string[];
  demo: { enabled: boolean; dayOffset: number; scenario?: "owner" | "renter" };
}
export interface JourneyDefinition {
  id: string;
  engineId: string;
  title: string;
  goal: string;
  packet: string;
  questions: string[];
  evidenceTypes: string[];
  prerequisites: { id: string; milestone: "submitted" | "achieved"; when?: string }[];
  applicability?: string;
  recipient: string;
  nextAction: string;
}
