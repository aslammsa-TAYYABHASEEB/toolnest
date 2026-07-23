export type ImageDownloadAction = {
  url: string;
  filename: string;
  label: string;
  variant: "button" | "link";
};

export function createImageDownloadAction(
  url: string,
  filename: string,
  label: string,
  variant: ImageDownloadAction["variant"] = "button",
): ImageDownloadAction {
  return { url, filename, label, variant };
}

export function triggerImageDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}
