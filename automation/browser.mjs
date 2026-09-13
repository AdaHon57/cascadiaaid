import { actionInstructions, actionSchema, modelJson } from "./model.mjs";
import { personalAction, publicUrl, supportedValue } from "./security.mjs";

export async function openBrowser(job, config) {
  const { chromium } = await import("playwright");
  job.browser = await chromium.launch({ headless: config.headless, args: ["--disable-quic"] });
  job.context = await job.browser.newContext({
    acceptDownloads: false,
    serviceWorkers: "block",
    viewport: { width: 1280, height: 900 },
  });
  job.context.setDefaultTimeout(8000);
  await job.context.route("**/*", async (route) => {
    try {
      const url = await publicUrl(route.request().url());
      if (!job.allowedOrigins.includes(url.origin)) {
        if (
          route.request().isNavigationRequest() &&
          route.request().frame().parentFrame() === null
        ) {
          job.pendingDestination = {
            url: url.href,
            organization: url.hostname,
            reason:
              "The authorized portal redirected to this additional site. Confirm it belongs to the same application before continuing.",
          };
        }
        return route.abort();
      }
      await route.continue();
    } catch {
      await route.abort();
    }
  });
  // WebSockets can otherwise bypass HTTP route interception.
  await job.context.routeWebSocket("**/*", (socket) => socket.close());
  job.context.on("page", (page) => {
    job.page = page;
  });
  job.page = await job.context.newPage();
  job.page.on("dialog", async (dialog) => {
    await dialog.dismiss();
  });
  await job.page
    .goto(job.public.destination.url, { waitUntil: "domcontentloaded" })
    .catch(() => {});
}

