import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/intake", label: "Intake" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/graph", label: "Graph" },
  { href: "/documents", label: "Documents" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-none font-semibold tracking-tight text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-none bg-teal-700 text-sm font-bold text-white"
              >
                CA
              </span>
              <span>Cascadia Aid</span>
            </Link>
            <span className="hidden rounded-none border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
              Foundation
            </span>
          </div>
          <nav
            aria-label="Primary navigation"
            className="-mx-1 flex gap-1 overflow-x-auto pb-3 sm:absolute sm:left-1/2 sm:top-3 sm:-translate-x-1/2 sm:pb-0"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-none px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {children}
      </main>
      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>Cascadia Aid</p>
          <p>Application foundation · No product logic implemented</p>
        </div>
      </footer>
    </div>
  );
}
