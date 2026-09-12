/**
 * Download approved pages and extract their useful content as heading-delimited sections.
 * Only the exact URL of each approved source is requested; links are never followed.
 * Node-only (used by the index build script, never at request time).
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { errorMessage } from "../errors.ts";
import type {
  ApprovedSource,
  ExtractedPage,
  PageSection,
  SourceExtractionOptions,
} from "../types.ts";

const USER_AGENT =
  "Mozilla/5.0 (compatible; CascadiaAid-RAG/0.1; +approved-source indexer; fetches a fixed allowlist only)";

/** Elements that never carry page content. */
const GENERIC_REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "embed",
  "img",
  "picture",
  "video",
  "audio",
  "map",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "nav",
  "aside",
  "dialog",
  "footer",
  "[role=navigation]",
  "[role=banner]",
  "[role=contentinfo]",
  "[role=complementary]",
  "[role=search]",
  "[role=dialog]",
  "[role=alertdialog]",
  "[hidden]",
  "[aria-hidden=true]",
  // Note: inline `display:none` is deliberately NOT removed. Accordion and tab panels on these
  // sites are collapsed that way, and their contents are real page content.
];

/** Class/ID tokens that mark navigation, cookie notices, screen-reader-only labels, share widgets, etc. */
const GENERIC_REMOVE_TOKEN_PATTERNS = [
  /breadcrumb/i,
  /cookie|consent|gdpr/i,
  /^(hidden|sr-only|visually-hidden|visuallyhidden|u-visually-hidden|element-invisible|screen-reader-text|d-none)$/i,
  /^skip[-_]?(link|to|nav|main|content)/i,
  /secondarynav|sidenav|side-nav|sidebar-nav|subnav|sitenav|megamenu|mega-menu/i,
  /^(share|social-share|sharethis|addthis|a2a)/i,
  /^ae-compliance/i, // hidden text injected by the AudioEye accessibility overlay
];

/** Section headings that are boilerplate on most government sites. Matched case-insensitively. */
const GENERIC_DROP_SECTION_HEADINGS = [
  "breadcrumb",
  "on this page",
  "in this section",
  "related news",
  "related links",
  "related content",
  "share this page",
  "share",
  "was this page helpful?",
  "contact us",
];

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "blockquote",
  "caption",
  "center",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "header",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "ul",
]);
const HEADING_TAGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

export type ScrapeResult =
  { ok: true; page: ExtractedPage } | { ok: false; sourceId: string; url: string; error: string };

/** Fetch and extract one approved source. Never throws: failures are returned with a reason. */
export async function scrapeSource(
  source: ApprovedSource,
  options: FetchOptions = {},
): Promise<ScrapeResult> {
  try {
    const fetchedAt = new Date().toISOString();
    const html = await fetchSourceHtml(source.url, options);
    const page = extractPage(html, source, fetchedAt);
    const totalChars = page.sections.reduce((n, s) => n + s.blocks.join(" ").length, 0);
    if (totalChars < 200) {
      throw new Error(
        `Extracted only ${totalChars} characters of content. The page may be blocked, empty, rendered by JavaScript, or its layout changed.`,
      );
    }
    return { ok: true, page };
  } catch (err) {
    return { ok: false, sourceId: source.id, url: source.url, error: errorMessage(err) };
  }
}

