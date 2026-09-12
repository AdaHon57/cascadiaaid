import type { Metadata } from "next";
import Image from "next/image";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Your recovery roadmap."
      />
      <a
        href="/recovery-map.png"
        target="_blank"
        rel="noreferrer"
        aria-label="Open the recovery roadmap at full size"
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-4"
      >
        <Image
          src="/recovery-map.png"
          alt="Recovery roadmap from initial assessment through safety, identification, insurance, property, and tax and ongoing support."
          width={1660}
          height={1606}
          unoptimized
          className="h-auto w-full"
        />
      </a>
    </div>
  );
}
