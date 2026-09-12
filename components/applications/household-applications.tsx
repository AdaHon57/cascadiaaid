"use client";

import Link from "next/link";
import { useIntakeRecord } from "@/lib/use-intake-record";
import { ongoingApplications } from "@/lib/ongoing-applications";

export function HouseholdApplications() {
  const { record, error } = useIntakeRecord();

  if (error) return <p role="alert">{error}</p>;
  if (!record) return <p role="status">Loading your applications…</p>;

  const applications = ongoingApplications(record);

  if (!applications.length) {
    return (
      <p className="text-slate-600">
        No ongoing applications, check your{" "}
        <Link href="/dashboard" className="font-semibold text-teal-800 underline">
          dashboard
        </Link>{" "}
        to continue.
      </p>
    );
  }

  return (
    <ul className="space-y-4" aria-label="Ongoing applications">
      {applications.map((application) => (
        <li key={application.id} className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">{application.organization || "Unnamed program"}</h2>
          <p className="mt-1 text-slate-600">{application.statusLabel}</p>
          <Link
            href={`/dashboard#${encodeURIComponent(application.taskId)}`}
            className="mt-3 inline-block font-semibold text-teal-800 underline"
          >
            Continue on dashboard
          </Link>
        </li>
      ))}
    </ul>
  );
}
