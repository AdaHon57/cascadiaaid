import { assistJourneyArtifact, type JourneyAssistantConfig } from "@/lib/journey-assistant";
import { applyJourneyCommand, getJourney, journeyDefinitions } from "@/lib/recovery-journey";
import { loadJourneyDemo } from "@/lib/journey-demo";
import { recoveryPacketPdf, recoveryCalendar } from "@/lib/journey-export";
import { updateDashboardStep } from "@/lib/dashboard-steps";
import { intakeSchemaSql } from "@/db/schema";
import { documentTypes } from "@/data/intake-questions";
import { emptyIntake, intakeToRecovery } from "@/lib/intake-recovery";
import { validateDraft, validateDocument } from "@/lib/intake-validation";
import { emptyDocumentFields } from "@/types/intake";
import type { IntakeRecord } from "@/types/intake";
import type { IntakeEnvironment } from "@/types/intake-storage";
import { randomIntake, testDocumentPreview } from "@/lib/random-intake";
import { resolveOrganizations } from "@/lib/resolve-organizations";
import { assignOrganizations, organizationContext } from "@/lib/household-organizations";
import { cleanDraftText } from "@/lib/draft-text";
import {
  automationConfig,
  automationPayload,
  automationTask,
  mergeAutomation,
  runnerRequest,
} from "@/lib/journey-automation";
const cookieName = "cascadia_household";
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
function reply(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: { ...headers, ...(cookie ? { "Set-Cookie": cookie } : {}) },
  });
}
async function hash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, "0")).join("");
}
export async function handleIntakeRequest(
  request: Request,
  env: IntakeEnvironment,
  assistant: JourneyAssistantConfig = {},
): Promise<Response> {
  if (!env.DB || !env.DOCUMENTS)
    return reply({ error: "Saved intake is not available yet. Please try again shortly." }, 503);
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin)
    return reply({ error: "Please use this app to save your intake." }, 403);
  try {
    await env.DB.prepare(intakeSchemaSql).run();
    let token = request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    let cookie: string | undefined;
    if (!token || !/^[-a-f0-9]{72}$/.test(token)) {
      if (request.method !== "GET" || url.pathname !== "/api/intake")
        return reply({ error: "Open intake first to start a saved session." }, 401);
      token = crypto.randomUUID() + crypto.randomUUID();
      cookie = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${url.protocol === "https:" ? "; Secure" : ""}`;
    }
    const key = await hash(token);
    const expiredCookie = `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`;
    let row = await env.DB.prepare(
      "SELECT payload, revision FROM intake_cases WHERE session_hash = ?",
    )
      .bind(key)
      .first<{ payload: string; revision: number }>();
    if (!row) {
      if (url.pathname === "/api/intake" && request.method === "DELETE")
        return reply({ deleted: true }, 200, expiredCookie);
      if (!cookie)
        return reply(
          { error: "This household session has ended. Reload to start again." },
          401,
          expiredCookie,
        );
      if (url.pathname !== "/api/intake" || request.method !== "GET")
        return reply({ error: "Saved household not found." }, 404);
      const created = emptyIntake(crypto.randomUUID());
      await env.DB.prepare(
        "INSERT OR IGNORE INTO intake_cases (session_hash,id,payload,updated_at) VALUES (?,?,?,?)",
      )
        .bind(key, created.id, JSON.stringify(created), new Date().toISOString())
        .run();
      row = await env.DB.prepare(
        "SELECT payload, revision FROM intake_cases WHERE session_hash = ?",
      )
        .bind(key)
        .first<{ payload: string; revision: number }>();
    }
    const record = JSON.parse(row!.payload) as IntakeRecord & { deleting?: boolean };
    record.revision = row!.revision;
    for (const task of Object.values(record.journey?.tasks ?? {})) {
      if (task.artifact) task.artifact.text = cleanDraftText(task.artifact.text);
    }
    if (url.pathname === "/api/intake" && request.method === "DELETE") {
      // Stop browser work and erase its copied documents before deleting the household.
      for (const task of Object.values(getJourney(record).tasks)) {
        if (!task.automation) continue;
        try {
          await runnerRequest(env, task.automation.id, { action: "erase" });
        } catch {
          return reply(
            {
              error:
                "Could not delete the automation session yet. Try wiping your data again when the service is reachable.",
            },
            503,
          );
        }
      }
      // Lock the current revision before removing images. Concurrent saves and
      // uploads lose their revision check; retries can finish a partial deletion.
      if (!record.deleting) {
        const locked = await env.DB.prepare(
          "UPDATE intake_cases SET payload = ?, revision = revision + 1, updated_at = ? WHERE session_hash = ? AND revision = ?",
        )
          .bind(
            JSON.stringify({ ...record, deleting: true }),
            new Date().toISOString(),
            key,
            record.revision,
          )
          .run();
        if (locked.meta.changes !== 1)
          return reply({ error: "Your data changed in another tab. Try wiping it again." }, 409);
      }
      try {
        for (const document of record.documents)
          await env.DOCUMENTS.delete(`${record.id}/${document.id}`);
        await env.DB.prepare("DELETE FROM intake_cases WHERE session_hash = ?").bind(key).run();
      } catch {
        return reply(
          { error: "Could not finish deleting your data. Try again to complete the wipe." },
          500,
        );
      }
      return reply({ deleted: true }, 200, expiredCookie);
    }
    if (record.deleting)
      return reply(
        { error: "Data deletion is in progress. Use Wipe user data in your profile to finish." },
        409,
      );
    if (url.pathname === "/api/intake" && request.method === "GET")
      return reply(record, 200, cookie);
    if (url.pathname === "/api/intake/automation" && request.method === "GET")
      return reply({ available: !!automationConfig(env) });
    const documentId = url.pathname.match(/^\/api\/intake\/documents\/([a-f0-9-]+)$/)?.[1];
    if (documentId && request.method === "GET") {
      if (!record.documents.some((d) => d.id === documentId))
        return reply({ error: "Document not found." }, 404);
      if (record.documents.find((d) => d.id === documentId)?.testData)
        return new Response(testDocumentPreview(), {
          headers: {
            ...headers,
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          },
        });
      const image = await env.DOCUMENTS.get(`${record.id}/${documentId}`);
      if (!image) return reply({ error: "Document not found." }, 404);
      return new Response(image.body, {
        headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": "inline" },
      });
    }
    if (url.pathname === "/api/intake/packet" && request.method === "GET") {
      const taskId = url.searchParams.get("task") || "";
      const artifact = getJourney(record).tasks[taskId]?.artifact;
      if (!artifact) return reply({ error: "Prepared packet not found." }, 404);
      const attachments: { id: string; type: string; bytes?: Uint8Array; simulated: boolean }[] =
        [];
      let byteCount = 0;
      for (const id of artifact.documentIds) {
        const doc = record.documents.find((d) => d.id === id);
        if (!doc)
          return reply({ error: "A packet attachment is missing. Prepare a new packet." }, 409);
        let bytes: Uint8Array | undefined;
        if (!doc.testData) {
          const saved = await env.DOCUMENTS.get(`${record.id}/${id}`);
          if (!saved) return reply({ error: "A packet attachment could not be loaded." }, 409);
          bytes = new Uint8Array(await new Response(saved.body).arrayBuffer());
          byteCount += bytes.length;
          if (byteCount > 30 * 1024 * 1024)
            return reply(
              { error: "Packet attachments exceed 30 MB. Select fewer documents." },
              413,
            );
        }
        attachments.push({ id, type: doc.type, bytes, simulated: !!doc.testData });
      }
      let fontBytes: Uint8Array | undefined;
      if (env.ASSETS) {
        const font = await env.ASSETS.fetch(
          new Request(new URL("/fonts/NotoSans-Regular.ttf", request.url)),
        );
        if (font.ok) fontBytes = new Uint8Array(await font.arrayBuffer());
      }
      const bytes = await recoveryPacketPdf(artifact, attachments, fontBytes);
      return new Response(bytes as BodyInit, {
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="recovery-packet.pdf"',
        },
      });
    }
    if (url.pathname === "/api/intake/calendar" && request.method === "GET") {
      const taskId = url.searchParams.get("task") || "";
      const task = getJourney(record).tasks[taskId];
      const def = journeyDefinitions(record).find((d) => d.id === taskId);
      if (!task?.dueDate || !def) return reply({ error: "No follow-up date recorded." }, 404);
      return new Response(
        recoveryCalendar(`${record.id}-${taskId}`, def.title, task.dueDate, task.notes),
        {
          headers: {
            ...headers,
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'attachment; filename="recovery-follow-up.ics"',
          },
        },
      );
    }
    if (request.method !== "PUT" && request.method !== "POST")
      return reply({ error: "Method not allowed." }, 405);
    async function persist(next: IntakeRecord, revision: number) {
      if (new TextEncoder().encode(JSON.stringify(next)).length > 1500000)
        return reply(
          {
            error:
              "This household has reached the saved demo size limit. Export packets before starting a fresh household.",
          },
          413,
        );
      const result = await env.DB.prepare(
        "UPDATE intake_cases SET payload = ?, revision = revision + 1, updated_at = ? WHERE session_hash = ? AND revision = ?",
      )
        .bind(
          JSON.stringify({ ...next, revision: revision + 1 }),
          new Date().toISOString(),
          key,
          revision,
        )
        .run();
      if (result.meta.changes !== 1)
        return reply(
          {
            error:
              "This intake changed in another tab. Reload to get its latest version before saving.",
          },
          409,
        );
      return reply({ ...next, revision: revision + 1 });
    }
    if (url.pathname === "/api/intake/documents" && request.method === "POST") {
      const type = url.searchParams.get("type");
      if (!documentTypes.some(([id]) => id === type))
        return reply({ error: "Choose a supported document type." }, 400);
      if (record.documents.length >= 50)
        return reply({ error: "This intake already has 50 uploaded images." }, 400);
      if (request.headers.get("Content-Type") !== "image/jpeg")
        return reply({ error: "Choose a prepared JPEG image." }, 400);
      if (Number(request.headers.get("Content-Length")) > 15 * 1024 * 1024)
        return reply({ error: "Image exceeds 15 MB." }, 413);
      const bytes = await request.arrayBuffer();
      const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 3));
      if (
        bytes.byteLength > 15 * 1024 * 1024 ||
        signature[0] !== 255 ||
        signature[1] !== 216 ||
        signature[2] !== 255
      )
        return reply({ error: "Invalid or oversized JPEG image." }, 400);
      const id = crypto.randomUUID();
      await env.DOCUMENTS.put(`${record.id}/${id}`, bytes, {
        httpMetadata: { contentType: "image/jpeg" },
      });
      record.documents.push({
        id,
        type: type!,
        uploadedAt: new Date().toISOString(),
        fields: { ...emptyDocumentFields },
        confirmedAt: null,
        recipientStatus: "unknown",
        recipient: "",
        conflictAcknowledgment: "",
      });
      const result = await persist(record, record.revision);
      if (result.status === 409) await env.DOCUMENTS.delete(`${record.id}/${id}`);
      return result;
    }
    const raw = await request.text();
    if (raw.length > 250_000) return reply({ error: "This intake is too large." }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply({ error: "Invalid request body." }, 400);
    if (url.pathname === "/api/intake/organizations" && request.method === "PUT") {
      if (!record.confirmed) return reply(record);
      const basis = body.refresh === true ? { ...record, organizations: undefined } : record;
      let organizations;
      try {
        organizations = await resolveOrganizations(basis, assistant, request.signal);
      } catch {
        return reply(
          { error: "Could not identify the responsible organizations yet. Try again shortly." },
          503,
        );
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await env.DB.prepare(
          "SELECT payload, revision FROM intake_cases WHERE session_hash = ?",
        )
          .bind(key)
          .first<{ payload: string; revision: number }>();
        if (!latest) return reply({ error: "Household session ended." }, 409);
        const fresh = { ...JSON.parse(latest.payload), revision: latest.revision };
        if (fresh.deleting) return reply({ error: "Household deletion is in progress." }, 409);
        if (organizationContext(fresh) !== organizations.contextKey) return reply(fresh);
        if (JSON.stringify(fresh.organizations) === JSON.stringify(organizations))
          return reply(fresh);
        const saved = await persist(assignOrganizations(fresh, organizations), latest.revision);
        if (saved.status !== 409) return saved;
      }
      return reply(
        { error: "Household information changed. Refresh to see its organizations." },
        409,
      );
    }
    if (url.pathname === "/api/intake/automation" && request.method === "PUT") {
      if (!automationConfig(env))
        return reply({ error: "Application automation is not connected yet." }, 503);
      const taskId = typeof body.taskId === "string" ? body.taskId : "";
      if (!journeyDefinitions(record).some((task) => task.id === taskId))
        return reply({ error: "Unknown recovery task." }, 400);
      const actions = ["start", "advance", "authorize", "answer", "resume", "cancel", "status"];
      if (!actions.includes(body.action))
        return reply({ error: "Invalid automation action." }, 400);
      let current = record;
      let job = getJourney(current).tasks[taskId]?.automation;
      let payload;
      if (body.action === "start") {
        if (body.confirm !== true)
          return reply(
            { error: "Confirm that AI may handle this request using your saved information." },
            400,
          );
        if (job) return reply(current); // A job can never silently create a duplicate.
        automationTask(current, taskId);
        payload = await automationPayload(current, taskId, crypto.randomUUID(), env);
        current = structuredClone(current);
        current.journey = getJourney(current);
        const task = current.journey.tasks[taskId] ?? { notes: "" };
        job = {
          id: payload.id,
          version: 0,
          status: "discovering",
          message: "Finding the official process…",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        task.automation = job;
        current.journey.tasks[taskId] = task;
        const reservation = await persist(current, current.revision);
        if (!reservation.ok) return reservation;
        current = (await reservation.json()) as IntakeRecord;
      }
      if (!job) return reply({ error: "Start this task before continuing automation." }, 400);
      let result;
      try {
        // Recover a reservation whose first service request was interrupted. The
        // runner's start is idempotent and never replaces an existing browser job.
        if (!payload && job.version === 0 && job.status === "discovering") {
          const reservedPayload = await automationPayload(current, taskId, job.id, env);
          await runnerRequest(env, job.id, { action: "start", payload: reservedPayload });
        }
        result = await runnerRequest(env, job.id, {
          action: body.action,
          expectedVersion: job.version,
          ...(payload ? { payload } : {}),
          url: body.url,
          answer: body.answer,
        });
      } catch {
        return reply(
          {
            error:
              "Could not reach automation. Your job is saved; refresh its status before trying again.",
          },
          503,
        );
      }
      // Merge just this job into the latest household so concurrent edits survive.
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await env.DB.prepare(
          "SELECT payload, revision FROM intake_cases WHERE session_hash = ?",
        )
          .bind(key)
          .first<{ payload: string; revision: number }>();
        if (!latest) return reply({ error: "Household session ended." }, 409);
        const fresh = { ...JSON.parse(latest.payload), revision: latest.revision };
        if (fresh.deleting) return reply({ error: "Household deletion is in progress." }, 409);
        const merged = mergeAutomation(fresh, taskId, result);
        if (merged === fresh) return reply(fresh);
        const saved = await persist(merged, latest.revision);
        if (saved.status !== 409) return saved;
      }
      return reply(
        { error: "Your household changed. Refresh to recover the saved automation result." },
        409,
      );
    }
    if (
      url.pathname === "/api/intake/journey" &&
      request.method === "PUT" &&
      typeof body.operationId === "string" &&
      getJourney(record).operationIds.includes(body.operationId)
    )
      return reply(record);
    if (!Number.isInteger(body.revision) || body.revision !== record.revision)
      return reply(
        {
          error:
            "This intake changed in another tab. Reload to get its latest version before saving.",
        },
        409,
      );
    if (url.pathname === "/api/intake/journey" && request.method === "PUT") {
      const next = applyJourneyCommand(record, body);
      if (body.kind === "prepare" && body.assist === true) {
        const task = next.journey!.tasks[body.taskId];
        task.artifact = await assistJourneyArtifact(task.artifact!, assistant, request.signal);
      }
      return persist(next, body.revision);
    }
    if (url.pathname === "/api/intake/scenario" && request.method === "POST") {
      if (Object.values(getJourney(record).tasks).some((task) => task.automation))
        return reply(
          {
            error:
              "Wipe this household's data before replacing a household with saved automation jobs.",
          },
          409,
        );
      if (body.confirm !== true || !["owner", "renter"].includes(body.scenario))
        return reply({ error: "Confirm the fictional scenario replacement first." }, 400);
      return persist(loadJourneyDemo(record, body.scenario), body.revision);
    }
    if (url.pathname === "/api/intake/dashboard" && request.method === "PUT") {
      return persist(updateDashboardStep(record, body.action, body.stepId), body.revision);
    }
    if (url.pathname === "/api/intake/randomize" && request.method === "POST") {
      if (Object.values(getJourney(record).tasks).some((task) => task.automation))
        return reply(
          {
            error:
              "Wipe this household's data before replacing a household with saved automation jobs.",
          },
          409,
        );
      const sample = randomIntake();
      record.dashboard = undefined;
      record.journey = undefined;
      const uploads = record.documents.filter((document) => !document.testData);
      if (uploads.length + sample.documents.length > 50)
        return reply(
          { error: "Not enough document space for test data (50 document limit)." },
          400,
        );
      validateDraft(sample.draft);
      record.draft = sample.draft;
      record.confirmed = structuredClone(sample.draft);
      record.confirmedAt = new Date().toISOString();
      record.documents = [...uploads, ...sample.documents];
      record.caseRecord = intakeToRecovery(
        sample.draft,
        emptyIntake(record.id).caseRecord,
        record.documents,
      );
      return persist(record, body.revision);
    }
    if (url.pathname === "/api/intake" && request.method === "PUT") {
      validateDraft(body.draft);
      record.draft = body.draft;
      if (body.confirm === true) {
        record.confirmed = structuredClone(body.draft);
        record.confirmedAt = new Date().toISOString();
        record.caseRecord = intakeToRecovery(body.draft, record.caseRecord, record.documents);
      }
      return persist(record, body.revision);
    }
    if (documentId && request.method === "PUT") {
      validateDocument(body.document);
      const old = record.documents.find((d) => d.id === documentId);
      if (!old || body.document.id !== documentId || body.document.type !== old.type)
        return reply({ error: "Document not found." }, 404);
      // The server owns upload time and confirmation timestamps.
      const doc = {
        ...body.document,
        uploadedAt: old.uploadedAt,
        testData: old.testData,
        confirmedAt: body.document.confirmedAt ? new Date().toISOString() : null,
      };
      record.documents = record.documents.map((d) => (d.id === documentId ? doc : d));
      // Document changes never implicitly confirm draft answers.
      if (record.confirmed)
        record.caseRecord = intakeToRecovery(record.confirmed, record.caseRecord, record.documents);
      return persist(record, body.revision);
    }
    return reply({ error: "Not found." }, 404);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && /Invalid|Unknown|Name the/.test(error.message))
    )
      return reply({ error: error.message }, 400);
    return reply({ error: "Could not save your intake. Keep this page open and try again." }, 500);
  }
}
