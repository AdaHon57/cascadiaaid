"use client";

import { useState } from "react";

export function EmergencyHousing() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <aside
      role="alert"
      aria-labelledby="housing-help"
      className="relative space-y-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-5 text-amber-950"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Close housing help"
        className="absolute top-2 right-2 flex size-10 items-center justify-center rounded text-2xl hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-900"
      >
        ×
      </button>
      <h2 id="housing-help" className="pr-10 text-lg font-semibold">
        Help finding somewhere to stay tonight
      </h2>
      <p>You can get help now. You do not need to finish these questions.</p>
      <div className="flex flex-wrap gap-3">
        <a className="rounded bg-amber-950 px-4 py-3 font-semibold text-white" href="tel:211">
          Call 211
        </a>
        <a
          className="rounded border border-amber-800 px-4 py-3 font-semibold underline"
          href="https://search.wa211.org/"
          target="_blank"
          rel="noreferrer"
        >
          Find housing and shelter resources
        </a>
      </div>
      <p className="text-sm">
        If 211 does not connect, call{" "}
        <a className="underline" href="tel:18772119274">
          1-877-211-9274
        </a>
        . Tell the resource specialist your current location and any accessibility, transportation,
        household or pet needs.
      </p>
    </aside>
  );
}
