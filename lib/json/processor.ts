import type {
  JsonOperation,
  JsonParseError,
  JsonProcessResponse,
} from "@/lib/json/types";

function getRootType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function getLineAndColumn(input: string, position: number) {
  const beforeError = input.slice(0, position);
  const lines = beforeError.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function parseErrorDetails(input: string, caught: unknown): JsonParseError {
  const rawMessage = caught instanceof Error
    ? caught.message
    : "The JSON could not be parsed.";
  const positionMatch = rawMessage.match(/position\s+(\d+)/i);
  const lineColumnMatch = rawMessage.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  const position = positionMatch ? Number(positionMatch[1]) : null;
  const derived = position === null ? null : getLineAndColumn(input, position);
  const line = lineColumnMatch ? Number(lineColumnMatch[1]) : derived?.line ?? null;
  const column = lineColumnMatch
    ? Number(lineColumnMatch[2])
    : derived?.column ?? null;

  return {
    message: rawMessage.replace(/^JSON\.parse:\s*/i, ""),
    position,
    line,
    column,
  };
}

export function processJson(
  id: number,
  input: string,
  operation: JsonOperation,
): JsonProcessResponse {
  const normalizedInput = input.charCodeAt(0) === 0xfeff
    ? input.slice(1)
    : input;

  if (!normalizedInput.trim()) {
    return {
      id,
      ok: false,
      operation,
      error: {
        message: "Enter or upload JSON before running this action.",
        position: null,
        line: null,
        column: null,
      },
    };
  }

  try {
    const parsed: unknown = JSON.parse(normalizedInput);
    const output = operation === "minify"
      ? JSON.stringify(parsed)
      : JSON.stringify(parsed, null, 2);
    return {
      id,
      ok: true,
      operation,
      output,
      rootType: getRootType(parsed),
    };
  } catch (caught) {
    return {
      id,
      ok: false,
      operation,
      error: parseErrorDetails(normalizedInput, caught),
    };
  }
}
