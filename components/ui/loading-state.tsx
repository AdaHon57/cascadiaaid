export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-4 rounded-none border bg-white p-6 shadow-sm"
    >
      <span className="sr-only">{label}</span>
      <div className="h-5 w-40 animate-pulse rounded-none bg-slate-200" />
      <div className="h-4 w-full animate-pulse rounded-none bg-slate-100" />
      <div className="h-4 w-4/5 animate-pulse rounded-none bg-slate-100" />
    </div>
  );
}
