// Ingestion tests: HTML extraction, fetching rules, chunking, and index building. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { buildIndex } from "../lib/rag/ingest/build-index.ts";
import { chunkPage, splitLongText } from "../lib/rag/ingest/chunk.ts";
import { extractPage, fetchSourceHtml, scrapeSource } from "../lib/rag/ingest/scrape.ts";
import { makeIndex } from "./rag-fixtures.mjs";

const cfEmail = (email, key = 0x2a) =>
  key.toString(16).padStart(2, "0") +
  [...email].map((ch) => (ch.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");

const HTML = `<!doctype html><html><head><title>Wildfire Relief | Washington State Department of Licensing</title>
<script>var tracking = "should not appear";</script><style>.x{color:red}</style></head>
<body>
  <header><nav><a href="/">Home</a><a href="/other">Other page link</a></nav></header>
  <div class="cookie-banner">We use cookies. Accept?</div>
  <main>
    <ol class="breadcrumb"><li>Home</li><li>Wildfire Relief</li></ol>
    <aside><h2>On this page</h2><a href="#x">Driver licenses</a></aside>
    <h1>Wildfire Relief</h1>
    <h1>Wildfire Relief</h1>
    <p>Support is available for DOL customers impacted by wildfires.</p>
    <h2>Driver licenses and ID cards</h2>
    <p>Customers can get a <strong>no-charge</strong> replacement driver license.</p>
    <ul><li>Must be done in person.</li><li>No proof is required.</li></ul>
    <div class="accordion-panel" style="display: none;"><p>Collapsed accordion text is still content.</p></div>
    <span class="sr-only">Opens in new window</span>
    <form><label>Email</label><input name="email"></form>
    <p>Contact <a class="__cf_email__" data-cfemail="${cfEmail("cork@dol.wa.gov")}">[email&#160;protected]</a></p>
    <table><tr><th>Fee</th><td>$0</td></tr></table>
    <h2>Related news</h2>
    <h3>Some news item</h3>
    <p>News teaser that should be dropped.</p>
  </main>
  <footer>Footer text</footer>
</body></html>`;

const source = { id: "dol-wildfire-relief", url: "https://dol.wa.gov/wildfire-relief" };
const htmlResponse = (body) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

test("extraction keeps headings and content, records metadata, and removes boilerplate", () => {
  const page = extractPage(HTML, source, "2026-09-01T00:00:00.000Z");
  const allText = page.sections.flatMap((s) => [...s.headingPath, ...s.blocks]).join("\n");

  assert.equal(page.title, "Wildfire Relief");
  assert.equal(page.sourceUrl, source.url);
  assert.equal(page.fetchedAt, "2026-09-01T00:00:00.000Z");

  const section = page.sections.find(
    (s) => s.headingPath.at(-1) === "Driver licenses and ID cards",
  );
  assert.deepEqual(section.headingPath, ["Wildfire Relief", "Driver licenses and ID cards"]);
  assert.ok(section.blocks.includes("Customers can get a no-charge replacement driver license."));
  assert.ok(section.blocks.includes("- Must be done in person."));

  for (const junk of [
    "should not appear",
    "color:red",
    "Other page link",
    "We use cookies",
    "Footer text",
    "Opens in new window",
    "On this page",
    "Email",
    "News teaser",
    "Some news item",
  ]) {
    assert.ok(!allText.includes(junk), `unexpected text: ${junk}`);
  }
  assert.ok(allText.includes("Collapsed accordion text is still content."));
  assert.ok(allText.includes("Contact cork@dol.wa.gov"));
  assert.ok(allText.includes("Fee | $0"));
  assert.equal(page.sections.filter((s) => s.level === 1).length, 1);
});

test("fetch failures are reported with the reason instead of skipped", async () => {
  const notFound = await scrapeSource(source, {
    retries: 0,
    fetchImpl: async () => new Response("nope", { status: 404, statusText: "Not Found" }),
  });
  assert.equal(notFound.ok, false);
  assert.match(notFound.error, /HTTP 404/);
  assert.equal(notFound.url, source.url);

  const empty = await scrapeSource(source, {
    retries: 0,
    fetchImpl: async () => htmlResponse("<main><p>Hi</p></main>"),
  });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /Extracted only/);

  const offHost = async () => {
    const res = htmlResponse("<main>x</main>");
    Object.defineProperty(res, "url", { value: "https://evil.example.com/page" });
    return res;
  };
  await assert.rejects(
    fetchSourceHtml(source.url, { retries: 0, fetchImpl: offHost }),
    /Redirected off the approved host/,
  );
  const pdf = async () =>
    new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } });
  await assert.rejects(
    fetchSourceHtml(source.url, { retries: 0, fetchImpl: pdf }),
    /Expected an HTML page/,
  );
});

const sentence = (i) =>
  `Sentence number ${i} explains a recovery step in some detail for residents.`;
