import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { browserStep, observe } from "../automation/browser.mjs";

test("browser runner fills, uploads, submits once, and captures the actual form confirmation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route("https://forms.example.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `
      <form id="request"><label>Name<input name="name" required></label>
      <label>Document<input name="document" type="file"></label>
      <button type="submit">Submit request</button></form>
      <script>document.querySelector('form').onsubmit = event => { event.preventDefault(); document.body.textContent = 'Your request was received. Reference CASE-42.'; };</script>`,
      }),
    );
    const page = await context.newPage();
    await page.goto("https://forms.example.test/request");
    let savedBeforeClick = false;
    const job = {
      browser,
      page,
      allowedOrigins: ["https://forms.example.test"],
      actions: [],
      public: { status: "working" },
      payload: {
        task: {},
        plan: {},
        facts: { name: "Example Person" },
        documents: [{ id: "doc", type: "id", data: Buffer.from("fixture").toString("base64") }],
      },
      save: async () => {
        savedBeforeClick = true;
        assert.equal(await page.locator("form").count(), 1);
      },
    };
    const action = (fields) => async () => ({
      message: "Working on the test form",
      intent: "other",
      ...fields,
    });
    let observation = await observe(job);
    const input = observation.elements.find((element) => element.label === "Name").id;
    await browserStep(
      job,
      {},
      action({ action: "fill", element: input, factKey: "name", value: "Example Person" }),
    );
    assert.equal(await page.locator("input[name=name]").inputValue(), "Example Person");
    observation = await observe(job);
    assert.equal(
      observation.elements.find((element) => element.label === "Name").value,
      "Example Person",
    );
    const upload = observation.elements.find((element) => element.type === "file").id;
    await browserStep(job, {}, action({ action: "upload", element: upload, value: "doc" }));
    assert.equal(
      await page.locator("input[type=file]").evaluate((element) => element.files.length),
      1,
    );
    const submit = observation.elements.find((element) => element.tag === "button").id;
    await browserStep(job, {}, action({ action: "click", element: submit, intent: "submit" }));
    assert.equal(savedBeforeClick, true);
    await browserStep(
      job,
      {},
      action({
        action: "complete",
        outcome: "submitted",
        reference: "CASE-42",
        evidence: "Your request was received. Reference CASE-42.",
      }),
    );
    assert.equal(job.public.status, "submitted");
    assert.equal(job.public.receipt.reference, "CASE-42");
    assert.equal(job.public.receipt.url, "https://forms.example.test/request");
  } finally {
    await browser.close();
  }
});

test("personal certifications are handed to the person instead of clicked", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://forms.example.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<label>I certify under penalty of perjury<input type="checkbox"></label><button>Submit</button>',
      }),
    );
    await page.goto("https://forms.example.test/request");
    const job = {
      browser,
      page,
      allowedOrigins: ["https://forms.example.test"],
      actions: [],
      public: { status: "working" },
      payload: { task: {}, plan: {}, facts: { consent: "yes" }, documents: [] },
    };
    const observation = await observe(job);
    await browserStep(job, {}, async () => ({
      message: "Confirm",
      action: "check",
      element: observation.elements.find((element) => element.type === "checkbox").id,
      factKey: "consent",
      value: "yes",
    }));
    assert.equal(job.public.status, "needs_user");
    assert.equal(await page.locator("input").isChecked(), false);
  } finally {
    await browser.close();
  }
});