export async function observe(job) {
  const page = job.page;
  const elements = [];
  const targets = [];
  const bodies = [];
  for (const frame of page.frames()) {
    if (!job.allowedOrigins.includes(new URL(frame.url() || "about:blank").origin)) continue;
    bodies.push(
      (
        await frame
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(0, 16000),
    );
    const controls = frame.locator("a,button,input,textarea,select,[role=button]");
    const count = Math.min(await controls.count(), 240);
    for (let i = 0; i < count; i++) {
      const locator = controls.nth(i);
      const data = await locator
        .evaluate((element) => ({
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute("type") || "",
          value: /password|ssn|social.?security|credit.?card/i.test(
            `${element.getAttribute("type")} ${element.getAttribute("name")}`,
          )
            ? "[hidden]"
            : element.value || "",
          checked: !!element.checked,
          files:
            element.type === "file" ? Array.from(element.files || []).map((file) => file.name) : [],
          label:
            element.getAttribute("aria-label") ||
            Array.from(element.labels || [])
              .map((label) => label.innerText)
              .join(" ") ||
            element.innerText ||
            element.getAttribute("placeholder") ||
            element.getAttribute("name") ||
            "",
          href: element.tagName === "A" ? element.href : "",
          options:
            element.tagName === "SELECT"
              ? Array.from(element.options).map((o) => ({ label: o.label, value: o.value }))
              : [],
        }))
        .catch(() => null);
      if (!data || (!(await locator.isVisible()) && data.type !== "file")) continue;
      elements.push({ id: targets.length, ...data, label: data.label.slice(0, 700) });
      // Bind actions to the observed DOM element, not an index that can shift
      // while the model is deciding what to do.
      targets.push(await locator.elementHandle());
    }
  }
  return { url: page.url(), text: bodies.join("\n").slice(0, 24000), elements, targets };
}

export function verifyCompletion(action, observation, attempted) {
  if (
    !action.evidence ||
    action.evidence.length < 12 ||
    action.evidence.length > 2000 ||
    !observation.text.includes(action.evidence) ||
    (action.reference && !observation.text.includes(action.reference))
  )
    throw new Error("The receiving site has not provided verifiable confirmation.");
  if (
    action.outcome === "submitted" &&
    (!attempted ||
      /\b(not (?:yet )?(?:received|submitted)|submission failed|unsuccessful|unable to submit)\b/i.test(
        action.evidence,
      ) ||
      !/\b(received|submitted|confirmation|successfully|thank you|request number|reference number)\b/i.test(
        action.evidence,
      ))
  )
    throw new Error("Submission has not been confirmed by the receiving site.");
  if (!["submitted", "checked"].includes(action.outcome)) throw new Error("No confirmed outcome.");
}

export async function browserStep(job, config, decide = modelJson) {
  if (!job.browser)
    throw new Error("The browser session ended. Check the recipient before starting again.");
  if (job.pendingDestination) {
    job.public.destination = job.pendingDestination;
    delete job.pendingDestination;
    job.public.status = "awaiting_authorization";
    job.public.message = "This step needs access to another site used by the application.";
    return;
  }
  const observation = await observe(job);
  const { targets, ...visible } = observation;
  const action = await decide(
    config,
    actionInstructions,
    {
      task: job.payload.task,
      plan: job.payload.plan,
      facts: job.payload.facts,
      documents: job.payload.documents.map(({ id, type }) => ({ id, type })),
      observation: visible,
      priorSubmissionAttempt: !!job.attempted,
      recentActions: job.actions.slice(-8),
    },
    actionSchema,
  );
  if (typeof action.message !== "string") throw new Error("Invalid browser instruction.");
  job.public.message = action.message.slice(0, 1000);
  if (["ask", "handoff"].includes(action.action)) {
    job.public.status =
      action.action === "ask" && !personalAction.test(action.message)
        ? "needs_input"
        : "needs_user";
    job.public.question = action.message.slice(0, 1000);
    return;
  }
  if (action.action === "complete") {
    verifyCompletion(action, observation, job.attempted || job.manualStepCompleted);
    job.public.status = action.outcome;
    job.public.receipt = {
      reference: action.reference.slice(0, 300),
      url: observation.url,
      evidence: action.evidence,
      at: new Date().toISOString(),
    };
    return;
  }
  if (action.action === "wait") return;
  if (action.action === "navigate") {
    const url = await publicUrl(action.value);
    if (!observation.elements.some((element) => element.href === url.href))
      throw new Error("The destination was not linked by the current page.");
    if (!job.allowedOrigins.includes(url.origin)) {
      job.public.destination = {
        url: url.href,
        organization: url.hostname,
        reason: "The current portal links to this destination for the next step.",
      };
      job.public.status = "awaiting_authorization";
      return;
    }
    await job.page.goto(url.href, { waitUntil: "domcontentloaded" });
    return;
  }
  const target = targets[action.element];
  const element = observation.elements[action.element];
  if (!target || !element) throw new Error("The requested form control was not observed.");
  const formText = await target.evaluate(
    (control) => control.closest("form")?.innerText || control.parentElement?.innerText || "",
  );
  if (
    personalAction.test(`${element.label} ${element.type}`) ||
    (action.intent === "submit" &&
      /under penalty|perjury|signature|certif(?:y|ication)|attest|swear|credit card|bank account|routing number|accept.*(?:contract|lease)|apply.*loan/i.test(
        formText,
      ))
  ) {
    job.public.status = "needs_user";
    job.public.question =
      "This page requires a personal certification, login, signature, payment, or other action you must complete yourself in the automation browser.";
    return;
  }
  if (["fill", "select"].includes(action.action)) {
    if (!supportedValue(job.payload.facts, action.factKey, action.value)) {
      job.public.status = "needs_input";
      job.public.question = `Please confirm the answer for: ${element.label || "this form field"}`;
      return;
    }
    if (action.action === "fill") await target.fill(action.value);
    else await target.selectOption(action.value);
  } else if (action.action === "check") {
    if (!supportedValue(job.payload.facts, action.factKey, action.value))
      throw new Error("This choice needs a confirmed household answer.");
    await target.setChecked(element.type === "radio" || /^(yes|true)$/i.test(action.value));
  } else if (action.action === "upload") {
    const document = job.payload.documents.find((doc) => doc.id === action.value);
    if (!document) throw new Error("The selected attachment is unavailable.");
    await target.setInputFiles({
      name: `${document.type}-${document.id}.jpg`,
      mimeType: "image/jpeg",
      buffer: Buffer.from(document.data, "base64"),
    });
  } else if (action.action === "click") {
    if (element.type === "checkbox" || element.type === "radio")
      throw new Error("Use a confirmed answer to select this option.");
    if (job.attempted) {
      job.public.status = "uncertain";
      job.public.message =
        "A submission was already attempted. Check its result before taking another action.";
      return;
    }
    if (
      action.intent === "submit" ||
      /\b(submit|send|file request|confirm booking)\b/i.test(element.label)
    ) {
      job.attempted = true;
      // Persist BEFORE the click so a crash cannot cause an automatic repeat.
      await job.save();
    }
    await target.click();
  } else throw new Error("Unsupported browser action.");
  job.actions.push({ action: action.action, label: element.label, intent: action.intent });
}
