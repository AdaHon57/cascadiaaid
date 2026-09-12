import type { RecoveryCase } from "@/types/recovery-case";
import type { RecoveryWorkflow } from "@/types/recovery-rule";
import type { RecoveryCaseChange, RecoveryRecalculation } from "@/types/recovery-update";
import { evaluateRecoveryCase } from "@/lib/recovery-case-engine";
import { validateRecoveryCase } from "@/lib/recovery-case-validation";

/** Apply an ordered batch atomically, then evaluate every node from the resulting facts. */
export function applyRecoveryCaseChanges(
  input: RecoveryCase,
  changes: readonly RecoveryCaseChange[],
  workflow: RecoveryWorkflow,
): RecoveryRecalculation {
  if (!Array.isArray(changes)) throw new TypeError("Recovery changes must be an array.");
  const before = evaluateRecoveryCase(input, workflow);
  const caseRecord = structuredClone(input);

  for (const change of changes) {
    if (!change || typeof change !== "object") throw new TypeError("Invalid recovery change.");
    switch (change.type) {
      case "SET_ANSWER":
        // A computed property also lets validation reject unknown keys safely.
        caseRecord.answers = { ...caseRecord.answers, [change.key]: change.value };
        break;
      case "UPSERT_EVIDENCE": {
        const evidence = structuredClone(change.evidence);
        const index = caseRecord.evidence.findIndex((item) => item.id === evidence.id);
        if (index === -1) caseRecord.evidence.push(evidence);
        else caseRecord.evidence[index] = evidence;
        break;
      }
      case "REMOVE_EVIDENCE": {
        const index = caseRecord.evidence.findIndex((item) => item.id === change.evidenceId);
        if (index === -1) throw new TypeError("Cannot remove an unknown evidence item.");
        caseRecord.evidence.splice(index, 1);
        break;
      }
      case "SET_PROGRESS": {
        const progress = structuredClone(change.progress);
        const index = caseRecord.progress.findIndex((item) => item.nodeId === progress.nodeId);
        if (index === -1) caseRecord.progress.push(progress);
        else caseRecord.progress[index] = progress;
        break;
      }
      default:
        throw new TypeError("Unknown recovery change type.");
    }
    // Reject malformed edits even if a later edit would overwrite or remove them.
    validateRecoveryCase(caseRecord, workflow);
  }

  const evaluation = evaluateRecoveryCase(caseRecord, workflow);
  const beforeById = new Map(before.states.map((state) => [state.nodeId, state]));
  const nodeChanges = evaluation.states.flatMap((after) => {
    const previous = beforeById.get(after.nodeId)!;
    // Evaluations have deterministic field and array order, including blocker paths.
    return JSON.stringify(previous) === JSON.stringify(after)
      ? []
      : [{ nodeId: after.nodeId, before: previous, after }];
  });
  return { caseRecord, evaluation, nodeChanges };
}
