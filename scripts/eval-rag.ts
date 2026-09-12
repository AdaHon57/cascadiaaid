/**
 * End-to-end check against the bundled index and the real OpenAI models.
 * Requires OPENAI_API_KEY (in .env.local or the environment).
 *
 *   npm run rag:eval
 */
import { recoveryEdges } from "../data/recovery-edges.ts";
import { recoveryNodes } from "../data/recovery-nodes.ts";
import { askRecoveryQuestion, type RagWorkflowContext } from "../lib/rag/index.ts";
import { loadEnvFiles } from "./load-env.ts";

loadEnvFiles();

const DOL = "https://dol.wa.gov/wildfire-relief";
const DOR = "https://dor.wa.gov/taxes-rates/property-tax/destroyed-property";
const OIC =
  "https://www.insurance.wa.gov/insurance-resources/natural-disasters/disaster-recovery/steps-take-after-home-damage-or-loss";
const EPA = "https://www.epa.gov/wa/2026-eastern-washington-wildfires-recovery";

interface Case {
  kind: string;
  question: string;
  context?: RagWorkflowContext;
  expectFound: boolean;
  /** Every URL listed here must appear in `sources`. */
  mustCite?: string[];
  minDistinctSources?: number;
}

const CASES: Case[] = [
  {
    kind: "single source",
    question: "Can I replace my driver's license for free after the wildfire?",
    expectFound: true,
    mustCite: [DOL],
  },
  {
    kind: "multiple sources",
    question:
      "My house was destroyed in the wildfire. Can the destroyed property qualify for property-tax relief, and what should I save when filing my insurance claim?",
    expectFound: true,
    mustCite: [DOR, OIC],
    minDistinctSources: 2,
  },
  {
    kind: "unsupported",
    question:
      "What is the maximum SBA disaster loan amount for rebuilding a home, and what interest rate does it charge?",
    expectFound: false,
  },
  {
    kind: "unsupported (off-topic)",
    question: "Which team won the 2022 FIFA World Cup?",
    expectFound: false,
  },
  {
    kind: "node context",
    question: "What should I keep track of for this step?",
    context: { nodeId: "insurance-claim", status: "READY" },
    expectFound: true,
    mustCite: [OIC],
  },
  {
    kind: "node context",
    question: "Can I start this before the hazardous materials are removed?",
    context: { nodeId: "repair-rebuilding", status: "BLOCKED" },
    expectFound: true,
    mustCite: [EPA],
  },
  {
    kind: "example",
    question: "Can damaged property qualify for property-tax relief?",
    expectFound: true,
    mustCite: [DOR],
  },
  {
    kind: "example",
    question: "What financial assistance might be available?",
    expectFound: true,
  },
];

async function main() {
  let failed = 0;

  for (const c of CASES) {
    const problems: string[] = [];
    let output = "";
    try {
      const result = await askRecoveryQuestion(
        { question: c.question, context: c.context },
        { workflow: { nodes: recoveryNodes, edges: recoveryEdges } },
      );
      const urls = result.sources.map((s) => s.url);
      const found = result.status !== "not_found";
      if (found !== c.expectFound) {
        problems.push(
          `expected ${c.expectFound ? "an answer" : "not_found"}, got ${result.status}`,
        );
      }
      if (!c.expectFound && result.sources.length) {
        problems.push("unsupported question should cite no sources");
      }
      for (const url of c.mustCite ?? []) {
        if (!urls.includes(url)) problems.push(`missing citation: ${url}`);
      }
      if (c.minDistinctSources && new Set(urls).size < c.minDistinctSources) {
        problems.push(
          `expected at least ${c.minDistinctSources} distinct sources, got ${new Set(urls).size}`,
        );
      }
      const sources =
        result.sources.map((s, i) => `  [${i + 1}] ${s.title} — ${s.url}`).join("\n") || "  (none)";
      output = `${result.status}\n${result.answer}\nSources:\n${sources}`;
      if (result.warnings.length) output += `\nWarnings:\n  ${result.warnings.join("\n  ")}`;
    } catch (err) {
      problems.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (problems.length) failed++;
    const ctx = c.context ? ` (context: ${c.context.nodeId})` : "";
    console.log(`\n${problems.length ? "FAIL" : "PASS"} [${c.kind}] ${c.question}${ctx}`);
    if (output) console.log(output.replace(/^/gm, "  "));
    for (const p of problems) console.log(`  ✗ ${p}`);
  }

  console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
