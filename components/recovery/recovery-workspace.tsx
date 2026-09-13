"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIntakeRecord } from "@/lib/use-intake-record";
import { useDashboardFocus } from "@/lib/use-dashboard-focus";
import { baseTaskId, currentJourneyTask, evaluateJourney } from "@/lib/recovery-journey";
import { intakeRequest, jsonRequest } from "@/lib/intake-client";
import type { IntakeRecord } from "@/types/intake";
import { journeyConnections } from "@/data/journey-connections";
import { TaskWorkspace } from "./task-workspace";

const statusLabels = {
  ready: "Ready to work",
  blocked: "Prerequisites needed",
  waiting: "Awaiting response",
  information: "Follow-up needed",
  denied: "Decision needs follow-up",
  approved: "Approved · outcome pending",
  partial: "Partial outcome",
  achieved: "Goal achieved",
  closed: "Closed without goal",
  "not-applicable": "Not applicable",
};

export function RecoveryWorkspace({ view }: { view: "dashboard" | "applications" }) {
  const { record, error, setRecord } = useIntakeRecord();
  const dashboardFocus = useDashboardFocus(record?.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const pending = useRef(false);
  const latestRecord = useRef(record);
  useEffect(() => {
    latestRecord.current = record;
  }, [record]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function mutate(operation: (current: IntakeRecord) => Promise<IntakeRecord>) {
    if (pending.current || !latestRecord.current)
      throw new Error("Please wait for the current save.");
    pending.current = true;
    setBusy(true);
    try {
      const next = await operation(latestRecord.current);
      latestRecord.current = next;
      setRecord(next);
      window.dispatchEvent(new Event("cascadia-record-changed"));
      return next;
    } catch (cause) {
      try {
        const fresh = await intakeRequest();
        latestRecord.current = fresh;
        setRecord(fresh);
      } catch {
        /* Preserve local edits for retry. */
      }
      throw cause;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function command(fields: Record<string, unknown>) {
    if (typeof fields.taskId === "string") setSelected(fields.taskId);
    return mutate((current) =>
      intakeRequest(
        fields.kind === "automation"
          ? "/api/intake/automation"
          : fields.kind === "organizations"
            ? "/api/intake/organizations"
            : "/api/intake/journey",
        jsonRequest({ ...fields, revision: current.revision, operationId: crypto.randomUUID() }),
      ),
    );
  }
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const updateHash = () => {
      const hash = window.location.hash.slice(1);
      try {
        setSelected(decodeURIComponent(hash) || null);
      } catch {
        setSelected(null);
      }
    };
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);
  function choose(id: string) {
    if (pending.current) return;
    if (dirty && !window.confirm("Leave this step and discard its unsaved edits?")) return;
    setSelected(id);
    window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
    });
  }
  const tasks = record ? evaluateJourney(record) : [];
  const current = record ? currentJourneyTask(record, tasks) : null;
  const selectedTask = selected ?? (view === "dashboard" ? dashboardFocus.taskId : null);
  const completed = tasks.filter((t) => t.status === "achieved").length;
  const closed = tasks.filter((t) => t.status === "closed").length;
  const applicable = tasks.filter((t) => t.status !== "not-applicable").length;
  const visible = tasks.filter(
    (t) =>
      (view !== "applications" ||
        journeyConnections[baseTaskId(t.definition.id)]?.applicationRelated) &&
      (t.definition.id === selectedTask ||
        !["achieved", "closed", "not-applicable"].includes(t.status)),
  );
  const requested =
    visible.find((t) => t.definition.id === selectedTask) ??
    visible.find((t) => baseTaskId(t.definition.id) === selectedTask);
  const focused =
    requested ?? visible.find((t) => t.definition.id === current?.definition.id) ?? visible[0];
  const focusIndex = visible.findIndex((t) => t.definition.id === focused?.definition.id);
  const focusedId = focused?.definition.id ?? null;
  const { ready: focusReady, taskId: savedFocus, save: saveFocus } = dashboardFocus;
  useEffect(() => {
    if (view === "dashboard" && focusReady && focusedId !== savedFocus) saveFocus(focusedId);
  }, [view, focusReady, focusedId, savedFocus, saveFocus]);
  if (!record) return error ? null : <p role="status">Loading your recovery steps…</p>;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {view === "applications" ? "Applications" : "Dashboard"}
        </h1>
        <p className="mt-2 text-slate-600">
          {completed} of {applicable} goals achieved
          {closed ? ` · ${closed} closed without the goal` : ""}
        </p>
      </header>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Recovery goals achieved"
        aria-valuemin={0}
        aria-valuemax={applicable || 1}
        aria-valuenow={completed}
      >
        <div
          className="h-full rounded-full bg-green-600"
          style={{ width: `${applicable ? (completed / applicable) * 100 : 0}%` }}
        />
      </div>
      {!record.confirmed && (
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Start with the information you have</h2>
          <Link href="/intake" className="mt-3 inline-block font-semibold text-teal-800 underline">
            Complete household intake
          </Link>
        </div>
      )}
      <div className="mx-auto max-w-3xl space-y-5">
        {!focused ? (
          <p className="rounded-xl border bg-white p-6">No open tasks in this view.</p>
        ) : (
          <div className="step-focus-layout">
            <button
              type="button"
              className="step-navigation"
              aria-label="Previous step"
              disabled={focusIndex <= 0}
              onClick={() => choose(visible[focusIndex - 1].definition.id)}
            >
              <span aria-hidden="true" className="step-chevron step-chevron-up" />
            </button>
            <div className="step-preview">
              {focusIndex > 0 ? (
                <button type="button" onClick={() => choose(visible[focusIndex - 1].definition.id)}>
                  <span className="text-xs">Step {focusIndex}</span>
                  <span className="block truncate font-medium">
                    {visible[focusIndex - 1].definition.title}
                  </span>
                </button>
              ) : (
                <p className="text-sm">Beginning of your steps</p>
              )}
            </div>
            <section
              aria-labelledby="focused-step-title"
              className="rounded-2xl border bg-white p-5 shadow-sm sm:p-8"
            >
              <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-500">
                <span>
                  Step {focusIndex + 1} of {visible.length}
                </span>
                <span>{statusLabels[focused.status]}</span>
              </div>
              <h2
                ref={heading}
                tabIndex={-1}
                id="focused-step-title"
                className="text-2xl font-semibold tracking-tight focus:outline-none"
              >
                {focused.definition.title}
              </h2>
              <p className="mt-3 leading-7 text-slate-600">{focused.definition.goal}</p>
              <div id="focused-step-details" className="mt-6 border-t pt-6">
                <TaskWorkspace
                  key={`${record.id}:${focused.definition.id}`}
                  record={record}
                  item={focused}
                  command={command}
                  busy={busy}
                  onChoose={choose}
                  onDirtyChange={setDirty}
                />
              </div>
            </section>
            <div className="step-preview">
              {focusIndex < visible.length - 1 ? (
                <button type="button" onClick={() => choose(visible[focusIndex + 1].definition.id)}>
                  <span className="text-xs">Step {focusIndex + 2}</span>
                  <span className="block truncate font-medium">
                    {visible[focusIndex + 1].definition.title}
                  </span>
                </button>
              ) : (
                <p className="text-sm">End of your steps</p>
              )}
            </div>
            <button
              type="button"
              className="step-navigation"
              aria-label="Next step"
              disabled={focusIndex >= visible.length - 1}
              onClick={() => choose(visible[focusIndex + 1].definition.id)}
            >
              <span aria-hidden="true" className="step-chevron" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
