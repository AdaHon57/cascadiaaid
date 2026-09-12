"use client";

import { useRef, useState } from "react";
import { useHeaderMenu } from "./use-header-menu";
import { SUPPORT_SESSION_KEY } from "@/types/support-chat";

export function ProfileMenu() {
  const { menu, close } = useHeaderMenu();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function wipeData() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/intake", { method: "DELETE", cache: "no-store" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Could not delete your data. Please try again.");
      }
      // A full navigation discards this page's in-memory household data.
      try {
        sessionStorage.removeItem(SUPPORT_SESSION_KEY);
      } catch {
        // Storage may be disabled; navigation still discards in-memory chat.
      }
      window.location.replace("/dashboard");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete your data. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <details ref={menu} name="header-menu" className="relative">
        <summary
          aria-label="User profile"
          title="User profile"
          className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 focus-visible:outline-teal-600 [&::-webkit-details-marker]:hidden"
        >
          <span aria-hidden="true" className="relative h-6 w-6 overflow-hidden rounded-full">
            <span className="absolute top-0 left-2 size-2 rounded-full bg-current" />
            <span className="absolute bottom-0 left-1 h-3 w-4 rounded-t-full bg-current" />
          </span>
        </summary>
        <div className="absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-4 text-sm shadow-lg">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-950">Profile</p>
            <button
              type="button"
              onClick={() => close()}
              aria-label="Close profile"
              className="flex size-11 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              close(false);
              dialog.current?.showModal();
            }}
            className="min-h-11 w-full rounded-lg px-3 py-2 text-left font-medium text-red-700 hover:bg-red-50 focus-visible:outline-red-700"
          >
            Wipe user data
          </button>
        </div>
      </details>
      <dialog
        ref={dialog}
        aria-labelledby="wipe-data-title"
        aria-describedby="wipe-data-description"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/50"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => dialog.current?.close()}
          aria-label="Close wipe data confirmation"
          className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full text-2xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <span aria-hidden="true">×</span>
        </button>
        <h2 id="wipe-data-title" className="text-xl font-semibold text-slate-950">
          Wipe user data?
        </h2>
        <p id="wipe-data-description" className="mt-3 text-sm leading-6 text-slate-600">
          Permanently delete this household’s saved answers, applications, recovery progress, and
          uploaded documents from Cascadia Aid. You’ll start over with an empty Dashboard. This
          cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="mt-4 text-sm text-slate-600">
            Deleting your data…
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            autoFocus
            type="button"
            disabled={busy}
            onClick={() => dialog.current?.close()}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={wipeData}
            className="min-h-11 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Permanently wipe data"}
          </button>
        </div>
      </dialog>
    </>
  );
}
