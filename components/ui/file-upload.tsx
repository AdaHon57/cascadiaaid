"use client";

import { useRef, type ChangeEvent, type DragEvent } from "react";
import { Button } from "./button";

export interface FileUploadProps {
  label?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFilesSelected?: (files: File[]) => void;
}

export function FileUpload({
  label = "Choose files",
  hint = "Select files from your device.",
  accept,
  multiple = false,
  disabled = false,
  onFilesSelected,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const emitFiles = (files: FileList | null) => {
    if (files?.length) onFilesSelected?.(Array.from(files));
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => emitFiles(event.target.files);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) emitFiles(event.dataTransfer.files);
  };
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="rounded-none border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-teal-400 hover:bg-teal-50/40"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        aria-label={label}
      />
      <div
        aria-hidden="true"
        className="mx-auto mb-4 grid size-11 place-items-center rounded-none bg-white text-xl shadow-sm"
      >
        ↑
      </div>
      <p className="font-medium text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="mt-5"
      >
        Browse files
      </Button>
    </div>
  );
}
