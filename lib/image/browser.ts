export function openImageFilePicker(
  input: HTMLInputElement | null,
  deferred = false,
) {
  if (!input) return;
  if (deferred) {
    window.setTimeout(() => input.click(), 0);
    return;
  }
  input.click();
}
