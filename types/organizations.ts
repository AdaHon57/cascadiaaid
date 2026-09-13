export interface OrganizationAssignment {
  name: string;
  role: string;
  url?: string;
  sourceUrl?: string;
  source: "household" | "research" | "internal" | "missing";
  question?: string;
}

export interface HouseholdOrganizations {
  contextKey: string;
  checkedAt: string;
  assignments: Record<string, OrganizationAssignment>;
}