export async function fetchSourceHtml(url: string, options: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 30_000, retries = 2, fetchImpl = fetch } = options;
  const expectedHost = new URL(url).hostname;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    try {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      if (!res.ok) throw new NonRetryableError(`HTTP ${res.status} ${res.statusText}`);

      const finalUrl = res.url || url;
      if (new URL(finalUrl).hostname !== expectedHost) {
        throw new NonRetryableError(`Redirected off the approved host to ${finalUrl}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!/html/i.test(contentType)) {
        throw new NonRetryableError(`Expected an HTML page but got content-type "${contentType}"`);
      }
      return await res.text();
    } catch (err) {
      if (err instanceof NonRetryableError) throw err;
      lastError = err;
    }
  }
  throw new Error(`Download failed after ${retries + 1} attempt(s): ${errorMessage(lastError)}`, {
    cause: lastError,
  });
}

class NonRetryableError extends Error {}

/** Pure HTML → sections extraction. Exported for tests. */
export function extractPage(
  html: string,
  source: ApprovedSource,
  fetchedAt: string,
): ExtractedPage {
  const $ = cheerio.load(html);
  const opts: SourceExtractionOptions = source.extraction ?? {};
  const documentTitle = cleanDocumentTitle($("title").first().text());

  const root = selectContentRoot($, opts.contentSelector);
  removeBoilerplate($, root, opts.removeSelectors ?? []);

  const events = collectEvents($, root);
  const dropHeadings = new Set(
    [...GENERIC_DROP_SECTION_HEADINGS, ...(opts.dropSectionHeadings ?? [])].map(
      normalizeHeadingKey,
    ),
  );
  const sections = buildSections(events, dropHeadings);

  const h1 = sections.find((s) => s.level === 1)?.headingPath[0];
  return {
    sourceId: source.id,
    sourceUrl: source.url,
    title: h1 || documentTitle || source.url,
    fetchedAt,
    sections,
  };
}

function selectContentRoot(
  $: cheerio.CheerioAPI,
  contentSelector?: string,
): cheerio.Cheerio<AnyNode> {
  if (contentSelector) {
    const el = $(contentSelector).first();
    if (!el.length) throw new Error(`contentSelector "${contentSelector}" matched nothing`);
    return el;
  }
  for (const selector of ["main, [role=main]", "article", "#content, #main-content", "body"]) {
    // Prefer the innermost match (pages sometimes nest <main> elements); break ties by text length.
    const candidates = $(selector)
      .toArray()
      .filter((el) => $(el).find(selector).length === 0);
    if (candidates.length) {
      candidates.sort((a, b) => $(b).text().length - $(a).text().length);
      return $(candidates[0]);
    }
  }
  return $.root();
}

/** Cloudflare replaces email addresses with "[email protected]" plus an XOR-encoded copy; restore them. */
function decodeProtectedEmails($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): void {
  root.find("[data-cfemail]").each((_, el) => {
    const hex = $(el).attr("data-cfemail") ?? "";
    if (!/^([0-9a-f]{2}){2,}$/i.test(hex)) return;
    const key = Number.parseInt(hex.slice(0, 2), 16);
    let email = "";
    for (let i = 2; i < hex.length; i += 2)
      email += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16) ^ key);
    $(el).text(email);
  });
}

function removeBoilerplate(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  extra: string[],
): void {
  decodeProtectedEmails($, root);
  root.find([...GENERIC_REMOVE_SELECTORS, ...extra].join(",")).remove();
  // Page headers inside the content area are kept only if they hold the page title.
  root.find("header").each((_, el) => {
    if ($(el).find("h1").length === 0) $(el).remove();
  });
  root.find("[class], [id]").each((_, el) => {
    const tokens = [...($(el).attr("class") ?? "").split(/\s+/), $(el).attr("id") ?? ""].filter(
      Boolean,
    );
    if (tokens.some((t) => GENERIC_REMOVE_TOKEN_PATTERNS.some((re) => re.test(t)))) $(el).remove();
  });
}

type ContentEvent =
  { kind: "heading"; level: number; text: string } | { kind: "text"; text: string };

/** Walk the DOM in document order, emitting headings and flattened text blocks. */
function collectEvents($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): ContentEvent[] {
  const events: ContentEvent[] = [];
  let buffer = "";
  let pendingPrefix = "";

  const flush = () => {
    const text = normalizeWhitespace(buffer);
    buffer = "";
    if (!text) return;
    events.push({ kind: "text", text: pendingPrefix + text });
    pendingPrefix = "";
  };

  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      buffer += (node as unknown as { data: string }).data;
      return;
    }
    if (node.type !== "tag") return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag in HEADING_TAGS) {
      flush();
      const text = normalizeWhitespace($(el).text());
      if (text) events.push({ kind: "heading", level: HEADING_TAGS[tag], text });
      return;
    }
    if (tag === "tr") {
      flush();
      const cells = $(el)
        .children("td, th")
        .toArray()
        .map((c) => normalizeWhitespace($(c).text()))
        .filter(Boolean);
      if (cells.length) events.push({ kind: "text", text: cells.join(" | ") });
      return;
    }
    if (tag === "br") {
      buffer += " ";
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      if (tag === "li") pendingPrefix = "- ";
      for (const child of el.children) walk(child);
      flush();
      pendingPrefix = "";
      return;
    }
    for (const child of el.children) walk(child);
  };

  for (const child of root.contents().toArray()) walk(child);
  flush();
  return events;
}

function buildSections(events: ContentEvent[], dropHeadings: Set<string>): PageSection[] {
  const sections: PageSection[] = [];
  let path: { level: number; text: string }[] = [];
  let current: PageSection = { headingPath: [], level: 0, blocks: [] };
  let dropUntilLevel: number | null = null;

  for (const ev of events) {
    if (ev.kind === "heading") {
      if (dropUntilLevel !== null && ev.level > dropUntilLevel) continue;
      dropUntilLevel = null;

      const last = path[path.length - 1];
      if (last && last.level === ev.level && last.text === ev.text && current.blocks.length === 0) {
        continue; // duplicated heading (e.g. the same <h1> rendered twice)
      }
      if (dropHeadings.has(normalizeHeadingKey(ev.text))) {
        dropUntilLevel = ev.level;
        continue;
      }
      if (current.blocks.length) sections.push(current);
      path = [...path.filter((p) => p.level < ev.level), { level: ev.level, text: ev.text }];
      current = { headingPath: path.map((p) => p.text), level: ev.level, blocks: [] };
      continue;
    }
    if (dropUntilLevel !== null) continue;
    if (current.blocks[current.blocks.length - 1] === ev.text) continue; // consecutive duplicate
    current.blocks.push(ev.text);
  }
  if (current.blocks.length) sections.push(current);
  return sections;
}

const ZERO_WIDTH_CHARS = new RegExp(
  `[${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200d)}${String.fromCharCode(0xfeff)}]`,
  "g",
);

function normalizeWhitespace(text: string): string {
  return text.replace(ZERO_WIDTH_CHARS, "").replace(/\s+/g, " ").trim();
}

function normalizeHeadingKey(text: string): string {
  return normalizeWhitespace(text)
    .replace(/[:\s]+$/, "")
    .toLowerCase();
}

function cleanDocumentTitle(raw: string): string {
  return normalizeWhitespace(raw).split(/\s+[|•–-]\s+/)[0] ?? "";
}
