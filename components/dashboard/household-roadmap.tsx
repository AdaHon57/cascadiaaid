"use client";

import { useEffect, useState } from "react";
import {
  baseTaskId,
  currentJourneyTask,
  evaluateJourney,
  journeyBadges,
} from "@/lib/recovery-journey";
import { useDashboardFocus } from "@/lib/use-dashboard-focus";
import { useIntakeRecord } from "@/lib/use-intake-record";
import { RecoveryRoadmap } from "./recovery-roadmap";
import { organizationsForMap } from "@/lib/household-organizations";

// Keep this page map-only. Selecting a node only changes its highlight.
export function HouseholdRoadmap() {
  const { record } = useIntakeRecord();
  const dashboardFocus = useDashboardFocus(record?.id);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const updateHash = () => {
      try {
        setSelected(decodeURIComponent(window.location.hash.slice(1)) || null);
      } catch {
        setSelected(null);
      }
    };
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const tasks = record ? evaluateJourney(record) : [];
  const current =
    tasks.find((task) => task.definition.id === dashboardFocus.taskId) ??
    (record ? currentJourneyTask(record, tasks) : null);
  const activeNodeId = current ? baseTaskId(current.definition.id) : undefined;

  return (
    <RecoveryRoadmap
      badges={record ? journeyBadges(record) : undefined}
      organizations={record ? organizationsForMap(record) : undefined}
      selected={selected ? baseTaskId(selected) : (activeNodeId ?? null)}
      activeNodeId={activeNodeId}
      onSelect={(id) => {
        setSelected(id);
        window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
      }}
    />
  );
}
