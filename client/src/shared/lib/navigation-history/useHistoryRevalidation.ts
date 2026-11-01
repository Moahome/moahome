'use client';

import {
  useEffect,
  useRef
} from 'react';

/** 문서 캐시에 남은 인증 화면을 숨기고 복원 시 새 문서에서 현재 세션을 다시 확인합니다. */
export function useHistoryRevalidation<T extends HTMLElement>() {
  const pageRef = useRef<T>(null);

  useEffect(() => {
    function hideLeavingPage() {
      if (!pageRef.current) return;
      // 화면의 grid/flex 스타일이 HTML hidden 표시를 덮어쓰지 않게 직접 숨깁니다.
      pageRef.current.style.display = 'none';
      pageRef.current.inert = true;
    }

    function revalidateRestoredPage(event: PageTransitionEvent) {
      // BFCache는 React 메모리도 복원하므로 과거의 비로그인 조회 결과를 그대로 사용하지 않습니다.
      if (event.persisted) window.location.reload();
    }

    window.addEventListener('pagehide', hideLeavingPage);
    window.addEventListener('pageshow', revalidateRestoredPage);
    return () => {
      window.removeEventListener('pagehide', hideLeavingPage);
      window.removeEventListener('pageshow', revalidateRestoredPage);
    };
  }, []);

  return pageRef;
}
