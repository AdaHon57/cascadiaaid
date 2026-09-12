import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { randomIntake } = await importTypeScript("lib/random-intake");
const { visibleQuestions } = await importTypeScript("data/intake-questions");
const { validateDraft, validateDocument } = await importTypeScript("lib/intake-validation");
test("random households fill every applicable question, applications and sample documents", () => {
  for (let seed = 1; seed <= 100; seed++) {
    let state = seed;
    const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
    const { draft, documents } = randomIntake(new Date("2026-09-12T12:00:00Z"), random);
    validateDraft(draft);
    assert.equal(draft.stage, 3);
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
