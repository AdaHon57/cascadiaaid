/**
 * Ask a question from the command line.
 *
 *   npm run rag:ask -- "Can I replace my driver's license for free?"
 *   npm run rag:ask -- "What do I need for this step?" --node=insurance-claim --status=READY
 *   npm run rag:ask -- "..." --debug          also print the retrieved passages
 */
import { recoveryEdges } from "../data/recovery-edges.ts";
import { recoveryNodes } from "../data/recovery-nodes.ts";
import { askRecoveryQuestion, RagError, type RagWorkflowContext } from "../lib/rag/index.ts";
import { loadEnvFiles } from "./load-env.ts";

loadEnvFiles();

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const question = args.filter((a) => !a.startsWith("--")).join(" ");

  if (!question) {
    console.error(
      'Usage: npm run rag:ask -- "your question" [--node=<nodeId>] [--status=<STATUS>] [--debug]',
    );
    process.exit(1);
  }

  const context: RagWorkflowContext | undefined = value("node")
    ? { nodeId: value("node"), status: value("status") as RagWorkflowContext["status"] }
    : undefined;

  try {
    const result = await askRecoveryQuestion(
      { question, context },
      {
        workflow: { nodes: recoveryNodes, edges: recoveryEdges },
        includeRetrievedChunks: args.includes("--debug"),
      },
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof RagError) {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
