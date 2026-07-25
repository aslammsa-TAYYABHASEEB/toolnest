export const MAX_JSON_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_JSON_CHARACTERS = 20_000_000;

export function formatJsonBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateJsonFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".json")) {
    return "Choose a file with a .json extension.";
  }
  if (file.size > MAX_JSON_FILE_SIZE) {
    return `JSON files must be ${formatJsonBytes(MAX_JSON_FILE_SIZE)} or smaller.`;
  }
  return null;
}

export async function readJsonFile(file: File) {
  try {
    const content = await file.text();
    if (content.length > MAX_JSON_CHARACTERS) {
      throw new Error("file-content-too-large");
    }
    return content;
  } catch (caught) {
    if (
      caught instanceof Error
      && caught.message === "file-content-too-large"
    ) {
      throw new Error(
        `The decoded JSON is larger than the ${MAX_JSON_CHARACTERS.toLocaleString()} character limit.`,
      );
    }
    throw new Error("ToolNest could not read this JSON file. Try another file.");
  }
}
