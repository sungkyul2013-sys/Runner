// 받침 유무에 따라 조사를 고른다. josa('이름', '을/를') → '이름을'
export function josa(word: string, pair: '을/를' | '이/가' | '은/는' | '와/과' | '으로/로'): string {
  const last = word.charCodeAt(word.length - 1);
  const [withBatchim, without] = pair.split('/');
  if (last < 0xac00 || last > 0xd7a3) return word + without;
  const jong = (last - 0xac00) % 28;
  if (pair === '으로/로' && jong === 8) return word + without; // ㄹ 받침은 '로'
  return word + (jong ? withBatchim : without);
}
