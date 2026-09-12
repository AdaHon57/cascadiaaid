import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="This route is ready for a future application overview."
      />
      <EmptyState
        title="Nothing to show yet"
        description="Dashboard content will appear here after its requirements and data sources are defined."
      />
    </div>
  );
}
