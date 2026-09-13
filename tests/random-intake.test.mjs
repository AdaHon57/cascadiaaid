import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { randomIntake } = await importTypeScript("lib/random-intake");
const { visibleQuestions } = await importTypeScript("data/intake-questions");
const { validateDraft, validateDocument } = await importTypeScript("lib/intake-validation");
test("random households fill every applicable question, applications and sample documents", () => {
  {
    const { draft, documents } = randomIntake();
    validateDraft(draft);
    assert.equal(draft.stage, 3);
    assert.equal(draft.answers.condition, "destroyed");
    for (const q of visibleQuestions(draft.answers)) {
      assert.ok(draft.answers[q.id]?.length, q.id);
    }
    assert.equal(draft.applications.length, 3);
    assert.equal(new Set(draft.applications.map((a) => a.id)).size, 3);
    assert.equal(documents.length, 3);
    for (const document of documents) {
      validateDocument(document);
      assert.equal(document.testData, true);
      assert.match(document.fields.name, /TEST DATA/);
      assert.ok(document.fields.address.startsWith(draft.answers.affectedStreet));
    }
  }
});

test("randomization always restores identical data with independent objects", () => {
  const first = randomIntake();
  const second = randomIntake();
  assert.deepEqual(first, second);
  assert.equal(first.draft.answers.relationship, "owner");
  first.draft.answers.householdSize = "99";
  first.documents[0].fields.name = "Edited";
  assert.deepEqual(randomIntake(), second);
});
