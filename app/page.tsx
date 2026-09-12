import Link from "next/link";
import { Badge, Card } from "@/components/ui";

const sections = [
  { href: "/intake", label: "Intake", description: "Reserved for a future intake experience." },
  { href: "/dashboard", label: "Dashboard", description: "Reserved for a future overview." },
  { href: "/graph", label: "Graph", description: "Reserved for a future graph view." },
  { href: "/documents", label: "Documents", description: "Reserved for future document tools." },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="max-w-3xl space-y-5 py-8 sm:py-14">
        <Badge variant="accent">Project foundation</Badge>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
          A dependable starting point for what comes next.
        </h1>
        <p className="max-w-2xl text-pretty text-lg leading-8 text-slate-600">
          The application shell, routes, reusable interface components, and development tooling are
          ready. Product behavior is intentionally not implemented yet.
        </p>
      </section>
      <section aria-labelledby="workspace-heading" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-teal-700">Workspace</p>
            <h2
              id="workspace-heading"
              className="mt-1 text-2xl font-semibold tracking-tight text-slate-950"
            >
              Application areas
            </h2>
          </div>
          <Badge>4 routes ready</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-4"
            >
              <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:border-teal-300 group-hover:shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">{section.label}</h3>
                    <p className="mt-2 leading-6 text-slate-600">{section.description}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="text-xl text-teal-700 transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
