"use client";

import Link from "next/link";
import { cleanDraftText } from "@/lib/draft-text";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { documentTypes } from "@/data/intake-questions";
import { outcomeDocumentTypes } from "@/data/journey-workflows";
import { journeySteps } from "@/data/journey-steps";
import { journeyConnections } from "@/data/journey-connections";
import { journeyAutomation } from "@/data/journey-automation";
import { TaskAutomation } from "./task-automation";
import { organizationForTask } from "@/lib/household-organizations";
import {
  baseTaskId,
  getJourney,
  journeyDefinitions,
  usableDocument,
  type EvaluatedJourneyTask,
} from "@/lib/recovery-journey";
import type { IntakeRecord } from "@/types/intake";
import type { JourneyCommand } from "./demo-controls";

const field =
  "mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3 text-slate-900";
const link = "font-medium text-teal-800 underline underline-offset-4";

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 sm:gap-4">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-50 font-semibold text-teal-800"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-3 pt-0.5">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        {children}
      </div>
    </li>
  );
}

export function TaskWorkspace({
  record,
  item,
  command,
  busy,
  onChoose,
  onDirtyChange,
}: {
  record: IntakeRecord;
  item: EvaluatedJourneyTask;
  command: JourneyCommand;
  busy: boolean;
  onChoose: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { definition, task, status } = item;
  const journey = getJourney(record);
  const [packet, setPacket] = useState<{
    text: string;
    recipient: string;
    documentIds: string[];
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeIds, setOutcomeIds] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [response, setResponse] = useState("approved");
  const dirty = packet !== null || !!outcomeNote || outcomeIds !== null;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const canAct = !["blocked", "not-applicable", "achieved", "closed"].includes(status);
  const terminal = ["achieved", "closed", "not-applicable"].includes(status);
  const artifact = task.artifact;
  const draft = packet ?? artifact;
  const docs = record.documents.filter((doc) => usableDocument(doc, record));
  const requiredTypes =
    baseTaskId(definition.id) === "hazards" && record.confirmed?.answers.removalRequired === "yes"
      ? ["asbestos-clearance"]
      : outcomeDocumentTypes[baseTaskId(definition.id)] || [];
  const evidence = docs.filter((doc) => requiredTypes.includes(doc.type));
  const selectedEvidence = (outcomeIds ?? evidence.map((doc) => doc.id)).filter((id) =>
    evidence.some((doc) => doc.id === id),
  );
  const steps = journeySteps[baseTaskId(definition.id)];
  const connection = journeyConnections[baseTaskId(definition.id)];
  const organization = organizationForTask(record, definition.id);
  const siblings = journeyDefinitions(record).filter(
    (d) => baseTaskId(d.id) === baseTaskId(definition.id),
  );
  const submitted =
    !!task.submittedAt || definition.prerequisites.some((p) => !!journey.tasks[p.id]?.submittedAt);
  function docLabel(id: string) {
    const doc = record.documents.find((d) => d.id === id);
    return doc
      ? `${documentTypes.find(([type]) => type === doc.type)?.[1] || doc.type}${doc.testData ? " · simulated" : ""} · ${doc.fields.name || doc.fields.date || doc.id.slice(0, 6)}`
      : "Unavailable document";
  }
  async function run(fields: Record<string, unknown>, done?: () => void) {
    setMessage("");
    try {
      await command({ ...fields, taskId: definition.id });
      done?.();
      setMessage("Saved.");
    } catch {
      // Keep edits available for retry without showing an error or a success message.
    }
  }
  async function prepare() {
    setPreparing(true);
    await run({ kind: "prepare", assist: true }, () => {
      setReviewing(true);
      setPacket(null);
    });
    setPreparing(false);
  }
  async function download(kind: "packet" | "calendar") {
    setDownloading(true);
    try {
      const result = await fetch(`/api/intake/${kind}?task=${encodeURIComponent(definition.id)}`, {
        cache: "no-store",
      });
      if (!result.ok) {
        const body = await result.json();
        throw new Error(body.error || "Could not download this file.");
      }
      const url = URL.createObjectURL(await result.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseTaskId(definition.id)}.${kind === "packet" ? "pdf" : "ics"}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Leave the download available for another attempt.
    } finally {
      setDownloading(false);
    }
  }
  function editPacket(change: Partial<NonNullable<typeof packet>>) {
    if (draft)
      setPacket({
        text: draft.text,
        recipient: draft.recipient,
        documentIds: draft.documentIds,
        ...change,
      });
  }
  return (
    <div
      className="space-y-5 text-sm leading-6 text-slate-600"
      aria-label="Steps to reach your goal"
    >
      {siblings.length > 1 && (
        <label className="block">
          Program
          <select
            className={field}
            value={definition.id}
            disabled={busy}
            onChange={(event) => onChoose(event.target.value)}
          >
            {siblings.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {terminal ? (
        <div className="space-y-3">
          <p>
            {task.outcome
              ? `${task.outcome.simulated ? "Simulated result: " : ""}${task.outcome.note}`
              : "Your saved household information says this goal does not apply."}
          </p>
          {task.outcome ? (
            <>
              <label className="block">
                Need to correct this result?
                <textarea
                  className={field}
                  rows={2}
                  maxLength={2000}
                  placeholder="Explain what needs to change (at least 12 characters)."
                  value={outcomeNote}
                  onChange={(event) => setOutcomeNote(event.target.value)}
                />
              </label>
              <Button
                disabled={busy || outcomeNote.trim().length < 12}
                variant="secondary"
                onClick={() =>
                  void run({ kind: "reopen", note: outcomeNote }, () => setOutcomeNote(""))
                }
              >
                Reopen goal
              </Button>
            </>
          ) : (
            <Link className={link} href="/intake">
              Update household information
            </Link>
          )}
        </div>
      ) : (
        <ol className="space-y-8" aria-label="Three steps to reach your goal">
          <Step number={1} title={steps[0]}>
            <p className="font-medium text-slate-900">
              Organization:{" "}
              {organization.name ? (
                organization.sourceUrl ? (
                  <a
                    className={link}
                    href={organization.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {organization.name}
                  </a>
                ) : (
                  organization.name
                )
              ) : (
                "Finding the responsible organization"
              )}
            </p>
            {organization.name ? (
              <p>{organization.role}</p>
            ) : (
              <>
                <p>{organization.question}</p>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run({ kind: "organizations", refresh: true })}
                >
                  Find organization
                </Button>
                <Link className={link} href="/intake">
                  Update household details
                </Link>
              </>
            )}
            <p>
              I’ll use your saved answers and reviewed documents to prepare a draft. AI will help
              write it when available.
            </p>
            {item.applicable === null && (
              <p>
                <Link className={link} href="/intake">
                  Confirm your household information
                </Link>{" "}
                so we can check whether this goal applies.
              </p>
            )}
            {!artifact ? (
              <Button
                disabled={busy || !record.confirmed}
                isLoading={preparing}
                onClick={() => void prepare()}
              >
                {preparing ? "Preparing…" : "Prepare for me"}
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="font-medium text-teal-800">
                  {artifact.preparation === "ai"
                    ? "AI draft ready for your review."
                    : "Draft filled from saved information."}{" "}
                  {artifact.documentIds.length} supporting{" "}
                  {artifact.documentIds.length === 1 ? "document" : "documents"} selected.
                </p>
                {artifact.preparation === "autofill" && (
                  <p>
                    AI writing is unavailable. Your saved information was still filled in
                    automatically.
                  </p>
                )}
                <Button
                  variant="secondary"
                  disabled={busy || !!packet}
                  isLoading={preparing}
                  onClick={() => void prepare()}
                >
                  Prepare a fresh draft
                </Button>
              </div>
            )}
            {!record.confirmed && (
              <Link href="/intake" className={link}>
                Confirm your household information to begin
              </Link>
            )}
          </Step>
          <Step number={2} title={steps[1]}>
            {journeyAutomation[baseTaskId(definition.id)]?.mode !== "document" && (
              <TaskAutomation
                taskId={definition.id}
                job={task.automation}
                busy={busy}
                disabled={
                  !record.confirmed || !canAct || item.applicable === null || journey.demo.enabled
                }
                command={command}
              />
            )}
            {connection && (
              <div className="space-y-2">
                <p>{connection.guidance}</p>
                <ul className="space-y-2" aria-label="Application and service connections">
                  {connection.links.map((destination) => (
                    <li key={destination.href}>
                      <a
                        className={link}
                        href={destination.href}
                        target={destination.href.startsWith("https:") ? "_blank" : undefined}
                        rel={
                          destination.href.startsWith("https:") ? "noopener noreferrer" : undefined
                        }
                      >
                        {destination.label}
                        {destination.href.startsWith("https:") && (
                          <span className="sr-only"> (opens in a new tab)</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.blockers.length > 0 && (
              <div className="space-y-2 rounded-lg bg-amber-50 p-3">
                <p className="font-medium text-amber-900">
                  Prepare now; finish these goals before taking this action:
                </p>
                {item.blockers.map((blocker) => (
                  <p key={blocker.id}>
                    <button
                      type="button"
                      disabled={busy}
                      className={link}
                      onClick={() => onChoose(blocker.id)}
                    >
                      {blocker.title}
                    </button>{" "}
                    : {blocker.reason}
                  </p>
                ))}
              </div>
            )}
            <p>
              {artifact
                ? "Check the draft. You can download it to use directly with the organization. AI handling uses your confirmed facts and documents."
                : "Your draft will appear here after preparation."}
            </p>
            {artifact && !reviewing && (
              <Button variant="secondary" disabled={busy} onClick={() => setReviewing(true)}>
                Review draft
              </Button>
            )}
            {artifact && draft && reviewing && (
              <div className="space-y-3 border-l-2 border-teal-100 pl-4">
                <label className="block">
                  For
                  <input
                    className={field}
                    maxLength={200}
                    value={
                      artifact.receipt || artifact.approvedAt
                        ? draft.recipient
                        : organization.name || draft.recipient
                    }
                    readOnly
                    placeholder="Finding the responsible organization"
                  />
                </label>
                <label className="block">
                  Your draft
                  <textarea
                    className={field}
                    rows={8}
                    maxLength={12000}
                    value={cleanDraftText(draft.text)}
                    disabled={busy}
                    onChange={(event) => editPacket({ text: event.target.value })}
                  />
                </label>
                {docs.filter(
                  (doc) =>
                    definition.evidenceTypes.includes(doc.type) ||
                    draft.documentIds.includes(doc.id),
                ).length > 0 && (
                  <fieldset>
                    <legend>Supporting documents</legend>
                    {docs
                      .filter(
                        (doc) =>
                          definition.evidenceTypes.includes(doc.type) ||
                          draft.documentIds.includes(doc.id),
                      )
                      .map((doc) => (
                        <label key={doc.id} className="flex items-start gap-2 py-1">
                          <input
                            type="checkbox"
                            className="mt-1.5"
                            disabled={busy}
                            checked={draft.documentIds.includes(doc.id)}
                            onChange={(event) =>
                              editPacket({
                                documentIds: event.target.checked
                                  ? [...draft.documentIds, doc.id]
                                  : draft.documentIds.filter((id) => id !== doc.id),
                              })
                            }
                          />
                          {docLabel(doc.id)}
                        </label>
                      ))}
                  </fieldset>
                )}
                <Link className={link} href="/intake?stage=2">
                  Add or review a document
                </Link>
                <div className="flex flex-wrap gap-2">
                  {packet && (
                    <Button
                      disabled={busy || !packet.text.trim() || !packet.recipient.trim()}
                      onClick={() =>
                        void run({ kind: "edit-artifact", ...packet }, () => setPacket(null))
                      }
                    >
                      Save draft edits
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy || downloading || !!packet}
                    onClick={() => void download("packet")}
                  >
                    Download draft PDF
                  </Button>
                </div>
                <p className="text-xs">
                  The PDF includes your draft and selected document images. Sample proof stays
                  labeled as fictional.
                </p>
              </div>
            )}
            {artifact?.receipt && (
              <p className="break-words">
                Simulated delivery recorded. Nothing was sent externally.
              </p>
            )}
            {task.dueDate && (
              <p className={item.overdue ? "text-amber-800" : ""}>
                Follow up {task.dueDate}.{" "}
                <button
                  type="button"
                  className={link}
                  disabled={downloading}
                  onClick={() => void download("calendar")}
                >
                  Save reminder
                </button>
              </p>
            )}
          </Step>
          <Step number={3} title={steps[2]}>
            <p>
              Add proof of the result, then confirm what happened. Your progress updates
              automatically.
            </p>
            {evidence.length > 0 ? (
              <fieldset>
                <legend className="sr-only">Evidence for this result</legend>
                {evidence.map((doc) => (
                  <label key={doc.id} className="flex items-start gap-2 py-1">
                    <input
                      type="checkbox"
                      className="mt-1.5"
                      disabled={busy}
                      checked={selectedEvidence.includes(doc.id)}
                      onChange={(event) =>
                        setOutcomeIds(
                          event.target.checked
                            ? [...selectedEvidence, doc.id]
                            : selectedEvidence.filter((id) => id !== doc.id),
                        )
                      }
                    />
                    {docLabel(doc.id)}
                  </label>
                ))}
              </fieldset>
            ) : (
              <p>
                Needed:{" "}
                {requiredTypes
                  .map((type) => documentTypes.find(([id]) => id === type)?.[1] || type)
                  .join(" or ")}
                .{" "}
                <Link className={link} href="/intake?stage=2">
                  Add proof
                </Link>
              </p>
            )}
            <label className="block">
              What happened?
              <textarea
                className={field}
                rows={2}
                maxLength={2000}
                placeholder="Briefly describe the result (at least 12 characters)."
                value={outcomeNote}
                disabled={busy}
                onChange={(event) => setOutcomeNote(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  busy || !canAct || outcomeNote.trim().length < 12 || !selectedEvidence.length
                }
                onClick={() =>
                  void run(
                    {
                      kind: "outcome",
                      confirm: true,
                      note: outcomeNote,
                      documentIds: selectedEvidence,
                    },
                    () => {
                      setOutcomeNote("");
                      setOutcomeIds(null);
                      setPacket(null);
                    },
                  )
                }
              >
                Confirm goal achieved
              </Button>
              <Button
                variant="ghost"
                disabled={busy || !canAct || outcomeNote.trim().length < 12}
                onClick={() =>
                  void run(
                    {
                      kind: "close",
                      confirm: true,
                      note: outcomeNote,
                      documentIds: selectedEvidence,
                    },
                    () => {
                      setOutcomeNote("");
                      setOutcomeIds(null);
                      setPacket(null);
                    },
                  )
                }
              >
                Close without achieving goal
              </Button>
            </div>
            {journey.demo.enabled && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium">Simulation only</p>
                <div className="flex flex-wrap gap-2">
                  {submitted && (
                    <>
                      <select
                        className="min-h-10 border bg-white px-2"
                        aria-label="Simulated reply"
                        value={response}
                        disabled={busy}
                        onChange={(event) => setResponse(event.target.value)}
                      >
                        <option value="approved">Approved</option>
                        <option value="information">More information needed</option>
                        <option value="denied">Denied</option>
                        <option value="partial">Partial result</option>
                      </select>
                      <Button
                        variant="secondary"
                        disabled={busy || !canAct}
                        onClick={() =>
                          void run({
                            kind: "response",
                            response,
                            note: "Fictional reply for this recovery step.",
                          })
                        }
                      >
                        Simulate reply
                      </Button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy || record.documents.length >= 50}
                    onClick={() => void run({ kind: "demo-evidence" })}
                  >
                    Add sample proof
                  </Button>
                </div>
                {task.response && (
                  <p>
                    Simulated reply: {task.response}. {task.responseNote}
                  </p>
                )}
              </div>
            )}
          </Step>
        </ol>
      )}
      {message && (
        <p role="status" className="text-teal-800">
          {message}
        </p>
      )}
    </div>
  );
}
