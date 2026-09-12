"use client";

import { useState, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}
export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  ariaLabel?: string;
}

export function Tabs({ items, defaultTab, ariaLabel = "Tabs" }: TabsProps) {
  const initialTab = defaultTab ?? items.find((item) => !item.disabled)?.id ?? "";
  const [activeTab, setActiveTab] = useState(initialTab);
  const activeItem = items.find((item) => item.id === activeTab);
  return (
    <div>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-controls={`panel-${item.id}`}
            aria-selected={activeTab === item.id}
            disabled={item.disabled}
            onClick={() => setActiveTab(item.id)}
            className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 disabled:opacity-40 aria-selected:border-teal-700 aria-selected:text-teal-800"
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeItem ? (
        <div
          role="tabpanel"
          id={`panel-${activeItem.id}`}
          aria-labelledby={`tab-${activeItem.id}`}
          className="py-5"
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}
