/**
 * Korean particle agreement.
 *
 * Which particle a word takes depends on whether its last syllable ends in
 * a consonant (받침). Copy that is assembled at runtime — "어휘가 과제입니다"
 * versus "구성이 과제입니다" — has to choose, or it reads as broken Korean
 * to every visitor.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** True when the final syllable of `word` carries a 받침. */
export function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  if (!ch) return false;

  const code = ch.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return false;

  // Composed syllables are laid out as (초성 × 21 + 중성) × 28 + 종성.
  return (code - HANGUL_START) % 28 !== 0;
}

/** `josa('어휘', '이', '가')` → "가". Pass the 받침 form first. */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  return hasBatchim(word) ? withBatchim : withoutBatchim;
}

/** Convenience: appends the right particle to the word. */
export const withJosa = (word: string, withBatchim: string, withoutBatchim: string): string =>
  word + josa(word, withBatchim, withoutBatchim);
