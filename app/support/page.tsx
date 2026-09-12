import Link from "next/link";
import { supportKnowledge } from "@/data/support-knowledge";

export const metadata = { title: "Support guide" };

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">
          Cascadia Aid support
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Your guide to the next step</h1>
        <p className="leading-7 text-slate-600">
          These are the sources used by the support assistant. Recovery workflows are illustrative
          planning examples; confirm program requirements with the responsible organization.
        </p>
        <nav
          aria-label="Support shortcuts"
          className="flex flex-wrap gap-4 text-sm font-semibold text-teal-800 underline"
        >
          <Link href="/intake">Update intake</Link>
          <Link href="/dashboard">Your dashboard</Link>
          <Link href="/roadmap">Recovery roadmap</Link>
          <Link href="/applications">Applications</Link>
          <Link href="/documents">Documents</Link>
        </nav>
      </header>
      {supportKnowledge.map((source) => (
        <article
          key={source.id}
          id={source.id}
          className="scroll-mt-36 rounded-xl border bg-white p-6"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {source.kind === "official"
              ? "Official agency guidance"
              : source.kind === "illustrative"
                ? "Illustrative workflow"
                : "Site guide"}
          </p>
          <h2 className="text-xl font-semibold">{source.title}</h2>
          <p className="mt-3 leading-7 text-slate-600">{source.content}</p>
          {source.kind === "official" && (
            <p className="mt-3 text-sm text-slate-600">
              <a href={source.href} className="font-semibold text-teal-800 underline">
                Read the DOL source
              </a>
              {" · "}Reviewed {source.reviewedAt}. Check DOL for updates.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
