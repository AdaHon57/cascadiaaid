import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { assistJourneyArtifact } = await importTypeScript("lib/journey-assistant");
const { journeySteps } = await importTypeScript("data/journey-steps");
const { journeyWorkflows } = await importTypeScript("data/journey-workflows");
const artifact = {
  id: "draft-1",
  version: 1,
  recipient: "Chosen recipient",
  text: "Confirmed household facts. Missing date: [date].",
  documentIds: ["reviewed-1"],
  preparedAt: "2026-09-12T12:00:00Z",
  simulated: false,
};
const config = { apiKey: "test-key", model: "configured-model" };
const response = (text, status = "completed") =>
  Response.json({
    status,
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  });

test("all goals have three concrete actions, including program-specific stages", () => {
  assert.deepEqual(
    Object.keys(journeySteps).sort(),
    journeyWorkflows.map((task) => task.id).sort(),
  );
  for (const steps of Object.values(journeySteps)) {
    assert.equal(steps.length, 3);
    assert.equal(new Set(steps).size, 3);
  }
});

test("missing AI configuration still prepares the draft without a provider request", async () => {
  const result = await assistJourneyArtifact(artifact, {}, undefined, async () =>
    assert.fail("Unexpected network request"),
  );
  assert.equal(result.preparation, "autofill");
  assert.equal(result.text, artifact.text);
  assert.equal(artifact.preparation, undefined);
});

test("AI rewrites only text and cannot approve, deliver, or replace attachments", async () => {
  let payload;
  const result = await assistJourneyArtifact(artifact, config, undefined, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init.headers.Authorization, "Bearer test-key");
    payload = JSON.parse(init.body);
    return response("Please help arrange accommodation. Move-in date: [date].");
  });
  assert.equal(payload.store, false);
  assert.equal(payload.model, "configured-model");
  assert.deepEqual(payload.input, [{ role: "user", content: artifact.text }]);
  assert.equal(result.preparation, "ai");
  assert.equal(result.text, "Please help arrange accommodation. Move-in date: [date].");
  assert.deepEqual(result.documentIds, artifact.documentIds);
  assert.equal(result.recipient, artifact.recipient);
  assert.equal(result.id, artifact.id);
  assert.equal(result.approvedAt, undefined);
  assert.equal(result.receipt, undefined);
});

test("unavailable, refused, malformed and truncated AI responses keep the usable original draft", async () => {
  const replies = [
    () => new Response("provider secret", { status: 500 }),
    () => response("unfinished draft", "incomplete"),
    () => response(""),
    () => response("x".repeat(8001)),
    () =>
      Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      }),
    () => Response.json({ status: "completed", output: [null] }),
    () => {
      throw new Error("private provider error");
    },
  ];
  for (const reply of replies) {
    const result = await assistJourneyArtifact(artifact, config, undefined, async () => reply());
    assert.equal(result.preparation, "autofill");
    assert.equal(result.text, artifact.text);
  }
});

test("AI draft retains a visible simulation label", async () => {
  const result = await assistJourneyArtifact(
    { ...artifact, simulated: true },
    config,
    undefined,
    async () => response("Prepared fictional request."),
  );
  assert.match(result.text, /^SIMULATED HOUSEHOLD/);
  assert.equal(result.simulated, true);
});
