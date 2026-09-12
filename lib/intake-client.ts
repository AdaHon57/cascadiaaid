import type { IntakeRecord } from "@/types/intake";
export async function intakeRequest(
  path = "/api/intake",
  init?: RequestInit,
): Promise<IntakeRecord> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save intake. Please try again.");
  return data;
}
export const jsonRequest = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
