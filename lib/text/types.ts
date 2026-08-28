export type TextStats = {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingTimeMinutes: number;
  speakingTimeMinutes: number;
};

export type KeywordFrequency = {
  word: string;
  count: number;
  percentage: number;
};

export type CaseStyle =
  | "uppercase"
  | "lowercase"
  | "titlecase"
  | "sentencecase"
  | "camelcase"
  | "kebabcase"
  | "snakecase"
  | "constantcase";

export type CleaningOptions = {
  removeDuplicateSpaces: boolean;
  removeEmptyLines: boolean;
  trimLines: boolean;
  normalizeLineEndings: boolean;
};

export const DEFAULT_CLEANING_OPTIONS: CleaningOptions = {
  removeDuplicateSpaces: true,
  removeEmptyLines: true,
  trimLines: true,
  normalizeLineEndings: true,
};

export const MAX_TEXT_INPUT_CHARACTERS = 500_000;
export const MAX_TEXT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
