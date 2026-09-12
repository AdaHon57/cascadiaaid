"use client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { IntakeQuestion } from "@/data/intake-questions";
import type { IntakeValue } from "@/types/intake";
export function QuestionField({
  question: q,
  value,
  onChange,
}: {
  question: IntakeQuestion;
  value: IntakeValue | undefined;
  onChange: (value: IntakeValue | undefined) => void;
}) {
  const id = `intake-${q.id}`;
  const special = value === "unknown" || value === "skipped";
  return (
    <div className="space-y-2">
      {q.kind === "multi" ? (
        <fieldset aria-describedby={q.hint ? `${id}-hint` : undefined}>
          <legend className="mb-3 text-sm font-semibold">{q.label}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options?.map(([option, label]) => (
              <label
                key={option}
                className="flex min-h-12 items-center gap-3 rounded border p-3 text-sm has-checked:border-teal-700 has-checked:bg-teal-50"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-teal-700"
                  checked={Array.isArray(value) && value.includes(option)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...(Array.isArray(value) ? value : []), option]
                        : (Array.isArray(value) ? value : []).filter((v) => v !== option),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
          {q.hint && (
            <p id={`${id}-hint`} className="mt-2 text-sm text-slate-500">
              {q.hint}
            </p>
          )}
        </fieldset>
      ) : q.options ? (
        <Select
          id={id}
          label={q.label}
          hint={q.hint}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          options={[
            { value: "", label: "Choose an answer" },
            ...q.options.map(([value, label]) => ({ value, label })),
            { value: "skipped", label: "Skip for now" },
          ]}
        />
      ) : (
        <Input
          id={id}
          type={q.kind === "date" ? "date" : "text"}
          label={q.label}
          hint={q.hint}
          maxLength={2000}
          value={typeof value === "string" && !special ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          autoComplete="off"
        />
      )}
      <div className="flex flex-wrap gap-4 text-xs">
        {(!q.options || q.kind === "multi") && (
          <button
            type="button"
            className="min-h-9 text-slate-600 underline"
            onClick={() => onChange("unknown")}
          >
            Not sure
          </button>
        )}
        <button
          type="button"
          className="min-h-9 text-slate-600 underline"
          onClick={() => onChange("skipped")}
        >
          Skip this question
        </button>
        {value !== undefined && (
          <button
            type="button"
            className="min-h-9 text-slate-600 underline"
            onClick={() => onChange(undefined)}
          >
            Clear answer
          </button>
        )}
        {special && (
          <span className="self-center text-slate-500">
            {value === "unknown" ? "Not sure" : "Skipped for now"}
          </span>
        )}
      </div>
    </div>
  );
}
