import { journeyWorkflows } from "@/data/journey-workflows";
import type { IntakeRecord } from "@/types/intake";
import type { OrganizationAssignment } from "@/types/organizations";
import type { HouseholdOrganizations } from "@/types/organizations";

export const organizationGroups: Record<string, { nodes: string[]; role: string }> = {
  emergencyHousing: {
    nodes: ["temporary-housing"],
    role: "Local emergency housing intake or coordinated entry",
  },
  stableHousing: {
    nodes: ["stable-housing"],
    role: "Local public housing agency accepting housing requests",
  },
  identity: { nodes: ["identity"], role: "Issuing agency for the specific lost identity document" },
  assistance: {
    nodes: ["assistance", "application", "review", "appeal", "funds"],
    role: "Local disaster assistance intake and case management; do not assume an active FEMA declaration",
  },
  hazards: {
    nodes: ["hazards"],
    role: "Local environmental authority handling hazardous-material assessment/removal requests or authorized provider referrals",
  },
  cleanup: {
    nodes: ["cleanup"],
    role: "Local solid waste or disaster debris-removal enrollment office",
  },
  building: {
    nodes: ["permits", "safe-property"],
    role: "Building permits and final inspection authority for the affected property's jurisdiction",
  },
  rebuilding: {
    nodes: ["rebuilding"],
    role: "Public or nonprofit home-repair assistance intake; do not choose a private contractor",
  },
  tax: {
    nodes: ["tax-relief", "tax-determination", "tax-outcome"],
    role: "County assessor responsible for disaster property-tax relief and follow-up",
  },
};

export function organizationContext(record: IntakeRecord) {
  const a = record.confirmed?.answers ?? {};
  return JSON.stringify({
    resolverVersion: 2,
    city: a.affectedCity || "",
    state: a.affectedState || "",
    zip: a.affectedZip || "",
    insurer: a.insurerName || "",
    lostTypes: a.lostTypes || [],
    affectedDate: a.affectedDate || "",
    applications:
      record.confirmed?.applications.map(({ id, organization }) => ({ id, organization })) || [],
  });
}

export function organizationForTask(record: IntakeRecord, taskId: string): OrganizationAssignment {
  const base = taskId.split(":")[0];
  const programId = taskId.slice(base.length + 1);
  const program = record.confirmed?.applications.find((app) => app.id === programId);
  if (program?.organization && ["application", "review", "appeal", "funds"].includes(base))
    return {
      name: program.organization,
      role: "Organization handling your existing application",
      source: "household",
    };
  if (["claim", "claim-outcome"].includes(base)) {
    const insurer = record.confirmed?.answers.insurerName;
    if (typeof insurer === "string" && insurer.trim() && !["unknown", "skipped"].includes(insurer))
      return {
        name: insurer.trim(),
        role: "Your insurance claim and follow-up",
        source: "household",
      };
    return {
      name: "",
      role: "Your insurance claim",
      source: "missing",
      question: "Add the insurer name from your policy in household information.",
    };
  }
  if (["damage", "occupancy", "evidence"].includes(base))
    return {
      name: "Cascadia Aid",
      role: "Prepares and organizes your supporting documents",
      source: "internal",
    };
  const current =
    record.organizations?.contextKey === organizationContext(record)
      ? record.organizations.assignments
      : undefined;
  if (current?.[taskId] || current?.[base]) return current[taskId] || current[base];
  const hasLocation = !!(
    record.confirmed?.answers.affectedCity || record.confirmed?.answers.affectedZip
  );
  return {
    name: "",
    role: "Responsible organization",
    source: "missing",
    question: hasLocation
      ? "Finding the responsible organization for your household."
      : "Add the affected city, state, or ZIP code so the responsible organization can be identified.",
  };
}

export function organizationsForMap(record: IntakeRecord) {
  return Object.fromEntries(
    journeyWorkflows.map((node) => {
      if (
        ["application", "review", "appeal", "funds"].includes(node.id) &&
        record.confirmed?.applications.length
      ) {
        const names = [
          ...new Set(record.confirmed.applications.map((app) => app.organization).filter(Boolean)),
        ];
        return [node.id, names.join(" · ")];
      }
      return [node.id, organizationForTask(record, node.id).name];
    }),
  );
}

export function assignOrganizations(
  record: IntakeRecord,
  organizations: HouseholdOrganizations,
): IntakeRecord {
  if (organizationContext(record) !== organizations.contextKey) return record;
  const next = structuredClone(record);
  next.organizations = organizations;
  for (const [taskId, task] of Object.entries(next.journey?.tasks ?? {})) {
    const artifact = task.artifact;
    if (!artifact || artifact.approvedAt || artifact.receipt || task.submittedAt) continue;
    const name = organizationForTask(next, taskId).name;
    if (!name || artifact.recipient === name) continue;
    artifact.id = crypto.randomUUID();
    artifact.version++;
    artifact.recipient = name;
    artifact.text = /^To:.*$/m.test(artifact.text)
      ? artifact.text.replace(/^To:.*$/m, `To: ${name}`)
      : `To: ${name}\n\n${artifact.text}`;
  }
  return next;
}
