import type {
  RecoveryEdge,
  RecoveryEdgeType,
  RecoveryNodeDefinition,
  RecoveryNodeFacts,
  RecoveryNodeState,
} from "@/types/recovery-node";

/** The existing illustrative graph treats every category except recommendations as required. */
export const recoveryEdgeBlocks: Readonly<Record<RecoveryEdgeType, boolean>> = Object.freeze({
  REQUIRED: true,
  LEGAL: true,
  SAFETY: true,
  FINANCIAL: true,
  RECOMMENDED: false,
});

/** Calculate fresh statuses from case facts and direct incoming edges. */
export function calculateRecoveryNodeStates(
  nodes: readonly RecoveryNodeDefinition[],
  edges: readonly RecoveryEdge[],
  facts: readonly RecoveryNodeFacts[],
): RecoveryNodeState[] {
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (typeof node.id !== "string" || !node.id.trim() || nodeIds.has(node.id)) {
      throw new TypeError("Recovery node IDs must be nonempty and unique.");
    }
    nodeIds.add(node.id);
  }

  const factsById = new Map<string, RecoveryNodeFacts>();
  for (const fact of facts) {
    if (!nodeIds.has(fact.nodeId) || factsById.has(fact.nodeId)) {
      throw new TypeError("Recovery facts must reference unique, known node IDs.");
    }
    if (
      (fact.applicable !== null && typeof fact.applicable !== "boolean") ||
      typeof fact.started !== "boolean" ||
      typeof fact.completed !== "boolean"
    ) {
      throw new TypeError("Recovery facts require applicability and boolean progress values.");
    }
    factsById.set(fact.nodeId, fact);
  }

  const prerequisites = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new TypeError("Recovery edges must reference known node IDs.");
    }
    if (!Object.hasOwn(recoveryEdgeBlocks, edge.type)) {
      throw new TypeError("Unknown recovery edge type.");
    }
    if (recoveryEdgeBlocks[edge.type]) {
      const incoming = prerequisites.get(edge.to) ?? [];
      incoming.push(edge.from);
      prerequisites.set(edge.to, incoming);
    }
  }

  return nodes.map(({ id: nodeId }): RecoveryNodeState => {
    const fact = factsById.get(nodeId);
    if (fact?.applicable === false) return { nodeId, status: "NOT_APPLICABLE" };
    if (!fact || fact.applicable === null) return { nodeId, status: "BLOCKED" };
    if (fact.completed) return { nodeId, status: "COMPLETE" };

    const blocked = (prerequisites.get(nodeId) ?? []).some((prerequisiteId) => {
      const prerequisite = factsById.get(prerequisiteId);
      return !(
        prerequisite?.applicable === false ||
        (prerequisite?.applicable === true && prerequisite.completed)
      );
    });
    if (blocked) return { nodeId, status: "BLOCKED" };
    return { nodeId, status: fact.started ? "IN_PROGRESS" : "READY" };
  });
}
