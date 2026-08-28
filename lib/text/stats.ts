import type { KeywordFrequency, TextStats } from "@/lib/text/types";

const COMMON_STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's",
  "its", "itself", "let's", "me", "more", "most", "mustn't", "my", "myself",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ours", "ourselves", "out", "over", "own", "same", "shan't", "she",
  "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than",
  "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
  "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't",
  "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's",
  "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom",
  "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll",
  "you're", "you've", "your", "yours", "yourself", "yourselves",
]);

export function calculateTextStats(text: string): TextStats {
  if (!text) {
    return {
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      sentences: 0,
      paragraphs: 0,
      lines: 0,
      readingTimeMinutes: 0,
      speakingTimeMinutes: 0,
    };
  }

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const characters = Array.from(normalized).length;
  const charactersNoSpaces = Array.from(normalized.replace(/\s+/g, "")).length;

  // Words count using regex matching non-whitespace character sequences
  const wordMatches = normalized.trim().match(/[\p{L}\p{N}_\-]+/gu);
  const words = wordMatches ? wordMatches.length : 0;

  // Sentences count
  const sentenceMatches = normalized.trim().split(/[.!?]+(?=\s|$)/).filter((s) => s.trim().length > 0);
  const sentences = sentenceMatches.length;

  // Paragraphs count
  const paragraphMatches = normalized.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const paragraphs = paragraphMatches.length;

  // Lines count
  const lines = normalized.split("\n").length;

  // Average reading speed: 200 wpm, speaking speed: 130 wpm
  const readingTimeMinutes = Math.ceil(words / 200);
  const speakingTimeMinutes = Math.ceil(words / 130);

  return {
    characters,
    charactersNoSpaces,
    words,
    sentences,
    paragraphs,
    lines,
    readingTimeMinutes,
    speakingTimeMinutes,
  };
}

export function extractKeywords(text: string, limit = 8): KeywordFrequency[] {
  if (!text.trim()) return [];

  const wordMatches = text.toLowerCase().match(/[\p{L}\p{N}_\-]+/gu);
  if (!wordMatches) return [];

  const validWords = wordMatches.filter(
    (word) => word.length > 2 && !COMMON_STOP_WORDS.has(word) && !/^\d+$/.test(word),
  );

  const totalValid = validWords.length;
  if (totalValid === 0) return [];

  const counts = new Map<string, number>();
  for (const word of validWords) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, limit).map(([word, count]) => ({
    word,
    count,
    percentage: Math.round((count / totalValid) * 1000) / 10,
  }));
}
