"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIntakeRecord } from "@/lib/use-intake-record";
import {
  baseTaskId,
  currentJourneyTask,
  evaluateJourney,
  journeyBadges,
} from "@/lib/recovery-journey";
import { intakeRequest, jsonRequest } from "@/lib/intake-client";
import type { IntakeRecord } from "@/types/intake";
import { DemoControls } from "./demo-controls";
import { TaskWorkspace } from "./task-workspace";
import { RecoveryRoadmap } from "@/components/dashboard/recovery-roadmap";

const statusLabels = {
  ready: "Ready to work",
  blocked: "Prerequisites needed",
  preparing: "Work started",
  waiting: "Awaiting response",
  information: "Follow-up needed",
  denied: "Decision needs follow-up",
  approved: "Approved · outcome pending",
  partial: "Partial outcome",
  achieved: "Goal achieved",
  closed: "Closed without goal",
  "not-applicable": "Not applicable",
};

export function RecoveryWorkspace({ view }: { view: "dashboard" | "roadmap" | "applications" }) {
  const { record, error, setRecord } = useIntakeRecord();
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
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
    setSaveError("");
    try {
      const next = await operation(latestRecord.current);
      latestRecord.current = next;
      setRecord(next);
      window.dispatchEvent(new Event("cascadia-record-changed"));
      return next;
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save your changes.");
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
        "/api/intake/journey",
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
      if (view === "roadmap") heading.current?.scrollIntoView({ block: "start" });
    });
  }
  if (!record)
    return <p role={error ? "alert" : "status"}>{error || "Loading your recovery steps…"}</p>;
  const tasks = evaluateJourney(record);
  const current = currentJourneyTask(record, tasks);
  const completed = tasks.filter((t) => t.status === "achieved").length;
  const closed = tasks.filter((t) => t.status === "closed").length;
  const applicable = tasks.filter((t) => t.status !== "not-applicable").length;
  const visible = tasks.filter(
    (t) =>
      (view !== "applications" ||
        ["assistance", "application", "review", "appeal", "funds"].includes(
          baseTaskId(t.definition.id),
        )) &&
      (showAll ||
        t.definition.id === selected ||
        !["achieved", "closed", "not-applicable"].includes(t.status)),
  );
  const requested =
    (view === "roadmap" ? tasks : visible).find((t) => t.definition.id === selected) ??
    (view === "roadmap" ? tasks : visible).find((t) => baseTaskId(t.definition.id) === selected);
  const focused =
    requested ?? visible.find((t) => t.definition.id === current?.definition.id) ?? visible[0];
  const focusIndex = visible.findIndex((t) => t.definition.id === focused?.definition.id);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {view === "roadmap" ? "Roadmap" : view === "applications" ? "Applications" : "Dashboard"}
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
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {saveError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {saveError}
        </p>
      )}
      <DemoControls record={record} command={command} mutate={mutate} busy={busy} />
      {!record.confirmed && (
        <div className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Start with the information you have</h2>
          <Link href="/intake" className="mt-3 inline-block font-semibold text-teal-800 underline">
            Complete household intake
          </Link>
        </div>
      )}
      {view === "roadmap" ? (
        <div className="space-y-5">
          <RecoveryRoadmap
            badges={journeyBadges(record)}
            selected={focused ? baseTaskId(focused.definition.id) : null}
            onSelect={choose}
            activeNodeId={current ? baseTaskId(current.definition.id) : undefined}
          />
          {focused && (
            <section
              className="mx-auto max-w-3xl rounded-2xl border bg-white p-5 sm:p-8"
              aria-labelledby="roadmap-workspace-title"
            >
              <p className="text-sm text-slate-500">{statusLabels[focused.status]}</p>
              <h2
                ref={heading}
                tabIndex={-1}
                id="roadmap-workspace-title"
                className="mt-2 text-2xl font-semibold focus:outline-none"
              >
                {focused.definition.title}
              </h2>
              <p className="my-4 text-slate-600">{focused.definition.goal}</p>
              <TaskWorkspace
                key={`${record.id}:${focused.definition.id}`}
                record={record}
                item={focused}
                command={command}
                busy={busy}
                onChoose={choose}
                onDirtyChange={setDirty}
              />
            </section>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-5">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
            />
            Show achieved, closed, and not-applicable tasks
          </label>
          {!focused ? (
            <p className="rounded-xl border bg-white p-6">
              No open tasks in this view. Show all tasks to review outcomes.
            </p>
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
                  <button
                    type="button"
                    onClick={() => choose(visible[focusIndex - 1].definition.id)}
                  >
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
                  <button
                    type="button"
                    onClick={() => choose(visible[focusIndex + 1].definition.id)}
                  >
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
      )}
    </div>
  );
}
