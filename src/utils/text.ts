// Strip gap-fill markers like (gjøre) → gjøre
export function normalizeForSpeech(text: string): string {
  return text
    .replace(/\(([^)]+)\)/g, '$1') // (word) → word
    .replace(/\[([^\]]+)\]/g, '$1') // [word] → word
    .replace(/\s+/g, ' ')
    .trim();
}