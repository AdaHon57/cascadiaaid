"use client";
import { useEffect, useState } from "react";
import { intakeRequest } from "@/lib/intake-client";
import { jsonRequest } from "@/lib/intake-client";
import { organizationContext } from "@/lib/household-organizations";
import type { IntakeRecord } from "@/types/intake";

export function useIntakeRecord() {
  const [record, setRecord] = useState<IntakeRecord | null>(null);
  const [error, setError] = useState("");
  const [organizationError, setOrganizationError] = useState("");
  const context = record?.confirmed ? organizationContext(record) : "";
  const savedContext = record?.organizations?.contextKey;
  const householdId = record?.id;
  useEffect(() => {
    if (!context || savedContext === context) return;
    let cancelled = false;
    const key = `${householdId}:${context}`;
    let request = organizationRequests.get(key);
    if (!request) {
      request = intakeRequest("/api/intake/organizations", jsonRequest({}));
      organizationRequests.set(key, request);
      void request.finally(() => organizationRequests.delete(key)).catch(() => {});
    }
    request
      .then((next) => {
        if (cancelled) return;
        setRecord((current) =>
          current?.id === next.id && current.revision > next.revision ? current : next,
        );
        setOrganizationError("");
      })
      .catch(() => {
        if (!cancelled)
          setOrganizationError(
            "Could not identify organizations. Use Find organization in your step to retry.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [context, savedContext, householdId]);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      intakeRequest("/api/intake", { signal })
        .then((next) => {
          if (!signal.aborted) {
            setRecord((current) =>
              current?.id === next.id && current.revision > next.revision ? current : next,
            );
            setError("");
          }
        })
        .catch((e) => {
          if (!signal.aborted) setError(e.message);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", onVisible);
    window.addEventListener("cascadia-record-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(onVisible, 30000);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("cascadia-record-changed", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);
  return { record, error, organizationError, setRecord };
}

const organizationRequests = new Map<string, Promise<IntakeRecord>>();
