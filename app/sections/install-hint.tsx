'use client';
import { useState, useSyncExternalStore } from 'react';
import { Share, X } from 'lucide-react';

const DISMISS_KEY = 'hs-install-dismissed';
const noop = () => () => {};

function eligible(): boolean {
  try {
    const ua = navigator.userAgent;
    const ios =
      /iP(hone|ad|od)/.test(ua) ||
      (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const standalone =
      (navigator as { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone && !localStorage.getItem(DISMISS_KEY);
  } catch {
    /* UA·저장소 접근 실패 시 안내를 띄우지 않는다 */
    return false;
  }
}

/** iOS Safari에서만 표시 — beforeinstallprompt가 없는 플랫폼이라
 *  수동 "공유 → 홈 화면에 추가" 안내가 필요하다. 설치됐거나 닫으면 다시 안 띄운다.
 *  useSyncExternalStore로 서버 스냅샷(false)과 클라이언트 값을 분리한다. */
export function InstallHint() {
  const show = useSyncExternalStore(noop, eligible, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!show || dismissed) return null;
  return (
    <div className="install-hint" role="note">
      <Share size={17} aria-hidden="true" />
      <span>
        홈 화면에 추가하면 앱처럼 열 수 있어요 — 공유{' '}
        <Share size={12} aria-hidden="true" /> 후 <b>홈 화면에 추가</b>
      </span>
      <button
        className="icon"
        aria-label="설치 안내 닫기"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, '1');
          } catch {}
          setDismissed(true);
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
