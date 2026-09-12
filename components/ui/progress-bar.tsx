export interface ProgressBarProps {
  value: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  label = "Progress",
  showValue = true,
  className = "",
}: ProgressBarProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {showValue ? (
          <span className="tabular-nums text-slate-500">{Math.round(normalizedValue)}%</span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedValue}
        className="h-2 overflow-hidden rounded-none bg-slate-200"
      >
        <div
          className="h-full rounded-none bg-teal-700 transition-[width] duration-300"
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
    </div>
  );
}
