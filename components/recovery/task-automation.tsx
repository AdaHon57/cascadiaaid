"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AutomationJob } from "@/types/automation";

export function TaskAutomation({
  taskId,
  job,
  busy,
  disabled,
  command,
}: {
  taskId: string;
  job?: AutomationJob;
  busy: boolean;
  disabled: boolean;
  command: (fields: Record<string, unknown>) => Promise<unknown>;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [answer, setAnswer] = useState("");
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/intake/automation", { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : { available: false }))
      .then((value) => setAvailable(value.available === true))
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!available || busy || paused || !job || !["discovering", "working"].includes(job.status))
      return;
    const timer = window.setTimeout(() => {
      void command({ kind: "automation", taskId, action: "advance" }).catch(() => {
        setPaused(true);
      });
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [available, busy, command, paused, job, taskId]);
  async function run(action: string, fields: Record<string, unknown> = {}) {
    setPaused(false);
    try {
      await command({ kind: "automation", taskId, action, ...fields });
      if (action === "answer") setAnswer("");
    } catch {
      setPaused(true);
    }
  }
  const terminal =
    job && ["submitted", "checked", "failed", "uncertain", "cancelled"].includes(job.status);
  return (
    <div className="space-y-3">
      {!job ? (
        <>
          <p>
            Let AI find the correct form, fill it from your confirmed information, attach relevant
            documents, and submit the request. You’ll see the receiving organization before
            information is entered on its site.
          </p>
          <Button
            disabled={busy || disabled || available !== true}
            onClick={() => void run("start", { confirm: true })}
          >
            Let AI handle this
          </Button>
        </>
      ) : (
        <>
          {!["failed", "uncertain"].includes(job.status) && (
            <p role="status" className="font-medium text-slate-900">
              {job.message}
            </p>
          )}
          {job.destination && (
            <p>
              <a
                className="font-medium text-teal-800 underline"
                href={job.destination.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {job.destination.organization}: {new URL(job.destination.url).hostname}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          )}
          {job.status === "awaiting_authorization" && job.destination && (
            <>
              <p>{job.destination.reason}</p>
              <p>
                Allow AI to enter your confirmed information, upload relevant documents, and submit
                this request to this organization.
              </p>
              <Button
                disabled={busy}
                onClick={() => void run("authorize", { url: job.destination!.url })}
              >
                Authorize AI to continue
              </Button>
            </>
          )}
          {job.status === "needs_input" && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run("answer", { answer });
              }}
            >
              <label className="block">
                {job.question}
                <textarea
                  className="mt-2 block w-full rounded-lg border border-slate-300 p-3"
                  rows={3}
                  maxLength={4000}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                />
              </label>
              <p className="text-xs">
                Do not enter passwords, verification codes, Social Security numbers, or payment
                details here.
              </p>
              <Button type="submit" disabled={busy || !answer.trim()}>
                Use this answer and continue
              </Button>
            </form>
          )}
          {job.status === "needs_user" && (
            <>
              <p>{job.question}</p>
              {job.canResume && (
                <>
                  <p>
                    Complete the personal step in the automation browser on this computer, then
                    continue. A separate tab does not share its login.
                  </p>
                  <Button variant="secondary" disabled={busy} onClick={() => void run("resume")}>
                    I completed the step in the automation browser
                  </Button>
                </>
              )}
            </>
          )}
          {job.receipt && (
            <div className="space-y-1 border-l-2 border-green-600 pl-3">
              <p className="font-semibold">
                {job.status === "submitted"
                  ? "Submission confirmed by the receiving site"
                  : "Status checked on the receiving site"}
              </p>
              {job.receipt.reference && <p>Reference: {job.receipt.reference}</p>}
              <p>{job.receipt.evidence}</p>
              <p className="text-xs">{new Date(job.receipt.at).toLocaleString()}</p>
            </div>
          )}
          {!terminal && (
            <Button variant="secondary" disabled={busy} onClick={() => void run("cancel")}>
              Stop automation
            </Button>
          )}
          {paused && (
            <Button variant="secondary" disabled={busy} onClick={() => void run("status")}>
              Refresh saved status
            </Button>
          )}
        </>
      )}
    </div>
  );
}
