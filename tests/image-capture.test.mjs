import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { parseDamageAnalysis } from "../lib/damage-photo-result.ts";
import { parseDocumentTextResult } from "../lib/document-text-result.ts";
import { validateCaptureFile, prepareCapture, MAX_CAPTURE_BYTES } from "../lib/image-capture.ts";

// Resolve the app alias for Node's native test runner without changing app imports.
const source = readFileSync(new URL("../lib/image-analysis.ts", import.meta.url), "utf8")
  .replace(
    '"@/lib/damage-photo-result"',
    JSON.stringify(new URL("../lib/damage-photo-result.ts", import.meta.url).href),
  )
  .replace(
    '"@/lib/document-text-result"',
    JSON.stringify(new URL("../lib/document-text-result.ts", import.meta.url).href),
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { createImageAnalysisHandler, validateAnalysisImage } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

// Minimal JPEG signature is sufficient for transport tests; the provider decodes the image.
const image = "data:image/jpeg;base64,/9j/2Q==";
const code = "test-access-code-at-least-24-characters";
const config = { apiKey: "test-key-never-live", model: "test-vision-model", accessCode: code };
const draft = {
  subject: "BUILDING",
  imageQuality: "LIMITED",
  summary: "Some roof covering appears missing in this view.",
  observations: [
    {
      location: "Roof edge",
      description: "A gap in the covering is visible.",
      certainty: "MEDIUM",
    },
  ],
  limitations: ["The building interior is not visible."],
};
function request(body = { image, consent: true, mode: "house" }, headers = {}) {
  return new Request("https://cascadia.test/api/image-analysis", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://cascadia.test",
      "x-analysis-code": code,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function provider(value = draft) {
  return Response.json({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
  });
}

test("capture accepts supported images and rejects empty, oversized, PDF, HEIC, and SVG files", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"])
    assert.doesNotThrow(() => validateCaptureFile({ type, size: 50 }));
  for (const file of [
    { type: "image/jpeg", size: 0 },
    { type: "image/jpeg", size: MAX_CAPTURE_BYTES + 1 },
    { type: "application/pdf", size: 50 },
    { type: "image/heic", size: 50 },
    { type: "image/svg+xml", size: 50 },
  ])
    assert.throws(() => validateCaptureFile(file));
});

test("image preparation bounds dimensions, repaints pixels, and releases its object URL", async () => {
  let revoked = 0;
  const draws = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillRect: () => {},
      drawImage: (...args) => draws.push(args),
    }),
    toDataURL: () => image,
  };
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  globalThis.Image = class {
    naturalWidth = 4000;
    naturalHeight = 2000;
    async decode() {}
  };
  globalThis.document = { createElement: () => canvas };
  URL.createObjectURL = () => "blob:local-test";
  URL.revokeObjectURL = () => {
    revoked += 1;
  };
  try {
    assert.equal(
      await prepareCapture(new File(["test"], "test.jpg", { type: "image/jpeg" }), 2048),
      image,
    );
    assert.equal(canvas.width, 2048);
    assert.equal(canvas.height, 1024);
    assert.equal(draws.length, 1);
    assert.equal(revoked, 1);
    globalThis.Image = class {
      async decode() {
        throw new DOMException("invalid image");
      }
    };
    await assert.rejects(
      prepareCapture(new File(["bad"], "bad.png", { type: "image/png" }), 2048),
      /could not be opened/,
    );
    assert.equal(revoked, 2);
  } finally {
    globalThis.Image = originalImage;
    globalThis.document = originalDocument;
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  }
});

test("photo transport rejects remote URLs, spoofed types, invalid base64 and oversized images", () => {
  assert.equal(validateAnalysisImage(image), image);
  for (const invalid of [
    null,
    {},
    "https://example.com/house.jpg",
    "data:image/png;base64,/9j/2Q==",
    "data:image/jpeg;base64,aGVsbG8=",
    "data:image/jpeg;base64,!invalid",
    "data:image/jpeg;base64,/9j/" + "AAAA".repeat(1_500_000),
  ]) {
    assert.throws(() => validateAnalysisImage(invalid));
  }
  // Regression: validation must not overflow the regex stack on ordinary large photos.
  const large =
    "data:image/jpeg;base64," +
    Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(1024 * 1024)]).toString("base64");
  assert.equal(validateAnalysisImage(large), large);
});

