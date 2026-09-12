import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Documents"
        description="This route is ready for future document features."
      />
      <EmptyState
        title="No document tools yet"
        description="Storage, processing, and extraction behavior have not been implemented."
      />
    </div>
  );
}
