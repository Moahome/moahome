'use client';

import type { WebSession } from './sessionStoreTypes';

// 토큰은 브라우저 메모리에만 보관합니다. 서버 렌더링이나 영속 저장소에서 공유하지 않습니다.
let session: WebSession | null = null;
const invalidationListeners = new Set<() => void>();

export function getSession(): WebSession | null {
  return typeof window === 'undefined' ? null : session;
}

/** 브라우저의 현재 로그인 세션을 저장하고 서버의 요청 간 토큰 공유를 차단합니다. */
export function setSession(nextSession: WebSession) {
  if (typeof window === 'undefined') {
    throw new Error('로그인 세션은 브라우저에서만 저장할 수 있습니다.');
  }

  session = nextSession;
}

export function clearSession() {
  session = null;
}

/** 이전 요청의 늦은 인증 오류가 새 로그인이나 갱신된 토큰을 종료하지 않도록 현재 토큰만 무효화합니다. */
export function invalidateSession(accessToken: string) {
  if (getSession()?.accessToken !== accessToken) return;
  clearSession();
  for (const listener of invalidationListeners) listener();
}

/** 서버에서 세션 종료를 확인하면 전역 화면과 계정 캐시도 함께 정리하도록 알립니다. */
export function subscribeSessionInvalidation(listener: () => void) {
  invalidationListeners.add(listener);
  return () => { invalidationListeners.delete(listener); };
}