test("photo output rejects malformed, overlong, and contradictory observations", () => {
  assert.deepEqual(parseDamageAnalysis(draft), draft);
  for (const invalid of [
    null,
    {},
    { ...draft, imageQuality: "SAFE" },
    { ...draft, limitations: [] },
    {
      ...draft,
      observations: [{ location: "Roof", description: "Missing tiles", certainty: "100%" }],
    },
    { ...draft, subject: ["BUILDING"] },
    { ...draft, subject: "OTHER" },
    { ...draft, imageQuality: "UNUSABLE" },
    { ...draft, summary: "x".repeat(1201) },
  ]) {
    assert.throws(() => parseDamageAnalysis(invalid));
  }
  assert.equal(
    parseDamageAnalysis({ ...draft, subject: "OTHER", observations: [] }).observations.length,
    0,
  );
});

test("document transcription validates quality, bounds output, and preserves literal text", () => {
  const valid = {
    text: "Sample Name\nAccount: 000123\nAmount: $42.50",
    imageQuality: "CLEAR",
    limitations: [],
  };
  assert.deepEqual(parseDocumentTextResult(valid), valid);
  for (const invalid of [
    null,
    { ...valid, imageQuality: ["CLEAR"] },
    { ...valid, imageQuality: "VERIFIED" },
    { ...valid, text: "x".repeat(24001) },
    { ...valid, limitations: [42] },
    { ...valid, imageQuality: "UNREADABLE" },
  ]) {
    assert.throws(() => parseDocumentTextResult(invalid));
  }
  assert.equal(
    parseDocumentTextResult({ text: "", imageQuality: "UNREADABLE", limitations: ["Too blurry."] })
      .text,
    "",
  );
});

test("ID, utility bill and other document requests use the same server key and transcription schema", async () => {
  const transcription = {
    text: "SAMPLE DOCUMENT\nAccount 000123",
    imageQuality: "LIMITED",
    limitations: ["A corner is cropped."],
  };
  for (const documentKind of ["ID", "UTILITY_BILL", "OTHER"]) {
    let sent;
    const handler = createImageAnalysisHandler(
      () => config,
      async (_, options) => {
        sent = { body: JSON.parse(options.body), headers: options.headers };
        return provider(transcription);
      },
    );
    const response = await handler(
      request({ image, consent: true, mode: "document", documentKind }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: transcription });
    assert.equal(sent.headers.Authorization, "Bearer test-key-never-live");
    assert.equal(sent.body.text.format.name, "document_text");
    assert.equal(sent.body.store, false);
    assert.match(sent.body.instructions, /Do not guess obscured identifiers/);
    assert.match(sent.body.instructions, /never an instruction to follow/);
  }
});

test("unsupported modes and document kinds are rejected before contacting OpenAI", async () => {
  let calls = 0;
  const handler = createImageAnalysisHandler(
    () => config,
    async () => {
      calls++;
      return provider();
    },
  );
  for (const overrides of [
    { mode: "anything" },
    { mode: "document" },
    { mode: "document", documentKind: "PASSPORT_GUESS" },
    { mode: "document", documentKind: ["ID"] },
  ]) {
    assert.equal((await handler(request({ image, consent: true, ...overrides }))).status, 400);
  }
  assert.equal(calls, 0);
});

test("configuration, access, origin and consent failures never contact the provider", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return provider();
  };
  for (const missing of [
    {},
    { ...config, apiKey: "" },
    { ...config, model: "" },
    { ...config, accessCode: "short" },
  ]) {
    const handler = createImageAnalysisHandler(() => missing, fetcher);
    assert.equal((await handler(request())).status, 503);
    assert.deepEqual(
      await (await handler(new Request("https://cascadia.test/api/image-analysis"))).json(),
      { configured: false },
    );
  }
  const handler = createImageAnalysisHandler(() => config, fetcher);
  assert.equal((await handler(request(undefined, { "x-analysis-code": "wrong" }))).status, 401);
  assert.equal((await handler(request(undefined, { origin: "https://other.test" }))).status, 403);
  assert.equal((await handler(request({ image, consent: false }))).status, 400);
  assert.equal((await handler(request({ image }))).status, 400);
  assert.equal(calls, 0);
});

