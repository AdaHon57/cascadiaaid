"use client";
import { Input, Select, Button } from "@/components/ui";
import { applicationStatuses, yesNo } from "@/data/intake-questions";
import type { AssistanceApplication } from "@/types/intake";
export function ApplicationFields({
  applications,
  onChange,
}: {
  applications: AssistanceApplication[];
  onChange: (applications: AssistanceApplication[]) => void;
}) {
  function edit(id: string, key: keyof AssistanceApplication, value: string) {
    onChange(applications.map((app) => (app.id === id ? { ...app, [key]: value } : app)));
  }
  const unknown = [
    { value: "", label: "Unanswered" },
    { value: "skipped", label: "Skip for now" },
  ];
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Keep a separate record for each program or organization. You can add a program you are still
        preparing to apply to.
      </p>
      {applications.map((app, index) => (
        <fieldset key={app.id} className="space-y-4 rounded-lg border bg-slate-50 p-4">
          <legend className="px-2 font-semibold">Application {index + 1}</legend>
          <Input
            id={`app-${app.id}-org`}
            label="Program or organization (if known)"
            value={app.organization}
            maxLength={2000}
            onChange={(e) => edit(app.id, "organization", e.target.value)}
          />
          <Select
            id={`app-${app.id}-status`}
            label="Where does this application stand?"
            value={app.status}
            options={[
              ...unknown,
              ...applicationStatuses.map(([value, label]) => ({ value, label })),
            ]}
            onChange={(e) => edit(app.id, "status", e.target.value)}
          />
          <Select
            id={`app-${app.id}-outstanding`}
            label="Are there outstanding requests or deadlines?"
            value={app.outstanding}
            options={[...unknown, ...yesNo.map(([value, label]) => ({ value, label }))]}
            onChange={(e) => edit(app.id, "outstanding", e.target.value)}
          />
          {(app.outstanding === "yes" ||
            app.status === "information" ||
            app.status === "appealing") && (
            <>
              <Input
                id={`app-${app.id}-action`}
                label="What is the requested action or appeal? (optional)"
                value={app.action}
                maxLength={2000}
                onChange={(e) => edit(app.id, "action", e.target.value)}
              />
              <Input
                id={`app-${app.id}-deadline`}
                label="Deadline, if known (optional)"
                type="date"
                value={["unknown", "skipped"].includes(app.deadline) ? "" : app.deadline}
                onChange={(e) => edit(app.id, "deadline", e.target.value)}
              />
              <div className="flex gap-4 text-xs">
                <button
                  type="button"
                  className="min-h-9 underline"
                  onClick={() => edit(app.id, "deadline", "unknown")}
                >
                  Deadline not known
                </button>
                <button
                  type="button"
                  className="min-h-9 underline"
                  onClick={() => edit(app.id, "deadline", "skipped")}
                >
                  Skip deadline
                </button>
                {["unknown", "skipped"].includes(app.deadline) && (
                  <span className="self-center">
                    {app.deadline === "unknown" ? "Not sure" : "Skipped"}
                  </span>
                )}
              </div>
            </>
          )}
          <p className="text-xs text-slate-500">
            Changing status keeps the action and deadline you previously recorded.
          </p>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={applications.length >= 30}
        onClick={() =>
          onChange([
            ...applications,
            {
              id: crypto.randomUUID(),
              organization: "",
              status: "",
              outstanding: "",
              action: "",
              deadline: "",
            },
          ])
        }
      >
        Add an application
      </Button>
    </div>
  );
}
