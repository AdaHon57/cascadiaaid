"use client";

import Link from "next/link";
import { useHeaderMenu } from "./use-header-menu";

export function SettingsMenu() {
  const { menu, close } = useHeaderMenu();
  return (
    <details ref={menu} name="header-menu" className="relative">
      <summary
        aria-label="Settings"
        title="Settings"
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full text-2xl text-slate-600 hover:bg-slate-100 focus-visible:outline-teal-600 [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true">⚙</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-5rem)] rounded-lg border bg-white p-4 text-sm shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-semibold text-slate-950">Settings</p>
          <button
            type="button"
            onClick={() => close()}
            aria-label="Close settings"
            className="flex size-11 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <Link onClick={() => close(false)} href="/intake" className="text-teal-800 underline">
          Edit household answers and documents
        </Link>
      </div>
    </details>
  );
}
