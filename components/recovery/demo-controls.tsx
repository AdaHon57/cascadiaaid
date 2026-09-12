"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getJourney, journeyNow } from "@/lib/recovery-journey";
import { intakeRequest, jsonRequest } from "@/lib/intake-client";
import type { IntakeRecord } from "@/types/intake";

export type JourneyCommand = (fields: Record<string, unknown>) => Promise<IntakeRecord>;
export type JourneyMutate = (
  operation: (record: IntakeRecord) => Promise<IntakeRecord>,
) => Promise<IntakeRecord>;

export function DemoControls({
  record,
  command,
  mutate,
  busy,
}: {
  record: IntakeRecord;
  command: JourneyCommand;
  mutate: JourneyMutate;
  busy: boolean;
}) {
  const [scenario, setScenario] = useState("owner");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const demo = getJourney(record).demo;
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the demonstration.");
    }
  }
  return (
    <details className="rounded-xl border border-teal-200 bg-teal-50 p-4">
      <summary className="cursor-pointer font-semibold text-teal-950">
        Demo controls{demo.enabled ? " · simulation enabled" : ""}
      </summary>
      <div className="mt-4 space-y-4 text-sm">
        <p>
          Prepare real drafts and downloads. Demonstration submissions, replies, and sample evidence
          are fictional; nothing is sent to an outside organization.
        </p>
        {!demo.enabled ? (
          <Button
            disabled={busy}
            onClick={() => void run(() => command({ kind: "demo-enable", confirm: true }))}
          >
            Enable simulation
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p>
              Demo date: {journeyNow(record).toISOString().slice(0, 10)} · {demo.dayOffset} days
              advanced
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run(() => command({ kind: "demo-time", days: 7 }))}
            >
              Advance 7 days
            </Button>
          </div>
        )}
        <details className="border-t border-teal-200 pt-3">
          <summary className="cursor-pointer font-medium">Load a sample household</summary>
          <div className="mt-3 space-y-3">
            <label className="block">
              Scenario
              <select
                className="mt-1 block w-full rounded border bg-white p-3"
                value={scenario}
                onChange={(e) => {
                  setScenario(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="owner">Homeowner recovering after a wildfire</option>
                <option value="renter">Renter recovering after a wildfire</option>
              </select>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Replace this household’s answers, applications, and recovery progress with the sample
              scenario. Keep real uploads.
            </label>
            <Button
              disabled={busy || !confirmed}
              onClick={() =>
                void run(async () => {
                  await mutate((current) =>
                    intakeRequest("/api/intake/scenario", {
                      ...jsonRequest({ revision: current.revision, scenario, confirm: true }),
                      method: "POST",
                    }),
                  );
                  window.location.reload();
                })
              }
            >
              Load confirmed scenario
            </Button>
          </div>
        </details>
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
