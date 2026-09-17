/** 한글 초성 검색 유틸 — 'ㅈㄹㄱㅈ' → '자료구조' 매칭 */

const CHO =
  'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const CHO_BASE = 0xac00;

export function chosungOf(s: string) {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= CHO_BASE && code <= 0xd7a3) {
      out += CHO[Math.floor((code - CHO_BASE) / 588)];
    } else if (/[ㄱ-ㅎa-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}

export function isChosungQuery(q: string) {
  return /^[ㄱ-ㅎ]+$/.test(q.trim());
}

/** 부분문자열 매칭 + 초성 검색. 공백은 무시한다. */
export function koreanMatch(text: string, q: string) {
  const query = q.trim();
  if (!query) return true;
  if (isChosungQuery(query)) return chosungOf(text).includes(query);
  const t = text.replace(/\s+/g, '').toLowerCase();
  return t.includes(query.replace(/\s+/g, '').toLowerCase());
}
