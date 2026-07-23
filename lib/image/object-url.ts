export function createImageObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

export function revokeImageObjectUrl(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}
