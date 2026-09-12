"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useHeaderMenu } from "./use-header-menu";
import { intakeRequest } from "@/lib/intake-client";

export function SettingsMenu() {
  const { menu, close } = useHeaderMenu();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function randomize() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const record = await intakeRequest();
      await intakeRequest("/api/intake/randomize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: record.revision }),
      });
      window.location.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not randomize data. Try again.");
      pending.current = false;
      setBusy(false);
    }
  }
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
        <div className="mt-4 border-t pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void randomize()}
            aria-describedby="randomize-description"
            className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-teal-600 disabled:opacity-50"
          >
            {busy ? "Randomizing…" : "Randomize data"}
          </button>
          <p id="randomize-description" className="mt-1 text-xs leading-5 text-slate-500">
            For testing: replaces saved answers and applications, fills all 3 stages with sample
            data, and updates your recovery map. Existing uploads are kept.
          </p>
          {busy && (
            <p role="status" className="mt-2 text-xs">
              Filling all 3 stages…
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}
