"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { visibleQuestions, applicationStatuses, documentTypes } from "@/data/intake-questions";
import { documentConflicts } from "@/lib/intake-recovery";
import { intakeRequest, jsonRequest } from "@/lib/intake-client";
import { QuestionField } from "./question-field";
import { ApplicationFields } from "./application-fields";
import { IntakeDocuments } from "./intake-documents";
import { EmergencyHousing } from "./emergency-housing";
import type { IntakeDraft, IntakeRecord, IntakeValue } from "@/types/intake";
const stages = ["Immediate needs & household", "Recovery progress", "Optional documents", "Review"];
export function IntakeQuestionnaire() {
  const router = useRouter();
  const [record, setRecord] = useState<IntakeRecord | null>(null);
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [section, setSection] = useState(0);
  const [saveStatus, setSaveStatus] = useState("Loading saved intake…");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const current = useRef<IntakeRecord | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    intakeRequest("/api/intake", { signal: controller.signal })
      .then((value) => {
        current.current = value;
        setRecord(value);
        const requestedStage = new URLSearchParams(window.location.search).get("stage");
        setDraft(requestedStage === "2" ? { ...value.draft, stage: 2 } : value.draft);
        setSaveStatus("Progress saved");
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setSaveStatus("Could not load saved intake");
        }
      });
    return () => controller.abort();
  }, []);
  function mutate(
    operation: (record: IntakeRecord) => Promise<IntakeRecord>,
  ): Promise<IntakeRecord> {
    const next = queue.current
      .catch(() => {})
      .then(async () => {
        if (!current.current) throw new Error("Saved intake is not ready.");
        setSaveStatus("Saving…");
        try {
          const result = await operation(current.current);
          current.current = result;
          setRecord(result);
          setSaveStatus("Progress saved");
          setError("");
          return result;
        } catch (e) {
          setSaveStatus("Not saved: keep this page open");
          setError(e instanceof Error ? e.message : "Save failed.");
          throw e;
        }
      });
    queue.current = next;
    return next;
  }
  useEffect(() => {
    if (
      !draft ||
      !current.current ||
      JSON.stringify(draft) === JSON.stringify(current.current.draft)
    )
      return;
    setConfirmed(false);
    setSaveStatus("Changes waiting to save…");
    const timer = setTimeout(() => {
      void mutate((record) =>
        intakeRequest("/api/intake", jsonRequest({ revision: record.revision, draft })),
      ).catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    title.current?.focus();
  }, [draft?.stage, section]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (draft && JSON.stringify(draft) !== JSON.stringify(current.current?.draft)) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [draft]);
  function answer(id: string, value: IntakeValue | undefined) {
    setDraft((old) => {
      if (!old) return old;
      const answers = { ...old.answers };
      if (value === undefined) delete answers[id];
      else answers[id] = value;
      return { ...old, answers };
    });
  }
  function go(stage: number) {
    setDraft((old) => (old ? { ...old, stage } : old));
    setSection(0);
    setConfirmed(false);
  }
  async function finish() {
    if (!draft || !confirmed) return;
    setSubmitting(true);
    try {
      await mutate((record) =>
        intakeRequest(
          "/api/intake",
          jsonRequest({ revision: record.revision, draft, confirm: true }),
        ),
      );
      router.push("/dashboard");
    } catch {
      setSubmitting(false);
    }
  }
  if (!record || !draft)
    return (
      <div className="space-y-4">
        <p role="status">{saveStatus}</p>
        {error && <p role="alert">{error}</p>}
        <EmergencyHousing />
        {error && <Button onClick={() => window.location.reload()}>Try loading again</Button>}
      </div>
    );
  const questions = visibleQuestions(draft.answers, draft.stage);
  const sections = [...new Set(questions.map((q) => q.section))];
  const selectedSection = sections[Math.min(section, sections.length - 1)];
  const displayed =
    draft.stage === 1 ? questions.filter((q) => q.section === selectedSection) : questions;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-teal-700">Spokane wildfire recovery</p>
        <h1 className="text-3xl font-semibold tracking-tight">Let’s work out your next steps</h1>
      </div>
      <nav aria-label="Intake stages" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-current={draft.stage === i ? "step" : undefined}
            onClick={() => go(i)}
            className={`rounded border p-3 text-left text-sm ${draft.stage === i ? "border-teal-700 bg-teal-50 font-semibold text-teal-900" : "bg-white text-slate-600"}`}
          >
            <span className="mb-1 block text-xs">
              {i < 3 ? `Stage ${i + 1}` : "Before you finish"}
            </span>
            {label}
          </button>
        ))}
      </nav>
      <p aria-live="polite" role="status" className="text-xs text-slate-600">
        {saveStatus}
      </p>
      {error && (
        <div
          role="alert"
          className="space-y-2 border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          <p>{error}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void mutate((record) =>
                intakeRequest("/api/intake", jsonRequest({ revision: record.revision, draft })),
              ).catch(() => {})
            }
          >
            Retry saving
          </Button>
        </div>
      )}
      {(draft.answers.safeTonight === "no" || draft.answers.safeTonight === "unknown") && (
        <EmergencyHousing />
      )}
      <section className="space-y-6 rounded-xl border bg-white p-5 sm:p-8">
        <h2 ref={title} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          {stages[draft.stage]}
        </h2>
        {draft.stage === 1 && (
          <nav aria-label="Recovery topics" className="flex flex-wrap gap-2">
            {sections.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-current={selectedSection === label ? "step" : undefined}
                onClick={() => setSection(i)}
                className={`rounded border px-3 py-2 text-sm ${selectedSection === label ? "border-teal-700 bg-teal-50 text-teal-900" : "text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {draft.stage < 2 && (
          <div className="space-y-7">
            {displayed.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                value={draft.answers[q.id]}
                onChange={(value) => answer(q.id, value)}
              />
            ))}
            {draft.stage === 1 &&
              selectedSection === "Assistance" &&
              (draft.answers.assistanceApplied === "yes" ||
                draft.answers.assistanceApplied === "unknown" ||
                draft.answers.assistanceInterest === "yes" ||
                draft.applications.length > 0) && (
                <ApplicationFields
                  applications={draft.applications}
                  onChange={(applications) => setDraft({ ...draft, applications })}
                />
              )}
          </div>
        )}
        {draft.stage === 2 && (
          <IntakeDocuments
            record={record}
            answers={draft.answers}
            mutate={mutate}
            onUseAddress={(address) => answer("affectedStreet", address)}
          />
        )}
        {draft.stage === 3 && (
          <div className="space-y-6">
            <p className="text-sm text-slate-600">
              Confirm what you know. Unanswered, skipped and “Not sure” answers remain distinct.
              Only relevant answers personalize your map; earlier hidden answers stay saved for
              later edits.
            </p>
            {[0, 1].map((stage) => (
              <section key={stage} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{stages[stage]}</h3>
                  <Button type="button" size="sm" variant="ghost" onClick={() => go(stage)}>
                    Edit
                  </Button>
                </div>
                <dl className="divide-y">
                  {visibleQuestions(draft.answers, stage).map((q) => {
                    const value = draft.answers[q.id];
                    const label = (v: string) =>
                      v === "skipped"
                        ? "Skipped"
                        : v === "unknown"
                          ? "Not sure"
                          : (q.options?.find(([id]) => id === v)?.[1] ?? v);
                    return (
                      <div key={q.id} className="py-3 text-sm">
                        <dt className="text-slate-600">{q.label}</dt>
                        <dd className="mt-1 break-words font-medium">
                          {Array.isArray(value)
                            ? value.map(label).join(", ") || "Unanswered"
                            : value
                              ? label(value)
                              : "Unanswered"}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
            {draft.applications.length > 0 && (
              <section>
                <h3 className="font-semibold">Assistance applications</h3>
                <ul className="mt-2 space-y-3">
                  {draft.applications.map((app, i) => (
                    <li key={app.id} className="rounded border p-3 text-sm">
                      <p className="font-medium">
                        {app.organization || `Application ${i + 1}`}:{" "}
                        {applicationStatuses.find(([id]) => id === app.status)?.[1] || "Unanswered"}
                      </p>
                      <p>Outstanding requests: {app.outstanding || "Unanswered"}</p>
                      {app.action && <p>{app.action}</p>}
                      {app.deadline && <p>Recorded deadline: {app.deadline}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <div className="flex justify-between">
                <h3 className="font-semibold">Supporting documents</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => go(2)}>
                  Review documents
                </Button>
              </div>
              {record.documents.length ? (
                <ul className="space-y-2 text-sm">
                  {record.documents.map((doc) => (
                    <li key={doc.id}>
                      {documentTypes.find(([id]) => id === doc.type)?.[1]}: Uploaded;{" "}
                      {doc.confirmedAt ? "information confirmed" : "information not confirmed"};
                      recipient acceptance: {doc.recipientStatus}.
                      {documentConflicts(doc, draft.answers, record.documents).length > 0 && (
                        <p className="mt-1 text-amber-900">
                          Check differences:{" "}
                          {documentConflicts(doc, draft.answers, record.documents).join(" ")}
                          {doc.conflictAcknowledgment
                            ? ` Explanation saved: ${doc.conflictAcknowledgment}`
                            : " Review this document before relying on its information."}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">
                  No documents uploaded. You can finish without them.
                </p>
              )}
            </section>
            <label className="flex items-start gap-3 rounded border bg-teal-50 p-4 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 size-4"
              />
              I reviewed these answers. Use the information I provided to personalize my recovery
              map.
            </label>
            <Button
              type="button"
              size="lg"
              disabled={!confirmed || submitting}
              isLoading={submitting}
              onClick={() => void finish()}
            >
              Save and show my recovery map
            </Button>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-3 border-t pt-5">
          <Button
            type="button"
            variant="secondary"
            disabled={draft.stage === 0}
            onClick={() =>
              draft.stage === 1 && section > 0
                ? setSection(section - 1)
                : go(Math.max(0, draft.stage - 1))
            }
          >
            Back
          </Button>
          {draft.stage < 3 && (
            <Button
              type="button"
              onClick={() =>
                draft.stage === 1 && section < sections.length - 1
                  ? setSection(section + 1)
                  : go(draft.stage + 1)
              }
            >
              {draft.stage === 1 && section < sections.length - 1
                ? "Next topic"
                : draft.stage === 2
                  ? "Review answers"
                  : "Continue"}
            </Button>
          )}
        </div>
      </section>
      {record.confirmedAt && (
        <Link href="/dashboard" className="inline-block text-sm text-teal-800 underline">
          View the map from your last confirmed answers
        </Link>
      )}
    </div>
  );
}
