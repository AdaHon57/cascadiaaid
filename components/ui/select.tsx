import { forwardRef, type SelectHTMLAttributes } from "react";

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id, label, hint, error, options, placeholder, className = "", ...props },
  ref,
) {
  const selectId = id ?? props.name;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;
  return (
    <label className="block text-sm font-medium text-slate-800" htmlFor={selectId}>
      {label ? <span className="mb-2 block">{label}</span> : null}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`block h-11 w-full rounded-none border bg-white px-3 text-slate-950 shadow-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 ${error ? "border-red-500" : "border-slate-300"} ${className}`}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span id={`${selectId}-error`} className="mt-2 block text-sm font-normal text-red-700">
          {error}
        </span>
      ) : hint ? (
        <span id={`${selectId}-hint`} className="mt-2 block text-sm font-normal text-slate-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
});
