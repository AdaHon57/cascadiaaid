import type { Metadata } from "next";
import { HouseholdDashboard } from "@/components/dashboard/household-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <HouseholdDashboard />
    </div>
  );
}
