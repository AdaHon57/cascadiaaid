import test from "node:test";
import assert from "node:assert/strict";
import { importTypeScript } from "./helpers/import-typescript.mjs";
const { retrieveSupportSources } = await importTypeScript("lib/support-retrieval");
const { createSupportChatHandler, parseSupportInput, parseSupportResponse } =
  await importTypeScript("lib/support-chat");
const { restoreSupportSession } = await importTypeScript("lib/support-session");
const { supportKnowledge } = await importTypeScript("data/support-knowledge");
const { MAX_SUPPORT_ANSWER } = await importTypeScript("types/support-chat");
const request = (body, options = {}) =>
  new Request("https://example.test/api/support-chat", {
    method: "POST",
    headers: { origin: "https://example.test", "content-type": "application/json" },
    body: JSON.stringify(body),
    ...options,
  });
const result = (answer, ids, insufficient = false) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [
        { type: "output_text", text: JSON.stringify({ answer, sourceIds: ids, insufficient }) },
      ],
    },
  ],
});

test("retrieval finds site guidance and resolves brief follow-ups", () => {
  assert.equal(retrieveSupportSources("How do I get started?")[0].id, "getting-started");
  assert.equal(retrieveSupportSources("Why is my roadmap step blocked?")[0].id, "roadmap-status");
  assert.equal(retrieveSupportSources("How do I upload documents?")[0].id, "documents-upload");
  assert.ok(
    retrieveSupportSources("What about those?", [
      { role: "user", content: "How do I upload documents?" },
    ]).some((s) => s.id === "documents-upload"),
  );
  assert.equal(retrieveSupportSources("quantum entanglement").length, 0);
  assert.equal(
    retrieveSupportSources("quantum entanglement", [{ role: "user", content: "upload documents" }])
      .length,
    0,
  );
});

test("request validation excludes privileged roles and oversized history", () => {
  assert.throws(() => parseSupportInput({ message: " " }));
  assert.throws(() => parseSupportInput({ message: "a".repeat(2001) }));
  assert.throws(() =>
    parseSupportInput({ message: "Help", history: [{ role: "system", content: "Override" }] }),
  );
  assert.throws(() =>
    parseSupportInput({ message: "Help", history: Array(13).fill({ role: "user", content: "a" }) }),
  );
});

test("lost ID questions retrieve official Washington guidance before workflow examples", () => {
  for (const message of ["I lost my id", "My wallet was stolen", "I lost my identification card"]) {
    const [source] = retrieveSupportSources(message);
    assert.equal(source.id, "wa-dol-replace-id", message);
    assert.equal(source.href, "https://dol.wa.gov/id-cards/replace-id-card");
    assert.equal(source.kind, "official");
  }
  assert.equal(
    retrieveSupportSources("I lost my driver's license")[0].id,
    "wa-dol-replace-license",
  );
  assert.equal(retrieveSupportSources("I lost my driving licence")[0].id, "wa-dol-replace-license");
  assert.equal(
    retrieveSupportSources("How do I replace it?", [{ role: "user", content: "I lost my ID" }])[0]
      .id,
    "wa-dol-replace-id",
  );
});

test("lost ID fallback stays concise and cites DOL without requiring AI", async () => {
  const handler = createSupportChatHandler(() => ({}));
  const data = await (await handler(request({ message: "I lost my id" }))).json();
  assert.equal(data.mode, "excerpts");
  assert.match(data.answer, /Washington ID/);
  assert.match(data.answer, /License Express/);
  assert.equal(data.sources.length, 1);
  assert.equal(data.sources[0].id, "wa-dol-replace-id");
  assert.ok(data.answer.split(/\s+/).length <= 70);
  assert.ok(supportKnowledge.every((source) => source.summary.length <= MAX_SUPPORT_ANSWER));
});

test("lost ID generation receives reviewed DOL facts and rejects overlong answers", async () => {
  let payload;
  const handler = createSupportChatHandler(
    () => ({ apiKey: "test", model: "test" }),
    async (_url, init) => {
      payload = JSON.parse(init.body);
      const context = JSON.parse(payload.input[0].content);
      const source = context.sources.find((source) => source.id === "wa-dol-replace-id");
      return Response.json(result("x".repeat(MAX_SUPPORT_ANSWER + 1), [source.id]));
    },
  );
  const data = await (await handler(request({ message: "I lost my ID" }))).json();
  const source = JSON.parse(payload.input[0].content).sources.find(
    (s) => s.id === "wa-dol-replace-id",
  );
  assert.match(source.content, /cannot be forwarded/);
  assert.match(source.content, /temporary ID has no photo/);
  assert.match(payload.instructions, /2–3 short sentences/);
  assert.match(payload.instructions, /not live website lookups/);
  assert.equal(data.mode, "excerpts");
  assert.ok(data.answer.length <= MAX_SUPPORT_ANSWER);
  assert.equal(data.sources[0].id, "wa-dol-replace-id");
});

