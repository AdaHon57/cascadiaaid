export type AutomationStatus =
  | "discovering"
  | "awaiting_authorization"
  | "working"
  | "needs_input"
  | "needs_user"
  | "submitted"
  | "checked"
  | "failed"
  | "uncertain"
  | "cancelled";

export interface AutomationJob {
  id: string;
  version: number;
  status: AutomationStatus;
  message: string;
  startedAt: string;
  updatedAt: string;
  destination?: { url: string; organization: string; reason: string };
  question?: string;
  canResume?: boolean;
  receipt?: { reference: string; url: string; evidence: string; at: string };
}

export interface AutomationPlan {
  mode: "document" | "request" | "followup";
  instruction: string;
  contextKeys: string[];
}

export interface AutomationPayload {
  id: string;
  task: { id: string; title: string; goal: string };
  plan: AutomationPlan;
  location: string;
  organization: string;
  startingUrls: string[];
  facts: Record<string, string>;
  documents: { id: string; type: string; text: string; data: string }[];
}
