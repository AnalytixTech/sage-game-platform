import { DICTIONARY_DATA } from './content/dictionary';

let words: Set<string> | null = null;

/** Decode the front-coded word list on first use (about 115k words). */
function load(): Set<string> {
  if (words) return words;
  const set = new Set<string>();
  let prev = '';
  for (const entry of DICTIONARY_DATA.split('\n')) {
    const word = prev.slice(0, entry.charCodeAt(0) - 48) + entry.slice(1);
    set.add(word);
    prev = word;
  }
  words = set;
  return set;
}

/** True if `word` (lowercase a-z) is an accepted Word Rush word. */
export function isDictionaryWord(word: string): boolean {
  return load().has(word);
}

/** Decode the dictionary ahead of time (e.g. behind a loading screen) to avoid a pause on the first submit. */
export function preloadDictionary(): void {
  load();
}
