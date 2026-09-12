"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { ImagePicker } from "@/components/documents/image-picker";
import { prepareCapture } from "@/lib/image-capture";
import { analyzeCapture } from "@/lib/capture-analysis-client";
import { parseDocumentTextResult } from "@/lib/document-text-result";
import { parseDamageAnalysis, PHOTO_LIMITATION } from "@/lib/damage-photo-result";
import { documentConflicts } from "@/lib/intake-recovery";
import { intakeRequest, jsonRequest } from "@/lib/intake-client";
import { documentTypes } from "@/data/intake-questions";
import type { IntakeAnswers, IntakeDocument, IntakeRecord } from "@/types/intake";

type Mutate = (operation: (record: IntakeRecord) => Promise<IntakeRecord>) => Promise<IntakeRecord>;
export function IntakeDocuments({
  record,
  answers,
  mutate,
  onUseAddress,
  initialType,
}: {
  initialType?: string;
  record: IntakeRecord;
  answers: IntakeAnswers;
  mutate: Mutate;
  onUseAddress: (address: string) => void;
}) {
  const [type, setType] = useState<string>(initialType || documentTypes[0][0]);
  const [selected, setSelected] = useState<IntakeDocument | null>(null);
  const [image, setImage] = useState("");
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/image-analysis", { signal: controller.signal })
      .then((r) => r.json())
      .then((r) => setConfigured(r.configured === true))
      .catch(() => {});
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, []);
  function open(doc: IntakeDocument) {
    operation.current?.abort();
    setSelected(structuredClone(doc));
    setImage("");
    setText(doc.reviewedText || "");
    setReviewed(false);
    setConsent(false);
    setError("");
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareCapture(file, type === "damage-photo" ? 2048 : 3200);
      const bytes = await (await fetch(prepared)).arrayBuffer();
      const result = await mutate(() =>
        intakeRequest(`/api/intake/documents?type=${encodeURIComponent(type)}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: bytes,
        }),
      );
      open(result.documents[result.documents.length - 1]);
      setImage(prepared);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function extract() {
    if (!selected) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    operation.current = controller;
    try {
      let source = image;
      if (!source) {
        const response = await fetch(`/api/intake/documents/${selected.id}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not open the saved document.");
        const blob = await response.blob();
        source = await prepareCapture(
          new File([blob], "document.jpg", { type: "image/jpeg" }),
          3200,
        );
      }
      const result = await analyzeCapture(
        {
          image: source,
          consent,
          mode: selected.type === "damage-photo" ? "house" : "document",
          documentKind:
            selected.type === "id"
              ? "ID"
              : selected.type === "utility-bill"
                ? "UTILITY_BILL"
                : "OTHER",
        },
        code,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (selected.type === "damage-photo") {
        const value = parseDamageAnalysis(result);
        setText(
          [
            PHOTO_LIMITATION,
            value.summary,
            ...value.observations.map((o) => `${o.location}: ${o.description}`),
            ...value.limitations,
          ].join("\n\n"),
        );
      } else {
        const value = parseDocumentTextResult(result);
        setText(
          value.text +
            (value.limitations.length
              ? `\n\nExtraction limitations: ${value.limitations.join("; ")}`
              : ""),
        );
        // Suggestions are deliberately narrow. No IDs/account numbers or arbitrary dates are retained.
        const name =
          value.text.match(/^(?:full name|name|named insured)\s*:\s*([^\n]{2,120})/im)?.[1] ?? "";
        const address =
          value.text.match(
            /^(?:property address|service address|loss location|address)\s*:\s*([^\n]{3,200})/im,
          )?.[1] ?? "";
        const date =
          value.text.match(/^(?:date of loss|wildfire date)\s*:\s*(\d{4}-\d{2}-\d{2})/im)?.[1] ??
          "";
        setSelected((doc) =>
          doc
            ? {
                ...doc,
                confirmedAt: null,
                fields: {
                  ...doc.fields,
                  name: doc.fields.name || name,
                  address: doc.fields.address || address,
                  date: doc.fields.date || date,
                  dateMeaning: date ? "wildfire" : doc.fields.dateMeaning,
                },
              }
            : doc,
        );
      }
      setReviewed(false);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Extraction failed. You can still review the document yourself.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function field(key: keyof IntakeDocument["fields"], value: string) {
    setSelected((doc) =>
      doc ? { ...doc, confirmedAt: null, fields: { ...doc.fields, [key]: value } } : doc,
    );
    setReviewed(false);
  }
  const conflicts = selected ? documentConflicts(selected, answers, record.documents) : [];
  async function save(confirm: boolean) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const document = {
        ...selected,
        reviewedText: text,
        confirmedAt: confirm ? new Date().toISOString() : null,
      };
      const result = await mutate((current) =>
        intakeRequest(
          `/api/intake/documents/${selected.id}`,
          jsonRequest({ revision: current.revision, document }),
        ),
      );
      setSelected(result.documents.find((d) => d.id === selected.id)!);
      setReviewed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save document review.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Upload what you already have, or continue without documents. Photos of documents are
        supported. Redact SSNs, banking details and ID numbers before uploading; they are not needed
        to personalize your map.
      </p>
      <Select
        id="intake-document-type"
        label="What are you uploading?"
        value={type}
        onChange={(e) => setType(e.target.value)}
        disabled={busy}
        options={documentTypes.map(([value, label]) => ({ value, label }))}
      />
      <p className="text-sm text-slate-600">
        Choosing a photo saves a private copy with this household’s intake.
      </p>
      <ImagePicker disabled={busy} onSelect={(file) => void upload(file)} />
      {record.documents.length > 0 && (
        <ul className="space-y-2" aria-label="Saved supporting documents">
          {record.documents.map((doc) => (
            <li key={doc.id} className="rounded border p-3 text-sm">
              <button
                type="button"
                className="font-semibold text-teal-800 underline"
                disabled={busy}
                onClick={() => open(doc)}
              >
                {documentTypes.find(([id]) => id === doc.type)?.[1]} ·{" "}
                {new Date(doc.uploadedAt).toLocaleDateString()}
              </button>
              <p className="mt-1">
                {doc.testData ? "Test data" : "Uploaded"} ·{" "}
                {doc.confirmedAt ? "Information confirmed by you" : "Information not yet confirmed"}{" "}
                · Recipient:{" "}
                {doc.recipientStatus === "unknown"
                  ? "acceptance not known"
                  : `${doc.recipientStatus} (${doc.recipient})`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section
          aria-label="Confirm document information"
          className="space-y-5 rounded-lg border bg-slate-50 p-4 sm:p-6"
        >
          <h3 className="font-semibold">
            Review {documentTypes.find(([id]) => id === selected.type)?.[1]}
          </h3>
          <a
            className="text-sm text-teal-800 underline"
            href={`/api/intake/documents/${selected.id}`}
            target="_blank"
            rel="noreferrer"
          >
            {selected.testData ? "Open sample document" : "Open uploaded image"}
          </a>
          {selected.testData ? (
            <p className="text-sm text-slate-600">
              This is fictional test data. Sample fields are already filled in below.
            </p>
          ) : configured === false ? (
            <p className="text-sm text-amber-900">
              Automatic extraction is not configured. You can still review the image and confirm its
              information below.
            </p>
          ) : (
            <>
              <Input
                id="intake-analysis-code"
                type="password"
                autoComplete="off"
                label="Image-analysis access code (optional)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Send this image through Cascadia Aid to OpenAI for extraction. Provider retention
                rules apply.
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !consent || !code.trim()}
                onClick={() => void extract()}
              >
                Extract information
              </Button>
            </>
          )}
          {selected && (
            <div>
              <label htmlFor="intake-extraction" className="text-sm font-semibold">
                Document notes or extracted draft — compare with the original
              </label>
              <textarea
                id="intake-extraction"
                className="mt-2 w-full rounded border bg-white p-3 text-sm"
                rows={8}
                maxLength={24000}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setReviewed(false);
                }}
              />
              <p className="text-xs text-slate-500">
                The text you review and save is retained with this document and can be reused in
                prepared packets. Extraction does not verify identity, coverage, eligibility or
                safety.
              </p>
            </div>
          )}
          <Input
            id="doc-name"
            label="Name shown (optional)"
            value={selected.fields.name}
            maxLength={500}
            onChange={(e) => field("name", e.target.value)}
          />
          <Input
            id="doc-address"
            label="Address shown (optional)"
            value={selected.fields.address}
            maxLength={500}
            onChange={(e) => field("address", e.target.value)}
          />
          <Input
            id="doc-date"
            type="date"
            label="Relevant date shown (optional)"
            value={selected.fields.date}
            onChange={(e) => field("date", e.target.value)}
          />
          <Select
            id="doc-date-meaning"
            label="What does that date refer to?"
            value={selected.fields.dateMeaning}
            onChange={(e) => field("dateMeaning", e.target.value)}
            options={[
              { value: "unknown", label: "Not sure" },
              { value: "wildfire", label: "Wildfire / date of loss" },
              { value: "issued", label: "Document issued" },
              { value: "other", label: "Another event" },
            ]}
          />
          <Select
            id="doc-scope"
            label="What does this document support?"
            value={selected.fields.scope}
            onChange={(e) => field("scope", e.target.value)}
            options={[
              { value: "unknown", label: "Not sure" },
              { value: "affected-property", label: "The affected property" },
              { value: "household", label: "This household" },
              { value: "other", label: "Another property or household" },
            ]}
          />
          {conflicts.length > 0 && (
            <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-semibold">Check these differences</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Input
                id="doc-conflict-note"
                label="Explain the difference, or correct the fields above"
                value={selected.conflictAcknowledgment}
                onChange={(e) => {
                  setSelected({
                    ...selected,
                    confirmedAt: null,
                    conflictAcknowledgment: e.target.value,
                  });
                  setReviewed(false);
                }}
              />
            </div>
          )}
          <Select
            id="doc-recipient-status"
            label="Has a recipient accepted this document?"
            value={selected.recipientStatus}
            onChange={(e) =>
              setSelected({
                ...selected,
                recipientStatus: e.target.value as IntakeDocument["recipientStatus"],
              })
            }
            options={[
              { value: "unknown", label: "Not known / not sent" },
              { value: "pending", label: "Sent, awaiting response" },
              { value: "accepted", label: "Recipient confirmed acceptance" },
              { value: "rejected", label: "Recipient rejected it or requested a replacement" },
            ]}
          />
          {selected.recipientStatus !== "unknown" && (
            <Input
              id="doc-recipient"
              label="Which recipient?"
              value={selected.recipient}
              maxLength={200}
              onChange={(e) => setSelected({ ...selected, recipient: e.target.value })}
            />
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              className="mt-1 size-4"
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I checked the information against the document and corrected or explained any
            differences. This does not mean a recipient has accepted it.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={
                busy ||
                !reviewed ||
                (conflicts.length > 0 && !selected.conflictAcknowledgment.trim())
              }
              onClick={() => void save(true)}
            >
              Confirm information
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Save as unconfirmed
            </Button>
          </div>
          {selected.confirmedAt &&
            selected.fields.scope === "affected-property" &&
            selected.fields.address &&
            (!answers.affectedStreet ||
              ["unknown", "skipped"].includes(String(answers.affectedStreet))) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onUseAddress(selected.fields.address)}
              >
                Use confirmed address in intake
              </Button>
            )}
        </section>
      )}
      {busy && <p role="status">Saving or processing your document…</p>}
      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
