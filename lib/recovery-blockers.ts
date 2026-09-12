import type { RecoveryNodeDefinition } from "@/types/recovery-node";
import type { RecoveryDependencyBlocker, RecoveryNodeEvaluation } from "@/types/recovery-rule";

/** Explain existing blocking links only. Breadth-first search avoids loops and duplicate paths. */
export function explainRecoveryDependencies(
  nodeId: string,
  states: ReadonlyMap<string, RecoveryNodeEvaluation>,
  nodes: ReadonlyMap<string, RecoveryNodeDefinition>,
): RecoveryDependencyBlocker[] {
  const blockers: RecoveryDependencyBlocker[] = [];
  const visited = new Set([nodeId]);
  const queue = [{ nodeId, path: [nodeId] }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const prerequisiteId of states.get(current.nodeId)!.blockingNodeIds) {
      if (visited.has(prerequisiteId)) continue;
      visited.add(prerequisiteId);
      const prerequisite = states.get(prerequisiteId)!;
      const path = [...current.path, prerequisiteId];
      blockers.push({
        nodeId: prerequisiteId,
        title: nodes.get(prerequisiteId)!.title,
        status: prerequisite.status,
        path,
        reasons: [...prerequisite.reasons],
      });
      queue.push({ nodeId: prerequisiteId, path });
    }
  }
  return blockers;
}
