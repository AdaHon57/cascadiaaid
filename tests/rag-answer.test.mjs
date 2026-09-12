// Answer pipeline tests with a fake answer model (no network, no API key). They cover the three
// required question types — single-source, multi-source, unsupported — plus workflow context,
// citation validation, and input handling. The live equivalent is `npm run rag:eval`.
import assert from "node:assert/strict";
import test from "node:test";
import {
  askRecoveryQuestion,
  finalizeAnswer,
  NOT_FOUND_ANSWER,
  SYSTEM_PROMPT,
} from "../lib/rag/answer.ts";
import { RagError } from "../lib/rag/errors.ts";
import { recoveryEdges } from "../data/recovery-edges.ts";
import { recoveryNodes } from "../data/recovery-nodes.ts";
import { DOL_URL, DOR_URL, OIC_URL, fakeModel, makeIndex, passageIdFor } from "./rag-fixtures.mjs";

const index = makeIndex();
const base = { index, embeddingProvider: null };
const workflow = { nodes: recoveryNodes, edges: recoveryEdges };
const isRagError = (code) => (e) => e instanceof RagError && e.code === code;

test("single-source question cites only the page used", async () => {
  const { model, calls } = fakeModel((req) => {
    const id = passageIdFor(req.prompt, "no-charge replacement driver license");
    return {
      status: "answered",
      answer: `Yes. DOL offers a no-charge replacement driver license if yours was lost because of wildfire [${id}].`,
      cited_passage_ids: [id],
    };
  });
  const result = await askRecoveryQuestion(
    { question: "Can I replace my driver's license for free?" },
    { ...base, answerModel: model },
  );

  assert.equal(result.status, "answered");
  assert.deepEqual(result.sources, [
    { title: "Wildfire Relief", url: DOL_URL, chunkIds: ["dol-wildfire-relief:aaa"] },
  ]);
  assert.match(result.answer, /\[1\]\.$/);
  assert.ok(!/\[S\d+\]/.test(result.answer), "internal passage IDs are replaced");

  const req = calls[0];
  assert.equal(req.system, SYSTEM_PROMPT);
  assert.match(req.system, /Do not answer from model memory/);
  assert.match(req.system, /Do not infer eligibility/);
  assert.match(
    req.prompt,
    /<question>\nCan I replace my driver's license for free\?\n<\/question>/,
  );
  assert.match(req.prompt, /source_url: https:\/\/dol\.wa\.gov\/wildfire-relief/);
  assert.ok(!req.prompt.includes("<workflow_context>"), "no context block without context");
  assert.ok(!req.prompt.includes("hazardous materials removal"), "unrelated passages are not sent");
});

test("multi-source question deduplicates sources and numbers citations per page", async () => {
  const { model } = fakeModel((req) => {
    const dor = passageIdFor(req.prompt, "abatement of property taxes");
    const oic = passageIdFor(req.prompt, "Keep copies of everything");
    return {
      status: "answered",
      answer: `Destroyed property may qualify for tax abatement [${dor}]. Keep copies of receipts and photos [${oic}, ${dor}].`,
      cited_passage_ids: [dor, oic, dor],
    };
  });
  const result = await askRecoveryQuestion(
    {
      question:
        "Does destroyed property get property tax abatement, and what receipts should I keep for insurance?",
    },
    { ...base, answerModel: model },
  );
  assert.deepEqual(
    result.sources.map((s) => s.url),
    [DOR_URL, OIC_URL],
  );
  assert.equal(
    result.answer,
    "Destroyed property may qualify for tax abatement [1]. Keep copies of receipts and photos [2, 1].",
  );
});

test("unsupported question returns not_found with no sources", async () => {
  const { model } = fakeModel(() => ({
    status: "not_found",
    answer: "The approved sources do not say.",
    cited_passage_ids: [],
  }));
  const result = await askRecoveryQuestion(
    { question: "What is the SBA loan interest rate for rebuilding?" },
    { ...base, answerModel: model },
  );
  assert.equal(result.status, "not_found");
  assert.equal(result.answer, NOT_FOUND_ANSWER);
  assert.deepEqual(result.sources, []);
});

test("does not call the model when nothing relevant is retrieved", async () => {
  const { model, calls } = fakeModel(() => {
    throw new Error("should not be called");
  });
  const result = await askRecoveryQuestion(
    { question: "xylophone zebra quantum" },
    { ...base, answerModel: model },
  );
  assert.equal(result.status, "not_found");
  assert.equal(calls.length, 0);
});

test("node context is resolved from workflow definitions and shown to the model, not as a source", async () => {
  const { model, calls } = fakeModel((req) => {
    const id = passageIdFor(req.prompt, "Keep copies of everything");
    return {
      status: "answered",
      answer: `Keep copies of everything [${id}].`,
      cited_passage_ids: [id],
    };
  });
  const result = await askRecoveryQuestion(
    {
      question: "What should I keep track of for this step?",
      context: { nodeId: "insurance-claim", status: "READY" },
    },
    { ...base, workflow, answerModel: model },
  );

  const prompt = calls[0].prompt;
  const context = prompt.match(/<workflow_context>\n([\s\S]*?)\n<\/workflow_context>/)?.[1];
  assert.ok(context, "prompt includes a workflow_context block");
  assert.match(context, /current_step: Insurance claim \(insurance-claim\)/);
  assert.match(context, /step_status_in_app: READY/);
  assert.match(context, /evidence_labels_in_app: Insurance policy information; Damage inventory/);
  assert.match(
    context,
    /prerequisite_steps: Damage documentation \(damage-documentation\), relationship: REQUIRED/,
  );
  assert.match(context, /steps_that_depend_on_this: Repair\/rebuilding/);
  assert.ok(prompt.indexOf("<workflow_context>") > prompt.indexOf("</approved_source_passages>"));
  assert.match(SYSTEM_PROMPT, /It is app data, not a source: never cite it/);

  assert.deepEqual(
    result.sources.map((s) => s.url),
    [OIC_URL],
  );
});

