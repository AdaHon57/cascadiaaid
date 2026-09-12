import { applicationStatuses } from "@/data/intake-questions";
import type { IntakeRecord } from "@/types/intake";

const ongoingStatuses = [
  "preparing",
  "submitted",
  "information",
  "approved",
  "appealing",
  "partial",
];

export function ongoingApplications(record: IntakeRecord) {
  return (record.confirmed?.applications ?? []).flatMap((application) => {
    const stages = ["funds", "appeal", "review", "application"].map((stage) => ({
      id: `${stage}:${application.id}`,
      task: record.journey?.tasks[`${stage}:${application.id}`],
    }));
    const active = stages.find(
      ({ task }) =>
        task &&
        (task.outcome || task.response || task.submittedAt || task.startedAt || task.artifact),
    );

    // Submission is a milestone; receiving aid is the application's final outcome.
    if (
      application.status === "received" ||
      active?.task?.outcome?.kind === "closed" ||
      stages[0].task?.outcome?.kind === "achieved"
    )
      return [];

    const task = active?.task;
    const status =
      task?.response ??
      (active?.id === `appeal:${application.id}`
        ? "appealing"
        : ["information", "approved", "denied", "appealing"].includes(application.status)
          ? application.status
          : task?.submittedAt
            ? "submitted"
            : task?.startedAt || task?.artifact
              ? "preparing"
              : application.status);
    if (!ongoingStatuses.includes(status)) return [];

    return [
      {
        ...application,
        taskId: active?.id ?? `application:${application.id}`,
        statusLabel:
          status === "partial"
            ? "Partial outcome"
            : (applicationStatuses.find(([value]) => value === status)?.[1] ?? status),
      },
    ];
  });
}
