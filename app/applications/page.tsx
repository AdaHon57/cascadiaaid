import type { Metadata } from "next";
import { HouseholdApplications } from "@/components/applications/household-applications";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Applications</h1>
      <HouseholdApplications />
    </div>
  );
}