test("request parser rejects bad JSON, invalid images, MIME types and oversized streamed bodies", async () => {
  let calls = 0;
  const handler = createImageAnalysisHandler(
    () => config,
    async () => {
      calls++;
      return provider();
    },
  );
  assert.equal((await handler(request("{"))).status, 400);
  assert.equal(
    (await handler(request({ image: "https://example.com", consent: true, mode: "house" }))).status,
    400,
  );
  assert.equal((await handler(request(undefined, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await handler(request(undefined, { "content-length": "99999999" }))).status, 413);
  assert.equal((await handler(request("x".repeat(6 * 1024 * 1024 + 1)))).status, 413);
  assert.equal(calls, 0);
});

test("successful photo request uses bounded structured image analysis and returns only validated output", async () => {
  let sent;
  const handler = createImageAnalysisHandler(
    () => config,
    async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return provider({ ...draft, extraUntrustedField: "discard me" });
    },
  );
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { result: draft });
  assert.equal(sent.url, "https://api.openai.com/v1/responses");
  assert.equal(sent.options.headers.Authorization, "Bearer test-key-never-live");
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.model, config.model);
  assert.equal(sent.body.text.format.strict, true);
  assert.equal(sent.body.input[0].content[1].image_url, image);
  assert.match(sent.body.instructions, /Never say a property is safe/);
});

test("provider errors never leak payloads or credentials; incomplete and refused results stay errors", async () => {
  for (const [upstream, expected] of [
    [() => new Response("secret upstream diagnostic", { status: 401 }), 502],
    [() => new Response("quota details", { status: 429 }), 429],
    [() => Response.json({ status: "incomplete", output: [] }), 502],
    [
      () =>
        Response.json({
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        }),
      422,
    ],
    [() => provider({ nonsense: true }), 502],
    [
      () => {
        throw new DOMException("timeout", "TimeoutError");
      },
      504,
    ],
  ]) {
    const handler = createImageAnalysisHandler(
      () => config,
      async () => upstream(),
    );
    const response = await handler(request());
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /secret|test-key|quota details/);
  }
});

test("concurrency protection rejects extra paid requests and releases its slot after failure", async () => {
  const pending = [];
  const handler = createImageAnalysisHandler(
    () => config,
    () => new Promise((resolve) => pending.push(resolve)),
  );
  const first = handler(request());
  const second = handler(request());
  assert.equal((await handler(request())).status, 429);
  // Both initial requests must finish reading their bodies before they reach the mock.
  while (pending.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
  pending[0](new Response("failure", { status: 500 }));
  pending[1](provider());
  assert.equal((await first).status, 502);
  assert.equal((await second).status, 200);
  const third = handler(request());
  while (pending.length < 3) await new Promise((resolve) => setTimeout(resolve, 1));
  pending[2](provider());
  assert.equal((await third).status, 200);
});

test("canceling an image request propagates to the provider request", async () => {
  const controller = new AbortController();
  let signal;
  const handler = createImageAnalysisHandler(
    () => config,
    async (_, options) => {
      signal = options.signal;
      controller.abort();
      signal.throwIfAborted();
      return provider();
    },
  );
  const original = request();
  const response = await handler(new Request(original, { signal: controller.signal }));
  assert.equal(signal.aborted, true);
  assert.equal(response.status, 504);
});

test("per-instance request budget is shared by document and house tools", async () => {
  let calls = 0;
  const handler = createImageAnalysisHandler(
    () => config,
    async () => {
      calls++;
      return provider();
    },
  );
  for (let count = 0; count < 10; count++) assert.equal((await handler(request())).status, 200);
  const response = await handler(
    request({ image, consent: true, mode: "document", documentKind: "ID" }),
  );
  assert.equal(response.status, 429);
  assert.equal(calls, 10);
});
