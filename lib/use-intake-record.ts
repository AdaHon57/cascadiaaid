"use client";
import { useEffect, useState } from "react";
import { intakeRequest } from "@/lib/intake-client";
import type { IntakeRecord } from "@/types/intake";

export function useIntakeRecord() {
  const [record, setRecord] = useState<IntakeRecord | null>(null);
  const [error, setError] = useState("");
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
  return { record, error, setRecord };
}
