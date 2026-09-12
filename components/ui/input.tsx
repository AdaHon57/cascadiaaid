import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, className = "", ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <label className="block text-sm font-medium text-slate-800" htmlFor={inputId}>
      {label ? <span className="mb-2 block">{label}</span> : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`block h-11 w-full rounded-none border bg-white px-3 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 ${error ? "border-red-500" : "border-slate-300"} ${className}`}
        {...props}
      />
      {error ? (
        <span id={`${inputId}-error`} className="mt-2 block text-sm font-normal text-red-700">
          {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="mt-2 block text-sm font-normal text-slate-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
});
