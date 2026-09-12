export interface UserProfile {
  id: string;
  displayName?: string;
  email?: string;
}

/** @deprecated Use RecoveryEvidence for household evidence records. */
export type { RecoveryEvidence as Document } from "./recovery-case";

/** @deprecated Use the separate definition and state types. */
export type { RecoveryNodeDefinition as TaskNode } from "./recovery-node";
export type * from "./recovery-node";
export type * from "./recovery-case";
export type * from "./recovery-rule";
export type * from "./recovery-update";

export interface Program {
  id: string;
  name: string;
  description?: string;
}
