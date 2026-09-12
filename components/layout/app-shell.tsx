import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsMenu } from "@/components/layout/settings-menu";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { BrandLogo } from "@/components/layout/brand-logo";
import { SupportChat } from "@/components/support/support-chat";

const navigation = [
  { href: "/intake", label: "Intake" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/applications", label: "Applications" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-none font-semibold tracking-tight text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <BrandLogo />
              <span>Cascadia Aid</span>
            </Link>
            <div className="flex items-center gap-2">
              <SettingsMenu />
              <ProfileMenu />
            </div>
          </div>
          <nav
            aria-label="Primary navigation"
            className="-mx-1 flex gap-1 overflow-x-auto pb-3 lg:absolute lg:left-1/2 lg:top-3 lg:-translate-x-1/2 lg:pb-0"
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
          <p className="flex items-center gap-2">
            <BrandLogo />
            <span>Cascadia Aid</span>
          </p>
        </div>
      </footer>
      <SupportChat />
    </div>
  );
}
