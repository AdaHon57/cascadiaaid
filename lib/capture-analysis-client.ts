/** Same extraction endpoint for standalone capture and optional intake documents. */
export async function analyzeCapture(
  input: {
    image: string;
    consent: boolean;
    mode: "house" | "document";
    documentKind: "ID" | "UTILITY_BILL" | "OTHER";
  },
  accessCode: string,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/image-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Analysis-Code": accessCode },
    body: JSON.stringify(input),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(55_000)])
      : AbortSignal.timeout(55_000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(typeof data.error === "string" ? data.error : "Image analysis failed.");
  return data.result as unknown;
}
