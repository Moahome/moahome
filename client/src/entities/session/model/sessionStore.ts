'use client';

export interface WebSession {
  accessToken: string;
  tokenType: 'Bearer';
  accessExpiresAt: string;
  csrfToken: string;
}

// 토큰은 브라우저 메모리에만 보관합니다. 서버 렌더링이나 영속 저장소에서 공유하지 않습니다.
let session: WebSession | null = null;

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
