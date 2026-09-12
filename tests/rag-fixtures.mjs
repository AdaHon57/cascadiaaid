// Shared fixtures for the RAG tests. The URLs are real approved sources so allowlist checks pass.

export const DOL_URL = "https://dol.wa.gov/wildfire-relief";
export const DOR_URL = "https://dor.wa.gov/taxes-rates/property-tax/destroyed-property";
export const OIC_URL =
  "https://www.insurance.wa.gov/insurance-resources/natural-disasters/disaster-recovery/steps-take-after-home-damage-or-loss";
export const EPA_URL = "https://www.epa.gov/wa/2026-eastern-washington-wildfires-recovery";

const fetchedAt = "2026-09-01T00:00:00.000Z";

const chunk = (id, sourceUrl, sourceTitle, heading, content) => ({
  id,
  sourceUrl,
  sourceTitle,
  heading,
  content,
  fetchedAt,
});

export const CHUNKS = [
  chunk(
    "dol-wildfire-relief:aaa",
    DOL_URL,
    "Wildfire Relief",
    "Wildfire Relief > Driver licenses and ID cards",
    "Customers can get a no-charge replacement driver license or ID card if theirs was lost because of wildfire.\n- The transaction must be done in person.",
  ),
  chunk(
    "dol-wildfire-relief:bbb",
    DOL_URL,
    "Wildfire Relief",
    "Wildfire Relief > Vehicle and vessel titles",
    "Customers can get a no-charge vehicle or vessel title replacement if theirs was lost because of wildfire.",
  ),
  chunk(
    "dor-destroyed-property:ccc",
    DOR_URL,
    "Destroyed property",
    "Destroyed property",
    "Destroyed property may be eligible for a reduction in assessed value and abatement of property taxes.",
  ),
  chunk(
    "oic-steps-after-home-damage:ddd",
    OIC_URL,
    "Steps to take after home damage or a loss",
    "Steps to take after home damage or a loss > Filing a claim",
    "- Be ready to provide receipts, photos, or any other documentation to prove your loss.\n- Keep copies of everything.",
  ),
  chunk(
    "epa-eastern-wa-wildfires-recovery:eee",
    EPA_URL,
    "2026 Eastern Washington Wildfires Recovery",
    "Hazardous materials removal",
    "Please make sure your property is marked complete for household hazardous materials removal before beginning the next steps in the rebuilding process.",
  ),
];

export function makeIndex(chunks = CHUNKS, overrides = {}) {
  const urls = [...new Set(chunks.map((c) => c.sourceUrl))];
  return {
    formatVersion: 1,
    builtAt: fetchedAt,
    chunking: { maxChars: 1500, overlapChars: 200, minChars: 300 },
    embedding: null,
    sources: urls.map((url) => ({
      id: url,
      url,
      title: chunks.find((c) => c.sourceUrl === url).sourceTitle,
      status: "ok",
      fetchedAt,
      chunkCount: chunks.filter((c) => c.sourceUrl === url).length,
    })),
    chunks,
    ...overrides,
  };
}

/** Fake answer model that records requests and returns whatever `respond` produces. */
export function fakeModel(respond) {
  const calls = [];
  return {
    calls,
    model: {
      name: "fake",
      generateJson: async (request) => {
        calls.push(request);
        return respond(request);
      },
    },
  };
}

/** The passage ID (S1, S2, …) whose content contains `needle`, as shown to the model. */
export function passageIdFor(prompt, needle) {
  const hit = prompt
    .split("<passage ")
    .slice(1)
    .find((p) => p.includes(needle));
  if (!hit) throw new Error(`no passage containing "${needle}"`);
  return hit.match(/^id="(S\d+)"/)[1];
}
