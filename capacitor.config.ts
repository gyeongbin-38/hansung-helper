import type { CapacitorConfig } from '@capacitor/cli';

// 네이티브 래퍼 — 앱 콘텐츠는 프로덕션 Worker를 원격 로딩한다.
// 서버 배포가 곧 앱 갱신이라 스토어 재심사 없이 웹 변경이 반영된다.
// webDir은 설치 직후/연결 실패 시 보일 최소 셸(native-web/).
const config: CapacitorConfig = {
  appId: 'dev.gyeongbin38.hansunghelper',
  appName: '학사부기',
  webDir: 'native-web',
  server: {
    url: 'https://hansung-helper.gyeongbin-38.workers.dev',
    // 원격 오리진의 인증 쿠키가 WebView에 그대로 저장된다
    androidScheme: 'https',
  },
};

export default config;