test("node context steers retrieval for vague questions", async () => {
  const { model, calls } = fakeModel(() => ({
    status: "not_found",
    answer: "",
    cited_passage_ids: [],
  }));
  await askRecoveryQuestion(
    { question: "What do I need for this?", context: { nodeId: "property-tax-relief" } },
    { ...base, workflow, answerModel: model, topK: 1 },
  );
  assert.match(calls[0].prompt, /source_url: https:\/\/dor\.wa\.gov/);
});

test("caller-supplied context fields win over workflow definitions", async () => {
  const { model, calls } = fakeModel(() => ({
    status: "not_found",
    answer: "",
    cited_passage_ids: [],
  }));
  await askRecoveryQuestion(
    {
      question: "driver license replacement",
      context: {
        nodeId: "identity-replacement",
        nodeTitle: "Replace my ID",
        prerequisites: [{ nodeId: "damage-documentation", status: "COMPLETE" }],
      },
    },
    { ...base, workflow, answerModel: model },
  );
  assert.match(calls[0].prompt, /current_step: Replace my ID \(identity-replacement\)/);
  assert.match(
    calls[0].prompt,
    /prerequisite_steps: Damage documentation \(damage-documentation\), status: COMPLETE/,
  );
});

test("works with context but without workflow definitions", async () => {
  const { model, calls } = fakeModel(() => ({
    status: "not_found",
    answer: "",
    cited_passage_ids: [],
  }));
  await askRecoveryQuestion(
    { question: "driver license", context: { nodeId: "custom-node", status: "BLOCKED" } },
    { ...base, answerModel: model },
  );
  assert.match(calls[0].prompt, /current_step: custom-node/);
});

test("rejects invalid questions and invalid context", async () => {
  const { model } = fakeModel(() => ({}));
  const opts = { ...base, answerModel: model };
  await assert.rejects(
    askRecoveryQuestion({ question: "   " }, opts),
    isRagError("INVALID_QUESTION"),
  );
  await assert.rejects(
    askRecoveryQuestion({ question: "x".repeat(1001) }, opts),
    isRagError("INVALID_QUESTION"),
  );
  await assert.rejects(askRecoveryQuestion({ question: 42 }, opts), isRagError("INVALID_QUESTION"));
  for (const context of [
    "insurance-claim",
    { status: "DONE" },
    { nodeId: 5 },
    { prerequisites: [{ title: "missing id" }] },
    { prerequisites: [{ nodeId: "a", edgeType: "MAYBE" }] },
    { requiredEvidence: Array.from({ length: 21 }, () => "x") },
  ]) {
    await assert.rejects(
      askRecoveryQuestion({ question: "driver license", context }, opts),
      isRagError("INVALID_CONTEXT"),
      JSON.stringify(context),
    );
  }
});

test("malformed model output and model failures surface as RagError", async () => {
  const bad = fakeModel(() => ({ status: "maybe", answer: 42 }));
  await assert.rejects(
    askRecoveryQuestion(
      { question: "driver license replacement" },
      { ...base, answerModel: bad.model },
    ),
    isRagError("MODEL_ERROR"),
  );
  const down = {
    name: "down",
    generateJson: async () => {
      throw new RagError("MODEL_RATE_LIMITED", "429");
    },
  };
  await assert.rejects(
    askRecoveryQuestion({ question: "driver license replacement" }, { ...base, answerModel: down }),
    (e) => isRagError("MODEL_RATE_LIMITED")(e) && e.httpStatus === 503,
  );
});

test("finalizeAnswer drops unknown citations and downgrades uncited answers", () => {
  const passages = index.chunks.slice(0, 3).map((c, i) => ({
    passageId: `S${i + 1}`,
    chunk: { ...c, score: 1 },
  }));
  const invented = finalizeAnswer(
    {
      status: "answered",
      answer: "Claim [S1] and invented [S9].",
      cited_passage_ids: ["S1", "S9"],
    },
    passages,
  );
  assert.equal(invented.sources.length, 1);
  assert.equal(invented.answer, "Claim [1] and invented.");

  const uncited = finalizeAnswer(
    { status: "answered", answer: "Trust me.", cited_passage_ids: ["S42"] },
    passages,
  );
  assert.equal(uncited.status, "not_found");
  assert.deepEqual(uncited.sources, []);

  const partial = finalizeAnswer(
    {
      status: "partial",
      answer: "Titles are free [S2]. Plate fees are not stated.",
      cited_passage_ids: ["S2"],
    },
    passages,
  );
  assert.equal(partial.status, "partial");
  assert.equal(partial.sources[0].chunkIds[0], "dol-wildfire-relief:bbb");

  const markersOnly = finalizeAnswer(
    { status: "answered", answer: "A [S1]. B [S3].", cited_passage_ids: ["S1"] },
    passages,
  );
  assert.equal(markersOnly.sources.length, 2);
});
