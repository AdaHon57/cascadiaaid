/** Browser-only image preparation shared by document and house-photo capture. */
export const MAX_CAPTURE_BYTES = 15 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export function validateCaptureFile(file: Pick<File, "type" | "size">): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image. Convert HEIC or PDF files first.");
  }
  if (file.size === 0 || file.size > MAX_CAPTURE_BYTES) {
    throw new Error("Choose a nonempty image smaller than 15 MB.");
  }
}

/** Decoding checks the file; redrawing applies orientation and drops original metadata. */
export async function prepareCapture(file: File, maxDimension: number): Promise<string> {
  validateCaptureFile(file);
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    if (
      !img.naturalWidth ||
      !img.naturalHeight ||
      img.naturalWidth * img.naturalHeight > 50_000_000
    ) {
      throw new Error("Choose an image under 50 megapixels.");
    }
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch (error) {
    if (error instanceof DOMException) {
      throw new Error("This image could not be opened. Try another JPEG, PNG, or WebP photo.");
    }
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