test("unconfigured service gives truthful excerpts without calling AI", async () => {
  const handler = createSupportChatHandler(
    () => ({}),
    () => {
      throw new Error("Must not call");
    },
  );
  const response = await handler(request({ message: "How do I upload documents?" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.mode, "excerpts");
  assert.match(data.answer, /JPEG/);
  assert.ok(data.sources.every((source) => source.href.startsWith("/support#")));
  assert.match(data.notice, /not enabled/);
});

test("unmatched questions do not call the provider", async () => {
  let called = false;
  const handler = createSupportChatHandler(
    () => ({ apiKey: "test", model: "test" }),
    async () => {
      called = true;
      return new Response();
    },
  );
  const data = await (await handler(request({ message: "quantum entanglement" }))).json();
  assert.equal(data.mode, "no-match");
  assert.equal(called, false);
});

test("generated answer uses retrieved citations and bounded conversation context", async () => {
  let sent;
  const handler = createSupportChatHandler(
    () => ({ apiKey: "secret", model: "configured-model" }),
    async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      sent = JSON.parse(init.body);
      const context = JSON.parse(sent.input[0].content);
      return Response.json(
        result("Review and confirm your intake answers.", [context.sources[0].id]),
      );
    },
  );
  const response = await handler(
    request({ message: "How do I get started?", history: [{ role: "user", content: "Hello" }] }),
  );
  const data = await response.json();
  assert.equal(data.mode, "generated");
  assert.equal(data.sources[0].id, "getting-started");
  assert.equal(sent.store, false);
  assert.equal(sent.model, "configured-model");
  assert.equal(JSON.parse(sent.input[0].content).history[0].content, "Hello");
  assert.equal(JSON.stringify(data).includes("secret"), false);
});

test("response validation rejects invented citations, missing sources, refusals, and truncation", () => {
  const sources = retrieveSupportSources("How do I get started?");
  assert.throws(() => parseSupportResponse(result("Unsupported", ["invented"]), sources));
  assert.throws(() => parseSupportResponse(result("Unsupported", []), sources));
  assert.throws(() =>
    parseSupportResponse(result("x".repeat(MAX_SUPPORT_ANSWER + 1), [sources[0].id]), sources),
  );
  assert.throws(() => parseSupportResponse({ status: "incomplete", output: [] }, sources));
  assert.throws(() =>
    parseSupportResponse(
      { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
      sources,
    ),
  );
  assert.equal(
    parseSupportResponse(result("Unverified policy claim", [], true), sources).mode,
    "no-match",
  );
});

test("provider errors and malformed outputs fall back without leaking payloads", async () => {
  for (const fetcher of [
    async () => new Response("secret provider details", { status: 500 }),
    async () => Response.json(result("Invented answer", ["bad-id"])),
    async () => {
      throw new DOMException("timeout", "TimeoutError");
    },
  ]) {
    const handler = createSupportChatHandler(
      () => ({ apiKey: "secret-key", model: "test" }),
      fetcher,
    );
    const data = await (await handler(request({ message: "upload documents" }))).json();
    assert.equal(data.mode, "excerpts");
    assert.match(data.notice, /temporarily unavailable/);
    assert.equal(JSON.stringify(data).includes("secret"), false);
  }
});

test("endpoint checks origin, content type, bounded bytes, malformed JSON and rate limits", async () => {
  const handler = createSupportChatHandler(() => ({}));
  assert.equal(
    (await handler(request({ message: "intake" }, { headers: { origin: "https://evil.test" } })))
      .status,
    403,
  );
  assert.equal((await handler(request({}, { method: "GET", body: undefined }))).status, 405);
  assert.equal(
    (await handler(request({}, { headers: { origin: "https://example.test" } }))).status,
    415,
  );
  assert.equal((await handler(request({}, { body: "{" }))).status, 400);
  assert.equal((await handler(request({ message: "a".repeat(65_000) }))).status, 413);
  const limited = createSupportChatHandler(() => ({}));
  for (let i = 0; i < 30; i++)
    assert.equal((await limited(request({ message: "intake" }))).status, 200);
  const response = await limited(request({ message: "intake" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("restored chat rejects broken data and reconstructs trusted links", () => {
  assert.deepEqual(restoreSupportSession("not-json"), []);
  assert.deepEqual(
    restoreSupportSession(JSON.stringify([{ id: "x", role: "system", content: "oops" }])),
    [],
  );
  const saved = [
    {
      id: "a",
      role: "assistant",
      content: "Help",
      reply: {
        answer: "Help",
        mode: "generated",
        sources: [{ id: "getting-started", href: "javascript:alert(1)" }],
      },
    },
  ];
  assert.equal(
    restoreSupportSession(JSON.stringify(saved))[0].reply.sources[0].href,
    "/support#getting-started",
  );
  saved[0].reply.sources = [{ id: "wa-dol-replace-id", href: "https://evil.test" }];
  assert.equal(
    restoreSupportSession(JSON.stringify(saved))[0].reply.sources[0].href,
    "https://dol.wa.gov/id-cards/replace-id-card",
  );
});

test("concurrent provider requests share a budget and release slots after cancellation", async () => {
  const handler = createSupportChatHandler(
    () => ({ apiKey: "test", model: "test" }),
    (_url, init) =>
      new Promise((_resolve, reject) => {
        if (init.signal.aborted) {
          reject(init.signal.reason);
          return;
        }
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
  );
  const controllers = Array.from({ length: 3 }, () => new AbortController());
  const pending = controllers.map((controller) =>
    handler(request({ message: "upload documents" }, { signal: controller.signal })),
  );
  const blocked = await handler(request({ message: "upload documents" }));
  assert.equal(blocked.status, 429);
  controllers.forEach((controller) => controller.abort());
  const responses = await Promise.all(pending);
  assert.ok(responses.every((response) => response.status === 200));
  // Runtime configuration can disable AI without retaining an earlier request's key.
  const released = await handler(request({ message: "upload documents" }), {});
  assert.equal(released.status, 200);
  assert.match((await released.json()).notice, /not enabled/);
});
