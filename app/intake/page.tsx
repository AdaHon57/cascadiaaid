import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Intake" };

export default function IntakePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Intake"
        description="This route is ready for a future intake experience."
      />
      <EmptyState
        title="Intake has not been configured"
        description="Fields, validation, and submission behavior will be added when product requirements are defined."
      />
    </div>
  );
}
