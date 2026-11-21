/*
 * Text search in the browser: case and accents ignored ("chaine" finds "Chaîne"). Pure.
 */

/** Lower case, without accents. */
export function foldText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** The words of a search, folded; empty when nothing is typed. */
export function searchWords(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** `word` starts a word of `text` (both folded): "lac" is in "tour du lac", not "remplacement". */
function startsAWord(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
    if (at === 0 || !WORD_CHARACTER.test(text[at - 1])) return true;
  }
  return false;
}

/**
 * Every word of the search starts a word of the text, in any order (D-112): "chaine grizl" finds
 * "Remplacement de la chaîne · Gravel - Grizl", "pneu" finds "pneus", "link" finds "Quick-Link".
 */
export function matchesWords(text: string, words: readonly string[]): boolean {
  if (!words.length) return true;
  const folded = foldText(text);
  return words.every((word) => startsAWord(folded, word));
}
