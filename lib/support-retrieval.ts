import { supportKnowledge } from "@/data/support-knowledge";
import type { ChatTurn, SupportSource } from "@/types/support-chat";

const stopWords = new Set(
  "a an and are as at be been but by can could do does for from had has have how i in is it me my of on or our please should so that the their them there these they this to us was we what when where which who why will with would you your help about need want tell know get".split(
    " ",
  ),
);
const aliases: Record<string, string> = {
  start: "intake",
  begin: "intake",
  questionnaire: "intake",
  form: "intake",
  photo: "documents",
  photos: "documents",
  upload: "documents",
  files: "documents",
  stuck: "blocked",
  block: "blocked",
  status: "roadmap",
  steps: "roadmap",
  delete: "privacy",
  wipe: "privacy",
  reset: "privacy",
  saved: "privacy",
  shelter: "housing",
  stay: "housing",
  accommodation: "housing",
  qualify: "eligibility",
  eligible: "eligibility",
  benefits: "assistance",
  id: "identity",
  identification: "identity",
  licence: "license",
  wallet: "id",
  residence: "occupancy",
  bill: "occupancy",
};

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 1 && !stopWords.has(word))
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word));
}
function queryTokens(text: string) {
  const words = tokens(text);
  return [...new Set(words.flatMap((word) => [word, ...(aliases[word] ? [aliases[word]] : [])]))];
}
const index = supportKnowledge.map((source) => ({
  source,
  terms: tokens(`${source.title} ${source.title} ${source.content}`),
}));
const averageLength = index.reduce((sum, doc) => sum + doc.terms.length, 0) / index.length;

/** BM25 ranks keyword matches, giving rare terms more weight than common ones. */
export function retrieveSupportSources(
  message: string,
  history: ChatTurn[] = [],
  limit = 4,
): SupportSource[] {
  const query = queryTokens(message);
  // Resolve a brief follow-up against the last user topic. Never use assistant
  // claims as retrieval evidence, and do not drag old topics into new questions.
  const followup =
    /\b(it|that|those|them|these|this|more|next|same)\b/i.test(message) && query.length < 7;
  const previous = followup
    ? history.filter((turn) => turn.role === "user").at(-1)?.content
    : undefined;
  const weighted = new Map(query.map((term) => [term, 1]));
  if (previous)
    for (const term of queryTokens(previous)) if (!weighted.has(term)) weighted.set(term, 0.65);
  if (!weighted.size) return [];
  return index
    .map(({ source, terms }) => {
      let score = 0;
      for (const [term, weight] of weighted) {
        const frequency = terms.filter((word) => word === term).length;
        if (!frequency) continue;
        const count = index.filter((doc) => doc.terms.includes(term)).length;
        const rarity = Math.log(1 + (index.length - count + 0.5) / (count + 0.5));
        score +=
          (weight * rarity * (frequency * 2.2)) /
          (frequency + 1.2 * (0.25 + (0.75 * terms.length) / averageLength));
      }
      return { source, score };
    })
    .filter(({ score }) => score >= 1.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ source }) => source);
}
