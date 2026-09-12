import { activeAnswers } from "@/data/intake-questions";
import { evaluateIntake } from "@/lib/intake-recovery";
import type { IntakeRecord } from "@/types/intake";
export interface MapBadge {
  label: string;
  tone: "ready" | "waiting" | "blocked" | "complete" | "unknown";
  detail: string[];
}
export const mapEngineIds: Record<string, string> = {
  "temporary-housing": "temporary-housing",
  damage: "damage-documentation",
  identity: "identity-replacement",
  occupancy: "proof-of-occupancy",
  claim: "insurance-claim",
  assistance: "public-disaster-assistance",
  hazards: "hazardous-material-assessment-removal",
  permits: "building-permits",
  rebuilding: "repair-rebuilding",
  "tax-relief": "property-tax-relief",
};
export function personalizeMap(record: IntakeRecord): Record<string, MapBadge> {
  const evaluation = evaluateIntake(record);
  const a = activeAnswers(record.confirmed?.answers ?? {});
  const badges: Record<string, MapBadge> = {};
  for (const [mapId, engineId] of Object.entries(mapEngineIds)) {
    const state = evaluation.states.find((s) => s.nodeId === engineId)!;
    const label =
      state.status === "READY"
        ? "Available action"
        : state.status === "IN_PROGRESS"
          ? "In progress"
          : state.status === "COMPLETE"
            ? ["insurance-claim", "public-disaster-assistance", "property-tax-relief"].includes(
                engineId,
              )
              ? "Submission recorded"
              : "Milestone recorded"
            : state.status === "NOT_APPLICABLE"
              ? "Not applicable (draft)"
              : state.applicable === null
                ? "Answer needed"
                : "Blocked";
    const tone: MapBadge["tone"] =
      state.status === "READY"
        ? "ready"
        : state.status === "IN_PROGRESS"
          ? "waiting"
          : state.status === "COMPLETE"
            ? "complete"
            : state.status === "NOT_APPLICABLE" || state.applicable === null
              ? "unknown"
              : "blocked";
    badges[mapId] = { label, tone, detail: state.reasons };
  }
  const report = (id: string, label: string, tone: MapBadge["tone"], detail: string) => {
    badges[id] = { label, tone, detail: [detail, ...(badges[id]?.detail ?? [])] };
  };
  if (a.replacementRequested === "yes" && a.replacementArrived !== "yes")
    report(
      "identity",
      "Awaiting replacements",
      "waiting",
      "Replacement requests were reported. Receipt is not confirmed.",
    );
  if (
    a.claimSubmitted === "yes" &&
    ["review", "payment-pending", "partial-payment"].includes(String(a.claimStatus))
  )
    report(
      "claim",
      "Awaiting response",
      "waiting",
      `Reported claim progress: ${String(a.claimStatus).replaceAll("-", " ")}.`,
    );
  if (a.claimOutstanding === "yes")
    report(
      "claim",
      "Action requested",
      "blocked",
      `${a.claimAction || "Check the insurer’s outstanding request or dispute."}${a.claimDeadline ? ` Deadline: ${a.claimDeadline}.` : " Deadline not known."}`,
    );
  if (a.permitStatus === "requested")
    report(
      "permits",
      "Awaiting permit response",
      "waiting",
      "Permit request reported; issuance not confirmed.",
    );
  if (a.accessAllowed === "no")
    report(
      "hazards",
      "Access restricted",
      "blocked",
      "Authorities have not allowed access, according to your answer. Do not infer clearance from a photo or map status.",
    );
  if (a.repairRole === "no")
    report(
      "rebuilding",
      "Authorization needed",
      "blocked",
      "You reported that you are not responsible or authorized to arrange work. Clarify who can arrange it.",
    );
  if (a.inspectionsOutstanding === "yes")
    report(
      "rebuilding",
      "Approvals outstanding",
      "blocked",
      String(
        a.inspectionDetails || "Inspections, corrections or final approvals are still outstanding.",
      ),
    );
  if (a.taxRequested === "yes" && a.taxDetermination !== "yes")
    report(
      "tax-relief",
      "Awaiting determination",
      "waiting",
      "A tax request was reported; no determination is recorded.",
    );
  if (a.taxOutstanding === "yes")
    report(
      "tax-relief",
      "Request / appeal open",
      "blocked",
      `${a.taxAction || "Check the Assessor’s request or appeal."}${a.taxDeadline ? ` Deadline: ${a.taxDeadline}.` : " Deadline not known."}`,
    );
  const apps = record.confirmed?.applications ?? [];
  const outstanding = apps.filter(
    (app) =>
      app.outstanding === "yes" || ["information", "denied", "appealing"].includes(app.status),
  );
  if (outstanding.length)
    report(
      "assistance",
      "Follow-up needed",
      "blocked",
      outstanding
        .map(
          (app) =>
            `${app.organization || "Application"}: ${app.status}. ${app.action || "Check the request or decision."}${app.deadline ? ` Recorded deadline: ${app.deadline}.` : ""}`,
        )
        .join(" "),
    );
  else if (apps.some((app) => ["submitted", "approved"].includes(app.status)))
    report(
      "assistance",
      "Awaiting response / aid",
      "waiting",
      "See each application in the Applications tab. Submission or approval does not establish that aid was received.",
    );
  for (const doc of record.documents.filter((d) => d.recipientStatus === "rejected")) {
    const evidence = record.caseRecord.evidence.find((e) => e.id === `intake-document:${doc.id}`);
    for (const [mapId, engineId] of Object.entries(mapEngineIds)) {
      if (evidence?.nodeIds.includes(engineId))
        report(
          mapId,
          "Document follow-up",
          "blocked",
          `${doc.recipient || "A recipient"} rejected a supporting document or requested a replacement. Check their response; user confirmation and recipient acceptance are separate.`,
        );
    }
  }
  const auxiliary: Record<string, string> = {
    "stable-housing": "Stable housing is not confirmed by a temporary arrangement.",
    evidence: `${record.documents.filter((d) => d.confirmedAt).length} documents have user-confirmed information. Recipient acceptance is tracked separately.`,
    appeal: "See the exact requests, decisions and deadlines in your application records.",
    "claim-outcome": a.claimStatus
      ? `Claim status reported: ${a.claimStatus}.`
      : "No claim outcome recorded.",
    application:
      "Assistance can be explored without an insurance decision. See separate program records.",
    review: "Each organization reviews its own application.",
    funds: apps.some((app) => app.status === "received")
      ? "Funds or services were reported for at least one application. Other applications may remain open."
      : "No received aid recorded.",
    cleanup: a.debrisStatus
      ? `Cleanup reported: ${a.debrisStatus}. This is not site clearance.`
      : "No cleanup progress recorded.",
    "safe-property": "Occupancy clearance is not established by intake or photographs.",
    "tax-determination":
      a.taxDetermination === "yes"
        ? "A determination was reported. Its effect and any appeal remain separate."
        : "No tax determination recorded.",
    "tax-outcome":
      a.taxImplemented === "yes"
        ? "An adjustment or refund was reported as implemented."
        : "No implemented adjustment or refund recorded.",
  };
  for (const [id, detail] of Object.entries(auxiliary))
    badges[id] = { label: "Not confirmed", tone: "unknown", detail: [detail] };
  const update = (id: string, label: string, tone: MapBadge["tone"]) => {
    badges[id] = { ...badges[id], label, tone };
  };
  const confirmedDocuments = record.documents.filter((doc) => doc.confirmedAt).length;
  update(
    "evidence",
    `${confirmedDocuments} confirmed document${confirmedDocuments === 1 ? "" : "s"}`,
    confirmedDocuments ? "complete" : "unknown",
  );
  if (a.claimStatus === "resolved") update("claim-outcome", "Resolution reported", "complete");
  else if (a.claimStatus === "decision") update("claim-outcome", "Decision received", "complete");
  else if (a.claimStatus === "evidence") update("claim-outcome", "Evidence requested", "blocked");
  else if (["review", "payment-pending", "partial-payment"].includes(String(a.claimStatus)))
    update(
      "claim-outcome",
      a.claimStatus === "partial-payment"
        ? "Partial payment reported"
        : "Awaiting response / payment",
      "waiting",
    );
  if (a.claimOutstanding === "yes") {
    badges["claim-outcome"] = { ...badges.claim };
  }
  if (a.insurance === "no") update("claim-outcome", "No insurance reported", "unknown");
  const submitted = apps.filter((app) =>
    ["submitted", "information", "approved", "denied", "appealing", "received"].includes(
      app.status,
    ),
  );
  const preparing = apps.filter((app) => ["not-started", "preparing"].includes(app.status));
  if (preparing.length) update("application", `${preparing.length} to prepare / submit`, "ready");
  else if (submitted.length)
    update(
      "application",
      `${submitted.length} submission${submitted.length === 1 ? "" : "s"} recorded`,
      "complete",
    );
  else if (a.assistanceInterest === "yes")
    update("application", "Explore application options", "ready");
  if (outstanding.length) {
    badges.appeal = { ...badges.assistance };
    badges.review = { ...badges.assistance };
  } else {
    update("appeal", "No follow-up recorded", "unknown");
    if (apps.some((app) => ["submitted", "approved"].includes(app.status)))
      update("review", "Awaiting response / aid", "waiting");
    else if (apps.length && apps.every((app) => app.status === "received"))
      update("review", "Aid received for all recorded applications", "complete");
  }
  const received = apps.filter((app) => app.status === "received").length;
  if (received)
    update(
      "funds",
      `Aid received: ${received} of ${apps.length}`,
      received === apps.length && !outstanding.length ? "complete" : "waiting",
    );
  if (a.debrisStatus === "complete") update("cleanup", "Cleanup reported complete", "complete");
  else if (a.debrisStatus === "some") update("cleanup", "Cleanup in progress", "waiting");
  if (a.accessAllowed === "no") badges.cleanup = { ...badges.hazards };
  if (a.taxDetermination === "yes")
    update("tax-determination", "Determination received", "complete");
  else if (a.taxRequested === "yes")
    update("tax-determination", "Awaiting determination", "waiting");
  if (a.taxImplemented === "yes") update("tax-outcome", "Adjustment / refund reported", "complete");
  else if (a.taxDetermination === "yes")
    update("tax-outcome", "Implementation not confirmed", "unknown");
  if (a.taxOutstanding === "yes") {
    badges["tax-determination"] = { ...badges["tax-relief"] };
    badges["tax-outcome"] = { ...badges["tax-relief"] };
  }
  return badges;
}
