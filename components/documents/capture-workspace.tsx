"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ImagePicker } from "./image-picker";
import { prepareCapture, downloadText } from "@/lib/image-capture";
import { parseDocumentTextResult } from "@/lib/document-text-result";
import { PHOTO_LIMITATION, parseDamageAnalysis } from "@/lib/damage-photo-result";
import type { DamagePhotoAnalysis, DocumentKind, DocumentTextResult } from "@/types/image-capture";

type Mode = "document" | "house";
const documentLabels = {
  ID: "Identity document",
  UTILITY_BILL: "Utility bill",
  OTHER: "Other document",
};
const fieldClass =
  "mt-2 block w-full border border-slate-300 bg-white p-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20";

export function CaptureWorkspace() {
  const [mode, setMode] = useState<Mode>("document");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Capture tool">
        <Button
          variant={mode === "document" ? "primary" : "secondary"}
          aria-pressed={mode === "document"}
          onClick={() => setMode("document")}
        >
          Document to text
        </Button>
        <Button
          variant={mode === "house" ? "primary" : "secondary"}
          aria-pressed={mode === "house"}
          onClick={() => setMode("house")}
        >
          House-photo review
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Results are temporary. Download what you need before switching tools, choosing another
        image, or leaving this page.
      </p>
      <CaptureTool key={mode} mode={mode} />
    </div>
  );
}

