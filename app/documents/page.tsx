import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { CaptureWorkspace } from "@/components/documents/capture-workspace";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Documents"
        description="Turn document photos into editable text, and document visible property damage."
      />
      <CaptureWorkspace />
    </div>
  );
}
