"use client";

import type { MapBadge } from "@/lib/intake-map";
import { useEffect, useRef, useState } from "react";
import {
  edgePath,
  nodeSize,
  roadmapEdges,
  roadmapLanes,
  roadmapNodes,
  roadmapSize,
} from "@/lib/recovery-roadmap";

const badgeStyles = {
  ready: "border-slate-300 bg-white text-slate-800",
  waiting: "border-blue-400 bg-blue-50 text-blue-950",
  blocked: "border-amber-400 bg-amber-50 text-amber-950",
  complete: "border-emerald-400 bg-emerald-50 text-emerald-950",
  unknown: "border-slate-300 bg-white text-slate-700",
  "not-applicable": "border-amber-400 bg-amber-50 text-amber-950",
};
export function RecoveryRoadmap({
  badges,
  onSelect,
  selected,
  activeNodeId,
  organizations,
}: {
  badges?: Record<string, MapBadge>;
  selected?: string | null;
  activeNodeId?: string;
  organizations?: Record<string, string>;
  onSelect?: (nodeId: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(roadmapSize.width);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, availableWidth / roadmapSize.width);

  return (
    <section
      aria-label="Recovery roadmap"
      className="overflow-hidden rounded-xl border bg-white shadow-sm"
    >
      <div
        ref={viewport}
        role="region"
        aria-label="Recovery map, six tracks"
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600"
      >
        <div
          className="relative mx-auto overflow-hidden"
          style={{ width: roadmapSize.width * scale, height: roadmapSize.height * scale }}
        >
          <div
            className="relative origin-top-left bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]"
            style={{
              width: roadmapSize.width,
              height: roadmapSize.height,
              transform: `scale(${scale})`,
            }}
          >
            {roadmapLanes.map((lane, index) => (
              <section
                key={lane.id}
                aria-labelledby={`lane-${lane.id}`}
                className="absolute top-5 bottom-5 w-[260px] rounded-xl border border-slate-200 bg-slate-50/90"
                style={{ left: lane.x }}
              >
                <h2
                  id={`lane-${lane.id}`}
                  className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold text-slate-800"
                >
                  <span className="font-mono text-xs text-slate-500">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {lane.label}
                </h2>
                {roadmapNodes
                  .filter((node) => node.lane === lane.id)
                  .map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      disabled={!onSelect}
                      aria-current={activeNodeId === node.id ? "step" : undefined}
                      aria-pressed={onSelect ? selected === node.id : undefined}
                      onClick={() => onSelect?.(node.id)}
                      className={`absolute z-10 enabled:hover:brightness-95 flex flex-col items-center justify-center gap-1 rounded-lg border px-3 text-center text-[14px] leading-5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${badges?.[node.id] ? badgeStyles[badges[node.id].tone] : "border-slate-300 bg-white text-slate-800"} shadow-sm ${activeNodeId === node.id ? "roadmap-active" : "aria-pressed:ring-2 aria-pressed:ring-teal-700"}`}
                      style={{ left: node.x - lane.x - 1, top: node.y - 20 - 1, ...nodeSize }}
                      aria-label={`${node.label || "Tax outcome"}${badges?.[node.id] ? `: ${badges[node.id].label}` : ""}`}
                    >
                      {node.label || (badges ? "Tax adjustment / refund" : "")}
                      {organizations?.[node.id] && (
                        <span
                          className="max-w-full truncate text-[10px] leading-3 font-medium"
                          title={organizations[node.id]}
                        >
                          {organizations[node.id]}
                        </span>
                      )}
                      {badges?.[node.id] && (
                        <span className="text-[11px] leading-4 font-medium">
                          {badges[node.id].label}
                        </span>
                      )}
                    </button>
                  ))}
              </section>
            ))}
            {roadmapNodes
              .filter((node) => !node.lane)
              .map((node) => (
                <div
                  key={node.id}
                  aria-current={activeNodeId === node.id ? "step" : undefined}
                  className={`absolute flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-center font-semibold text-slate-950 shadow-sm ${activeNodeId === node.id ? "roadmap-active" : "aria-pressed:ring-2 aria-pressed:ring-teal-700"}`}
                  style={{ left: node.x, top: node.y, ...nodeSize }}
                >
                  {node.label}
                </div>
              ))}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[1]"
              width={roadmapSize.width}
              height={roadmapSize.height}
            >
              <defs>
                <marker
                  id="roadmap-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                </marker>
              </defs>
              {roadmapEdges.map((edge) => (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={edgePath(edge)}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  markerEnd="url(#roadmap-arrow)"
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
      <ul className="sr-only" aria-label="Roadmap connections">
        {roadmapEdges.map((edge) => (
          <li key={`${edge.from}-${edge.to}`}>
            {roadmapNodes.find((node) => node.id === edge.from)?.label} →{" "}
            {roadmapNodes.find((node) => node.id === edge.to)?.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
