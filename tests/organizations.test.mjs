import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { emptyIntake } = await importTypeScript("lib/intake-recovery");
const { organizationContext, organizationForTask, assignOrganizations, organizationsForMap } =
  await importTypeScript("lib/household-organizations");
const { resolveOrganizations } = await importTypeScript("lib/resolve-organizations");
const { prepareJourneyArtifact, getJourney } = await importTypeScript("lib/recovery-journey");
const { cleanDraftText } = await importTypeScript("lib/draft-text");
const config = { apiKey: "test-key", model: "test-model" };
function household() {
  const record = emptyIntake("org-test");
  record.confirmed = {
    answers: {
      affectedStreet: "Private household address",
      affectedCity: "Spokane",
      affectedState: "Washington",
      affectedZip: "99201",
      insurerName: "Household's chosen insurer",
      claimReference: "PRIVATE-REFERENCE",
    },
    applications: [{ id: "app1", organization: "Existing aid program" }],
    stage: 3,
  };
  return record;
}

test("insurer and program assignments follow the household across every related node", () => {
  const record = household();
  for (const id of ["claim", "claim-outcome"])
    assert.equal(organizationForTask(record, id).name, "Household's chosen insurer");
  for (const id of ["application", "review", "appeal", "funds"])
    assert.equal(organizationForTask(record, `${id}:app1`).name, "Existing aid program");
  for (const id of ["damage", "occupancy", "evidence"])
    assert.equal(organizationForTask(record, id).source, "internal");
  assert.equal(organizationsForMap(record).application, "Existing aid program");
});

test("live lookup requires web evidence and never includes private addresses or case references", async () => {
  const record = household();
  const sourceUrl = "https://county.example.gov/assessor";
  const organizations = await resolveOrganizations(
    record,
    config,
    undefined,
    async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.tool_choice, "required");
      assert.ok(!body.input.includes("Private household address"));
      assert.ok(!body.input.includes("PRIVATE-REFERENCE"));
      return Response.json({
        status: "completed",
        output: [
          { type: "web_search_call", action: { sources: [{ url: sourceUrl }] } },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  organizations: [
                    {
                      group: "tax",
                      name: "County Assessor",
                      role: "Property-tax relief",
                      url: sourceUrl,
                      sourceUrl,
                      question: "",
                    },
                    {
                      group: "building",
                      name: "Invented Office",
                      role: "Permits",
                      url: "https://invented.example.gov/",
                      sourceUrl: "https://invented.example.gov/",
                      question: "",
                    },
                  ],
                }),
              },
            ],
          },
        ],
      });
    },
  );
  for (const id of ["tax-relief", "tax-determination", "tax-outcome"])
    assert.equal(organizations.assignments[id].name, "County Assessor");
  assert.equal(organizations.assignments.permits.name, "");
  const cached = { ...record, organizations };
  await resolveOrganizations(cached, config, undefined, async () =>
    assert.fail("Cached household should not repeat research"),
  );
});

test("changing locality invalidates organizations; drafts fill the new recipient without changing completed packets", () => {
  const record = household();
  record.journey = getJourney(record);
  record.journey.tasks["tax-relief"].artifact = {
    id: "old",
    version: 1,
    text: "To: County assessor\n\nMy edited request.",
    recipient: "County assessor",
  };
  record.journey.tasks.claim.artifact = {
    id: "submitted",
    version: 1,
    text: "Original submitted document",
    recipient: "Original recipient",
    receipt: "RECEIPT",
  };
  const organizations = {
    contextKey: organizationContext(record),
    checkedAt: new Date().toISOString(),
    assignments: {
      "tax-relief": { name: "Spokane County Assessor", source: "research", role: "Tax relief" },
    },
  };
  const next = assignOrganizations(record, organizations);
  assert.equal(next.journey.tasks["tax-relief"].artifact.recipient, "Spokane County Assessor");
  assert.match(
    next.journey.tasks["tax-relief"].artifact.text,
    /^To: Spokane County Assessor\n\nMy edited request\./,
  );
  assert.equal(next.journey.tasks.claim.artifact.id, "submitted");
  assert.equal(next.journey.tasks.claim.artifact.recipient, "Original recipient");
  const packet = prepareJourneyArtifact(next, "tax-relief");
  assert.equal(packet.recipient, "Spokane County Assessor");
  assert.match(packet.text, /To: Spokane County Assessor/);
  next.confirmed.answers.affectedCity = "Tacoma";
  assert.equal(organizationForTask(next, "tax-relief").name, "");
  assert.equal(assignOrganizations(next, organizations), next);
});

test("retired preamble is removed from old drafts while simulation labels and document content survive", () => {
  assert.equal(
    cleanDraftText("AI draft \u2014 review before use. Not submitted.\n\nDear Agency"),
    "Dear Agency",
  );
  assert.equal(
    cleanDraftText(
      "SIMULATED HOUSEHOLD · AI draft \u2014 review before use. Not submitted.\n\nDear Agency",
    ),
    "SIMULATED HOUSEHOLD\n\nDear Agency",
  );
  assert.equal(cleanDraftText("Dear Agency\nMy request"), "Dear Agency\nMy request");
});
