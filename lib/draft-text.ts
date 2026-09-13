/** Clean legacy preambles and normalize punctuation in saved and new drafts. */
export function cleanDraftText(text: string) {
  return text
    .replace(
      /^(SIMULATED HOUSEHOLD\s*[·\u2014-]?\s*)?AI draft (?:\u2014|:) review before use\. Not submitted\.\s*/u,
      (_match, simulated) => (simulated ? "SIMULATED HOUSEHOLD\n\n" : ""),
    )
    .replace(/[ \t]*\u2014[ \t]*/gu, ", ");
}
