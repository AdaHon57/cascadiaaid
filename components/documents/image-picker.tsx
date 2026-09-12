"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_ACCEPT } from "@/lib/image-capture";

export function ImagePicker({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (file: File) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const choose = useRef<HTMLInputElement>(null);
  function pick(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (file) onSelect(file);
  }
  return (
    <div className="space-y-3 border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => camera.current?.click()}
        >
          Take a photo
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => choose.current?.click()}
        >
          Choose an image
        </Button>
      </div>
      <input
        ref={camera}
        type="file"
        accept={IMAGE_ACCEPT}
        capture="environment"
        className="hidden"
        aria-label="Take a photo"
        disabled={disabled}
        onChange={(event) => pick(event.currentTarget)}
      />
      <input
        ref={choose}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        aria-label="Choose an image"
        disabled={disabled}
        onChange={(event) => pick(event.currentTarget)}
      />
      <p className="text-sm text-slate-600">
        JPEG, PNG, or WebP · Up to 15 MB · One image at a time
      </p>
      <p className="text-xs text-slate-500">
        On supported phones, “Take a photo” opens the camera. Other devices may open the file
        picker. Convert HEIC and PDF files first.
      </p>
    </div>
  );
}
