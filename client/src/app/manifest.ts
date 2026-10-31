import type { MetadataRoute } from 'next';

/** 설치한 앱은 기존 서비스 진입점에서 세션과 현재 권한을 확인합니다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '모아홈',
    short_name: '모아홈',
    description: '우리 집 관리비 조회와 공동주택 관리를 하나로 연결하는 모아홈',
    lang: 'ko',
    start_url: '/start',
    scope: '/',
    display: 'standalone',
    // Manifest는 CSS 변수를 지원하지 않으므로 globals.css의 공통 토큰 값을 사용합니다.
    background_color: '#F8FAFC',
    theme_color: '#2563EB',
    icons: [
      {
        src: '/icons/icon192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskableIcon512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
