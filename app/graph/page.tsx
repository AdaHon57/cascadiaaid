import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Graph" };

export default function GraphPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Graph"
        description="This route is reserved for a future graph experience."
      />
      <EmptyState
        title="No graph configured"
        description="Graph structure, relationships, and behavior are intentionally outside this foundation."
      />
    </div>
  );
}
