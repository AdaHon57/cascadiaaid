import { journeyDefinitions } from "@/lib/recovery-journey";
import { cleanDraftText } from "@/lib/draft-text";
import type { IntakeRecord } from "@/types/intake";

/** Applications is a view of saved Dashboard drafts, not intake sample entries. */
export function ongoingApplications(record: IntakeRecord) {
  if (!record.confirmed || !record.journey) return [];

  return journeyDefinitions(record).flatMap((definition) => {
    const task = record.journey!.tasks[definition.id];
    const artifact = task?.artifact;
    if (
      !artifact ||
      artifact.simulated ||
      !artifact.text.trim() ||
      task.notApplicable ||
      task.outcome
    )
      return [];

    return [
      {
        id: definition.id,
        taskId: definition.id,
        title: definition.title,
        organization: artifact.recipient,
        text: cleanDraftText(artifact.text),
        statusLabel: task.submittedAt ? "Submitted · follow-up ongoing" : "Email draft",
      },
    ];
  });
}
