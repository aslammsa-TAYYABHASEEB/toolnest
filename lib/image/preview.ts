import { createImageObjectUrl } from "@/lib/image/object-url";

export function createImagePreviewUrl(file: File) {
  return createImageObjectUrl(file);
}