const page = {
  sourceId: "oic-steps-after-home-damage",
  sourceUrl: "https://www.insurance.wa.gov/example",
  title: "Steps to take after home damage or a loss",
  fetchedAt: "2026-09-01T00:00:00.000Z",
  sections: [
    { headingPath: ["Steps"], level: 1, blocks: ["Short intro."] },
    {
      headingPath: ["Steps", "Return home"],
      level: 2,
      blocks: ["Return when officials say it is safe."],
    },
    {
      headingPath: ["Steps", "Filing a claim"],
      level: 2,
      blocks: Array.from({ length: 40 }, (_, i) => `- ${sentence(i)}`),
    },
    {
      headingPath: ["Other"],
      level: 1,
      blocks: ["A separate top-level section with its own text."],
    },
  ],
};
const chunkOptions = { maxChars: 600, overlapChars: 120, minChars: 200 };

test("chunking merges short sections, splits long ones with overlap, and keeps metadata", () => {
  const chunks = chunkPage(page, chunkOptions);
  for (const c of chunks) {
    assert.ok(c.id.startsWith("oic-steps-after-home-damage:"));
    assert.equal(c.sourceUrl, page.sourceUrl);
    assert.equal(c.sourceTitle, page.title);
    assert.equal(c.fetchedAt, page.fetchedAt);
    assert.ok(c.heading && c.content);
    assert.ok(c.content.length <= chunkOptions.maxChars);
  }
  assert.equal(chunks[0].heading, "Steps");
  assert.ok(chunks[0].content.includes("## Return home"));

  const claim = chunks.filter((c) => c.heading === "Steps > Filing a claim");
  assert.ok(claim.length >= 3);
  for (let i = 1; i < claim.length; i++) {
    assert.ok(claim[i].content.startsWith(claim[i - 1].content.split("\n").at(-1)));
  }
  assert.ok(!chunks.find((c) => c.heading === "Other").content.includes("Sentence number"));
  assert.throws(() => chunkPage(page, { maxChars: 500, overlapChars: 300 }));
});

test("chunk IDs are stable for unchanged content", () => {
  const first = chunkPage(page, chunkOptions);
  assert.deepEqual(
    chunkPage(page, chunkOptions).map((c) => c.id),
    first.map((c) => c.id),
  );
  const edited = chunkPage(
    {
      ...page,
      sections: [
        ...page.sections.slice(0, 3),
        { headingPath: ["Other"], level: 1, blocks: ["Changed."] },
      ],
    },
    chunkOptions,
  );
  assert.deepEqual(
    edited.slice(0, -1).map((c) => c.id),
    first.slice(0, -1).map((c) => c.id),
  );
});

test("splitLongText prefers sentence boundaries and never exceeds the limit", () => {
  const text = Array.from({ length: 10 }, (_, i) => sentence(i)).join(" ");
  const pieces = splitLongText(text, 200);
  for (const p of pieces) {
    assert.ok(p.length <= 200);
    assert.match(p, /\.$/);
  }
  assert.equal(pieces.join(" "), text);
});

const GOOD = { id: "dol-wildfire-relief", url: "https://dol.wa.gov/wildfire-relief" };
const BAD = {
  id: "dor-destroyed-property",
  url: "https://dor.wa.gov/taxes-rates/property-tax/destroyed-property",
};
const fetchGoodOrForbidden = async (input) =>
  String(input) === GOOD.url
    ? htmlResponse(
        `<main><h1>Wildfire Relief</h1><h2>Driver licenses</h2><p>${"No-charge replacement driver license after wildfire. ".repeat(6)}</p></main>`,
      )
    : new Response("Forbidden", { status: 403, statusText: "Forbidden" });

test("buildIndex reports failed sources and keeps previous chunks as stale", async () => {
  const fresh = await buildIndex({
    sources: [GOOD, BAD],
    embeddingProvider: null,
    fetchOptions: { retries: 0, fetchImpl: fetchGoodOrForbidden },
  });
  assert.equal(fresh.failures.length, 1);
  assert.match(fresh.failures[0].error, /HTTP 403/);
  assert.equal(fresh.index.sources.find((s) => s.url === GOOD.url).status, "ok");
  assert.equal(fresh.index.sources.find((s) => s.url === BAD.url).status, "failed");
  assert.equal(fresh.index.embedding, null);

  const withPrevious = await buildIndex({
    sources: [GOOD, BAD],
    embeddingProvider: null,
    previousIndex: makeIndex(),
    fetchOptions: { retries: 0, fetchImpl: fetchGoodOrForbidden },
  });
  assert.equal(withPrevious.failures[0].keptPreviousChunks, true);
  assert.equal(withPrevious.index.sources.find((s) => s.url === BAD.url).status, "stale");
  assert.ok(withPrevious.index.chunks.some((c) => c.id === "dor-destroyed-property:ccc"));

  await assert.rejects(
    buildIndex({ sources: [GOOD, { ...GOOD, id: "other" }], embeddingProvider: null }),
    /Duplicate source url/,
  );
});

test("buildIndex embeds chunks with the provider's model and dimensions", async () => {
  const provider = {
    name: "fake",
    model: "fake-1",
    dimensions: 3,
    embed: async (texts) => texts.map(() => [0.123456789, 0.5, 1]),
  };
  const { index } = await buildIndex({
    sources: [GOOD],
    embeddingProvider: provider,
    fetchOptions: { retries: 0, fetchImpl: fetchGoodOrForbidden },
  });
  assert.deepEqual(index.embedding, { provider: "fake", model: "fake-1", dimensions: 3 });
  assert.deepEqual(index.chunks[0].embedding, [0.12346, 0.5, 1]);
});
