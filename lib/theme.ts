'use client';
export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'hs-theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

/** 저장된 선호를 읽어 <html data-theme>에 반영한다. system이면 OS 값을 따른다. */
export function applyTheme(pref: ThemePref = getThemePref()) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* 저장 불가 환경은 이번 세션만 적용한다 */
  }
  applyTheme(pref);
}