function CaptureTool({ mode }: { mode: Mode }) {
  const house = mode === "house";
  const [kind, setKind] = useState<DocumentKind>("ID");
  const [image, setImage] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [ocr, setOcr] = useState<DocumentTextResult | null>(null);
  const [text, setText] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [analysis, setAnalysis] = useState<DamagePhotoAnalysis | null>(null);
  const [consent, setConsent] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const operation = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      operation.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/image-analysis", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = await response.json();
        if (typeof value.configured !== "boolean") throw new Error();
        if (!controller.signal.aborted) setConfigured(value.configured);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not check image-analysis availability. You can try submitting an image.");
      });
    return () => controller.abort();
  }, []);

  function clearResult() {
    setOcr(null);
    setText("");
    setReviewed(false);
    setAnalysis(null);
    setError("");
  }
  function clear() {
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
    setProgress("");
    setImage(null);
    setFilename("");
    setConsent(false);
    setAccessCode("");
    clearResult();
  }
  async function select(file: File) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    clearResult();
    setImage(null);
    setConsent(false);
    setFilename("");
    setBusy(true);
    setProgress("Preparing the image…");
    try {
      const prepared = await prepareCapture(file, house ? 2048 : 3200);
      if (controller.signal.aborted) return;
      setImage(prepared);
      setFilename(file.name);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Could not prepare this image.");
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function analyze() {
    if (!image || busy) return;
    clearResult();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setProgress(house ? "Reviewing visible damage…" : "Reading document text…");
    try {
      const response = await fetch("/api/image-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Analysis-Code": accessCode },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]),
        body: JSON.stringify({ image, consent, mode, documentKind: kind }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(typeof data.error === "string" ? data.error : "Image analysis failed.");
      if (controller.signal.aborted) return;
      if (house) {
        setAnalysis(parseDamageAnalysis(data.result));
      } else {
        const result = parseDocumentTextResult(data.result);
        setOcr(result);
        setText(result.text);
        if (!result.text)
          setError(
            "No readable document text was found. Try a sharper, well-lit photo with the whole document visible.",
          );
      }
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error && err.name === "TimeoutError"
            ? "Image analysis timed out. Try again."
            : err instanceof Error
              ? err.message
              : "Image analysis failed. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setProgress("");
      }
    }
  }

  function cancel() {
    operation.current?.abort();
    setBusy(false);
    setProgress("Canceled locally. A submitted image may already have reached OpenAI.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">
            {house ? "Capture the property" : "Capture a document"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {house
              ? "Use a photo taken from a safe location. Include the area of concern without approaching damage. Avoid people and identifying details."
              : "Place the document flat, include every edge, and avoid glare. Names, dates, and numbers need careful review."}
          </p>
        </div>
        {!house && (
          <Select
            id="document-kind"
            label="Document type"
            value={kind}
            disabled={busy}
            onChange={(event) => {
              setKind(event.target.value as DocumentKind);
              setReviewed(false);
            }}
            options={Object.entries(documentLabels).map(([value, label]) => ({ value, label }))}
          />
        )}
        {configured === false && (
          <p
            role="status"
            className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          >
            Image analysis needs setup by the app owner. You can capture and preview an image, but
            extraction and damage review require the OpenAI connection.
          </p>
        )}
        <ImagePicker
          disabled={busy}
          onSelect={(file) => {
            void select(file);
          }}
        />
        {image && (
          <figure className="space-y-2">
            {/* Local data URL; optimization would upload sensitive images to a server. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={
                house
                  ? "Selected property photo for review"
                  : "Selected document for text extraction"
              }
              className="max-h-96 w-full border bg-slate-50 object-contain"
            />
            <figcaption className="break-all text-xs text-slate-500">{filename}</figcaption>
          </figure>
        )}
        <div className="space-y-4">
          <Input
            id="analysis-code"
            label="Image-analysis access code"
            type="password"
            autoComplete="off"
            value={accessCode}
            disabled={busy || configured === false}
            onChange={(event) => setAccessCode(event.target.value)}
            hint="Provided by the app owner. This is not an API key."
          />
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              disabled={busy || !image || configured === false}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Send this{" "}
              {house ? "house photo" : "document image, including any personal details it contains"}{" "}
              through Cascadia Aid to OpenAI for analysis. Provider retention rules apply. Cascadia
              Aid does not save the image or result.
            </span>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              void analyze();
            }}
            isLoading={busy}
            disabled={!image || !consent || !accessCode.trim() || configured === false}
          >
            {house ? "Analyze house photo" : "Extract text"}
          </Button>
          {busy ? (
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" disabled={!image && !error} onClick={clear}>
              Clear
            </Button>
          )}
        </div>
        <p role="status" aria-live="polite" className="text-sm text-slate-600">
          {progress}
        </p>
        {error && (
          <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </Card>
      <Card
        className="space-y-5"
        aria-label={house ? "Photo review result" : "Extracted document text"}
      >
        <h2 className="text-xl font-semibold">
          {house ? "Visible-damage observations" : "Review the extracted text"}
        </h2>
        {house ? (
          <>
            <p className="border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
              {PHOTO_LIMITATION}
            </p>
            {analysis ? (
              <>
                <p className="text-sm font-medium text-teal-800">
                  AI draft · Professional review required
                </p>
                <p className="text-sm text-slate-600">
                  Photo quality: {analysis.imageQuality.toLowerCase()} · Subject:{" "}
                  {analysis.subject.toLowerCase()}
                </p>
                <p>{analysis.summary}</p>
                {analysis.observations.length ? (
                  <ul className="space-y-3">
                    {analysis.observations.map((observation, index) => (
                      <li key={index} className="border p-3">
                        <p className="font-medium">{observation.location}</p>
                        <p className="mt-1 text-sm">{observation.description}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          Observation certainty: {observation.certainty.toLowerCase()} (not a safety
                          rating)
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-600">
                    No damage observations could be established from this image. This does not rule
                    out damage.
                  </p>
                )}
                <div>
                  <h3 className="font-medium">What this photo cannot tell us</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {analysis.limitations.map((limit, index) => (
                      <li key={index}>{limit}</li>
                    ))}
                  </ul>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadText(
                      [
                        "Cascadia Aid — House-photo observations (AI draft)",
                        PHOTO_LIMITATION,
                        `Photo quality: ${analysis.imageQuality}; Subject: ${analysis.subject}`,
                        analysis.summary,
                        ...analysis.observations.map(
                          (o) =>
                            `${o.location}: ${o.description} (observation certainty: ${o.certainty})`,
                        ),
                        "Limitations:",
                        ...analysis.limitations,
                      ].join("\n\n"),
                      "house-photo-observations.txt",
                    )
                  }
                >
                  Download draft report
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                After analysis, visible observations and photo limitations appear here. No recovery
                status changes automatically.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              AI text extraction reads letters from the image. It can confuse characters, and does
              not verify identity, an address, or document authenticity.
            </p>
            {ocr ? (
              <>
                <p role="status" className="text-sm text-slate-600">
                  Text extraction finished.{" "}
                  {ocr.imageQuality !== "CLEAR"
                    ? "Some text may be unclear; review every line carefully."
                    : "Compare every line with the original image."}
                </p>
                {ocr.limitations.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {ocr.limitations.map((limit, index) => (
                      <li key={index}>{limit}</li>
                    ))}
                  </ul>
                )}
                <label htmlFor="extracted-text" className="block text-sm font-medium">
                  {documentLabels[kind]} — editable text
                  <textarea
                    id="extracted-text"
                    rows={14}
                    className={`${fieldClass} font-mono`}
                    value={text}
                    spellCheck={false}
                    onChange={(event) => {
                      setText(event.target.value);
                      setReviewed(false);
                    }}
                  />
                </label>
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  <span>I compared this text with the image and corrected any errors.</span>
                </label>
                <Button
                  variant="secondary"
                  disabled={!text.trim()}
                  onClick={() =>
                    downloadText(
                      text,
                      `${kind.toLowerCase()}-${reviewed ? "reviewed" : "draft"}.txt`,
                    )
                  }
                >
                  Download {reviewed ? "reviewed" : "draft"} text
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Choose or photograph an ID, utility bill, or other printed document, then select
                “Extract text.”
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
