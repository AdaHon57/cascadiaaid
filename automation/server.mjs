import { createServer } from "node:http";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { browserStep, openBrowser } from "./browser.mjs";
import { discoveryInstructions, discoverySchema, modelJson } from "./model.mjs";
import { publicUrl } from "./security.mjs";

const terminal = new Set(["submitted", "checked", "failed", "uncertain", "cancelled"]);

export function createAutomationService(config) {
  if (!config.token || config.token.length < 32 || !config.apiKey || !config.model)
    throw new Error(
      "Configure AUTOMATION_SERVICE_TOKEN (32+ characters), OPENAI_API_KEY, and OPENAI_AUTOMATION_MODEL.",
    );
  const jobs = new Map();
  const locks = new Map();
  const key = createHash("sha256").update(config.token).digest();
  const directory = resolve(config.directory || ".automation-jobs");
  const clock = () => new Date().toISOString();
  async function save(job) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = JSON.stringify({
      public: job.public,
      payload: job.payload,
      allowedOrigins: job.allowedOrigins,
      attempted: job.attempted,
      manualStepCompleted: job.manualStepCompleted,
      actions: job.actions,
      turns: job.turns,
      discoveryAnswers: job.discoveryAnswers,
    });
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const target = resolve(directory, `${job.public.id}.enc`);
    await writeFile(`${target}.tmp`, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
      mode: 0o600,
    });
    await rename(`${target}.tmp`, target);
  }
  async function load(id) {
    if (jobs.has(id)) return jobs.get(id);
    let bytes;
    try {
      bytes = await readFile(resolve(directory, `${id}.enc`));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const job = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(),
    );
    if (!terminal.has(job.public.status)) {
      job.public.status = "uncertain";
      job.public.message =
        "The automation service restarted. Check the receiving site before starting another request; this run will not be replayed.";
      job.public.version++;
      job.public.updatedAt = clock();
    }
    job.save = () => save(job);
    jobs.set(id, job);
    await save(job);
    return job;
  }
  async function discover(job) {
    const result = await modelJson(
      config,
      discoveryInstructions,
      {
        task: job.payload.task,
        plan: job.payload.plan,
        location: job.payload.location,
        organization: job.payload.organization,
        startingUrls: job.payload.startingUrls,
        answers: job.discoveryAnswers || [],
      },
      discoverySchema,
      true,
    );
    if (result.status === "question") {
      job.public.status = "needs_input";
      job.public.question = result.question.slice(0, 1000);
      job.public.message = "One detail is needed to find the right process.";
    } else {
      const url = await publicUrl(result.url);
      job.public.destination = {
        url: url.href,
        organization: result.organization.slice(0, 200),
        reason: result.reason.slice(0, 1000),
      };
      job.public.status = result.status === "found" ? "awaiting_authorization" : "needs_user";
      job.public.message = result.reason.slice(0, 1000);
      if (result.status !== "found") job.public.question = result.reason.slice(0, 1000);
    }
  }
  async function execute(id, command) {
    let job = await load(id);
    if (command.action === "start") {
      if (job) return job.public;
      const payload = command.payload;
      if (
        !payload ||
        payload.id !== id ||
        !payload.task?.id ||
        !payload.plan ||
        !["request", "followup"].includes(payload.plan.mode) ||
        !payload.facts ||
        !Array.isArray(payload.documents)
      )
        throw new Error("Invalid job payload.");
      job = {
        payload,
        public: {
          id,
          version: 0,
          status: "discovering",
          message: "Finding the official application or service process…",
          startedAt: clock(),
          updatedAt: clock(),
        },
        allowedOrigins: [],
        attempted: false,
        actions: [],
        turns: 0,
        discoveryAnswers: [],
      };
      job.save = () => save(job);
      jobs.set(id, job);
      await save(job);
      return job.public;
    }
    if (!job) throw new Error("Automation job not found.");
    if (command.action === "erase") {
      if (job.browser) await job.browser.close().catch(() => {});
      const publicJob = {
        id,
        version: job.public.version + 1,
        status: "cancelled",
        message: "Automation data deleted.",
        startedAt: clock(),
        updatedAt: clock(),
      };
      job = {
        public: publicJob,
        payload: null,
        allowedOrigins: [],
        actions: [],
        turns: 0,
        attempted: false,
      };
      job.save = () => save(job);
      jobs.set(id, job);
      await save(job);
      return job.public;
    }
    if (command.action === "status") return job.public;
    if (terminal.has(job.public.status)) return job.public;
    if (command.expectedVersion !== job.public.version) return job.public;
    try {
      if (command.action === "cancel") {
        job.public.status = job.attempted ? "uncertain" : "cancelled";
        job.public.message = job.attempted
          ? "Stopped. A request may already have reached the recipient; check before retrying."
          : "Automation stopped.";
      } else if (Date.now() - Date.parse(job.public.startedAt) > 60 * 60_000 || job.turns >= 80) {
        job.public.status = job.attempted ? "uncertain" : "needs_user";
        job.public.message =
          "This run reached its time or action limit. Continue directly with the receiving organization.";
      } else if (command.action === "authorize" && job.public.status === "awaiting_authorization") {
        if (command.url !== job.public.destination.url)
          throw new Error("The destination changed. Review it again.");
        const url = await publicUrl(command.url);
        if (!job.allowedOrigins.includes(url.origin)) job.allowedOrigins.push(url.origin);
        if (!job.browser) {
          if ([...jobs.values()].filter((other) => other.browser).length >= 3)
            throw new Error("All automation browsers are busy. Try again later.");
          await openBrowser(job, config);
        } else await job.page.goto(url.href, { waitUntil: "domcontentloaded" }).catch(() => {});
        job.public.status = "working";
        job.public.message = "Opening the authorized form…";
        delete job.public.question;
      } else if (command.action === "answer" && job.public.status === "needs_input") {
        if (
          typeof command.answer !== "string" ||
          !command.answer.trim() ||
          command.answer.length > 4000
        )
          throw new Error("Provide the requested answer (up to 4000 characters).");
        job.payload.facts[`answer:${job.public.version}`] = command.answer.trim();
        if (!job.browser)
          job.discoveryAnswers.push({
            question: job.public.question,
            answer: command.answer.trim(),
          });
        job.public.status = job.browser ? "working" : "discovering";
        delete job.public.question;
      } else if (command.action === "resume" && job.public.status === "needs_user") {
        if (!job.browser)
          throw new Error("This process must be completed directly with the organization.");
        job.public.status = "working";
        job.manualStepCompleted = true;
        delete job.public.question;
      } else if (
        command.action === "advance" &&
        ["discovering", "working"].includes(job.public.status)
      ) {
        job.turns++;
        if (job.public.status === "discovering") await discover(job);
        else await browserStep(job, config);
      } else throw new Error("This action is not available in the current state.");
    } catch {
      job.public.status = job.attempted ? "uncertain" : "failed";
      job.public.message = job.attempted
        ? "The submission result could not be verified. Check with the recipient before retrying."
        : "Automation could not continue. No confirmed submission was recorded. Use the official process or check the automation service configuration.";
    }
    job.public.version++;
    job.public.updatedAt = clock();
    job.public.canResume =
      job.public.status === "needs_user" &&
      !!job.browser &&
      !config.headless &&
      job.turns < 80 &&
      Date.now() - Date.parse(job.public.startedAt) < 60 * 60_000;
    await save(job);
    if (terminal.has(job.public.status) && job.browser) {
      await job.browser.close().catch(() => {});
      delete job.browser;
      delete job.context;
      delete job.page;
    }
    return job.public;
  }
  async function dispatch(id, command) {
    const previous = locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => execute(id, command));
    locks.set(id, next);
    try {
      return await next;
    } finally {
      if (locks.get(id) === next) locks.delete(id);
    }
  }
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json");
    const supplied = Buffer.from(request.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(401).end(JSON.stringify({ error: "Unauthorized." }));
      return;
    }
    if (request.url === "/health" && request.method === "GET") {
      response.end(JSON.stringify({ available: true }));
      return;
    }
    const id = request.url?.match(/^\/jobs\/([a-f0-9-]{36})$/)?.[1];
    if (!id || request.method !== "POST") {
      response.writeHead(404).end("{}");
      return;
    }
    try {
      let length = 0;
      const chunks = [];
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 24 * 1024 * 1024) throw new Error("Request too large.");
        chunks.push(chunk);
      }
      const command = JSON.parse(Buffer.concat(chunks).toString());
      const result = await dispatch(id, command);
      response.end(JSON.stringify(result));
    } catch {
      response
        .writeHead(400)
        .end(JSON.stringify({ error: "Automation request could not be processed." }));
    }
  });
  return {
    server,
    dispatch,
    close: async () => {
      for (const job of jobs.values()) if (job.browser) await job.browser.close().catch(() => {});
      await new Promise((done) => server.close(done));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = {
    token: process.env.AUTOMATION_SERVICE_TOKEN,
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_AUTOMATION_MODEL || process.env.OPENAI_SUPPORT_MODEL,
    headless: process.env.AUTOMATION_HEADLESS === "true",
    directory: process.env.AUTOMATION_JOB_DIRECTORY,
  };
  const service = createAutomationService(config);
  service.server.listen(
    Number(process.env.AUTOMATION_PORT || 4318),
    process.env.AUTOMATION_HOST || "127.0.0.1",
    () => {
      console.log("Cascadia Aid automation service is ready.");
    },
  );
  process.on("SIGTERM", () => void service.close());
  process.on("SIGINT", () => void service.close());
}
