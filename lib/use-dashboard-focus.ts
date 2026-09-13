"use client";

import { useCallback, useEffect, useState } from "react";

const eventName = "cascadia-dashboard-focus";

export function useDashboardFocus(recordId?: string) {
  const key = recordId ? `cascadia-dashboard-focus:${recordId}` : null;
  const [stored, setStored] = useState<{ key: string; taskId: string | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    const read = () => {
      let taskId: string | null = null;
      try {
        taskId = localStorage.getItem(key);
      } catch {
        // Browser storage may be unavailable.
      }
      setStored({ key, taskId });
    };
    read();
    window.addEventListener(eventName, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(eventName, read);
      window.removeEventListener("storage", read);
    };
  }, [key]);

  const save = useCallback(
    (taskId: string | null) => {
      if (!key) return;
      setStored({ key, taskId });
      try {
        if (taskId) localStorage.setItem(key, taskId);
        else localStorage.removeItem(key);
        window.dispatchEvent(new Event(eventName));
      } catch {
        // Keep the current page usable when browser storage is unavailable.
      }
    },
    [key],
  );

  return {
    taskId: stored?.key === key ? stored.taskId : null,
    ready: !!key && stored?.key === key,
    save,
  };
}
