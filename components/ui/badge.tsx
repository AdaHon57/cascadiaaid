import type { HTMLAttributes } from "react";

type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";
const variants: Record<BadgeVariant, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  accent: "bg-teal-50 text-teal-800 ring-teal-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutral", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-none px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
