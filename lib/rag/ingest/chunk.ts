/**
 * Section-aware chunking.
 *
 * 1. Each heading-delimited section is a natural unit. Short adjacent sections that share a
 *    parent heading are merged (sub-headings are kept inline as "## Heading" lines).
 * 2. Units that exceed `maxChars` are split between text blocks, falling back to sentence and
 *    word boundaries only for very long blocks.
 * 3. Consecutive chunks from the same unit overlap by up to `overlapChars`.
 */
import { createHash } from "node:crypto";
import { DEFAULT_CHUNKING } from "../config.ts";
import type { ChunkingOptions, ExtractedPage, PageSection, RagChunk } from "../types.ts";

interface Line {
  text: string;
  /** Heading trail of the section this line belongs to. */
  headingPath: string[];
}

export function chunkPage(page: ExtractedPage, options: Partial<ChunkingOptions> = {}): RagChunk[] {
  const opts = resolveChunkingOptions(options);
  const chunks: RagChunk[] = [];
  const seen = new Set<string>();

  for (const group of groupSections(page.sections, opts)) {
    for (const piece of splitGroup(renderGroup(group), opts)) {
      const content = piece.lines.map((l) => l.text).join("\n");
      const heading = piece.headingPath.join(" > ") || page.title;
      const id = `${page.sourceId}:${hash(`${heading}\n${content}`)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      chunks.push({
        id,
        content,
        sourceUrl: page.sourceUrl,
        sourceTitle: page.title,
        heading,
        fetchedAt: page.fetchedAt,
      });
    }
  }
  return chunks;
}

export function resolveChunkingOptions(options: Partial<ChunkingOptions> = {}): ChunkingOptions {
  const opts = { ...DEFAULT_CHUNKING, ...options };
  if (opts.maxChars < 200) throw new Error("chunking.maxChars must be at least 200");
  if (opts.overlapChars < 0 || opts.overlapChars >= opts.maxChars / 2) {
    throw new Error("chunking.overlapChars must be >= 0 and less than half of maxChars");
  }
  return opts;
}

function sectionLength(section: PageSection): number {
  return section.blocks.reduce((n, b) => n + b.length + 1, 0);
}

/** Merge short sections with following sections under the same parent heading. */
function groupSections(sections: PageSection[], opts: ChunkingOptions): PageSection[][] {
  const groups: PageSection[][] = [];
  let i = 0;
  while (i < sections.length) {
    const group = [sections[i]];
    let length = sectionLength(sections[i]);
    const parent = sections[i].headingPath.slice(0, -1);
    while (i + 1 < sections.length && length < opts.minChars) {
      const next = sections[i + 1];
      const nextLength = sectionLength(next) + (next.headingPath.at(-1)?.length ?? 0) + 4;
      const sharesParent = parent.every((h, idx) => next.headingPath[idx] === h);
      if (!sharesParent || length + nextLength > opts.maxChars) break;
      group.push(next);
      length += nextLength;
      i++;
    }
    groups.push(group);
    i++;
  }
  return groups;
}

function renderGroup(group: PageSection[]): Line[] {
  const lines: Line[] = [];
  group.forEach((section, idx) => {
    if (idx > 0) {
      const base = group[0].headingPath;
      const extra = section.headingPath.filter((h, j) => base[j] !== h);
      if (extra.length)
        lines.push({ text: `## ${extra.join(" > ")}`, headingPath: section.headingPath });
    }
    for (const block of section.blocks) {
      for (const text of splitLongText(block, Number.POSITIVE_INFINITY)) {
        lines.push({ text, headingPath: section.headingPath });
      }
    }
  });
  return lines;
}

function splitGroup(
  lines: Line[],
  opts: ChunkingOptions,
): { lines: Line[]; headingPath: string[] }[] {
  // Break any single line that cannot fit in a chunk on its own.
  const units = lines.flatMap((line) =>
    line.text.length <= opts.maxChars
      ? [line]
      : splitLongText(line.text, opts.maxChars - opts.overlapChars).map((text) => ({
          ...line,
          text,
        })),
  );

  const pieces: { lines: Line[]; headingPath: string[] }[] = [];
  let current: Line[] = [];
  let currentLength = 0;
  let freshStart = 0; // index in `current` of the first line that is not overlap

  const emit = () => {
    if (current.length > freshStart) {
      pieces.push({ lines: current, headingPath: current[freshStart].headingPath });
    }
  };

  for (const unit of units) {
    if (currentLength > 0 && currentLength + unit.text.length + 1 > opts.maxChars) {
      emit();
      const overlap = takeOverlap(current, opts.overlapChars);
      current = overlap;
      freshStart = overlap.length;
      currentLength = overlap.reduce((n, l) => n + l.text.length + 1, 0);
    }
    current.push(unit);
    currentLength += unit.text.length + 1;
  }
  emit();
  return pieces;
}

/** Trailing context from the previous chunk: whole lines if they fit, otherwise the tail of the last line. */
function takeOverlap(lines: Line[], overlapChars: number): Line[] {
  if (overlapChars === 0 || lines.length === 0) return [];
  const taken: Line[] = [];
  let total = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].text.startsWith("## ")) break;
    if (total + lines[i].text.length + 1 > overlapChars) break;
    taken.unshift(lines[i]);
    total += lines[i].text.length + 1;
  }
  if (taken.length) return taken;

  const last = lines[lines.length - 1];
  if (last.text.startsWith("## ")) return [];
  const tail = last.text.slice(-overlapChars);
  const wordStart = tail.indexOf(" ");
  const text = wordStart >= 0 ? tail.slice(wordStart + 1) : tail;
  return text ? [{ ...last, text: `…${text}` }] : [];
}

/** Split text at sentence boundaries, then word boundaries, so each piece is at most `max` chars. */
export function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) ?? [text];
  const pieces: string[] = [];
  let buf = "";
  const push = () => {
    if (buf.trim()) pieces.push(buf.trim());
    buf = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > max) {
      push();
      let rest = sentence;
      while (rest.length > max) {
        const cut = rest.lastIndexOf(" ", max);
        const at = cut > max / 2 ? cut : max;
        pieces.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      buf = rest;
      continue;
    }
    if (buf.length + sentence.length > max) push();
    buf += sentence;
  }
  push();
  return pieces;
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}
