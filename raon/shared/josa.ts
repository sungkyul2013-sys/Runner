// 받침 유무에 따라 조사를 고른다. josa('이름', '을/를') → '이름을'
export function josa(word: string, pair: '을/를' | '이/가' | '은/는' | '와/과' | '으로/로'): string {
  const last = word.charCodeAt(word.length - 1);
  const [withBatchim, without] = pair.split('/');
  if (last < 0xac00 || last > 0xd7a3) return word + without;
  const jong = (last - 0xac00) % 28;
  if (pair === '으로/로' && jong === 8) return word + without; // ㄹ 받침은 '로'
  return word + (jong ? withBatchim : without);
}

export function hasBatchim(word: string): boolean {
  const last = word.charCodeAt(word.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
}

/** 성을 뗀 이름 (세 글자 이름 기준) */
export function givenName(name: string): string {
  return name.length === 3 ? name.slice(1) : name;
}

/** 부르는 이름: 태윤 → 태윤이, 지우 → 지우 */
export function nickname(name: string): string {
  const g = givenName(name);
  return hasBatchim(g) ? g + '이' : g;
}

/** 부를 때: 태윤 → 태윤아, 지우 → 지우야 */
export function vocative(name: string): string {
  const g = givenName(name);
  return g + (hasBatchim(g) ? '아' : '야');
}
