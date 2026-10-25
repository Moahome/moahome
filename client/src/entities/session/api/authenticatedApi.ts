'use client';

import {
  ApiError,
  customAPI,
  type CustomApiOptions
} from '@/shared/api';
import { restoreSession } from '../model/restoreSession';
import { getSession } from '../model/sessionStore';
import type { WebSession } from '../model/sessionStoreTypes';

const forbiddenListeners = new Set<(propertyId: string) => void>();

/** 업무 거부는 호출부에 유지하고 현재 영역의 접근 경계에만 일회성 재확인을 알립니다. */
export function subscribePropertyForbidden(listener: (propertyId: string) => void) {
  forbiddenListeners.add(listener);
  return () => { forbiddenListeners.delete(listener); };
}

/** 메모리의 Bearer로 업무 API를 호출하고, Access 만료 응답에서만 재발급 후 원래 요청을 한 번 재시도합니다. */
export async function authenticatedAPI<T = unknown>(options: CustomApiOptions): Promise<T> {
  if (options.signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELED', '요청 대기가 취소되었습니다.');
  const session = getSession();

  // 초기 세션 복원은 호출자가 수행하며, 토큰 누락을 Access 만료로 간주해 재발급하지 않습니다.
  if (!session) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', '로그인이 필요합니다.');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  const request = {
    ...options,
    headers
  };

  try {
    return await send();
  } catch (error) {
    // 다른 401, 권한 거부, 장애와 네트워크 오류는 원래 실패로 전달하여 재발급을 반복하지 않습니다.
    if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'ACCESS_TOKEN_EXPIRED') {
      throw error;
    }

    if (options.signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELED', '요청 대기가 취소되었습니다.');
    const refreshedSession = await waitForRefresh(restoreSession(session.accessToken), options.signal);
    if (options.signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELED', '요청 대기가 취소되었습니다.');
    headers.set('Authorization', `Bearer ${refreshedSession.accessToken}`);

    // 재시도는 공통 전송 함수를 직접 호출하므로 다시 만료되어도 추가 재발급이나 재시도를 하지 않습니다.
    return send();
  }

  /** 재발급 뒤의 응답도 동일하게 관찰하되 접근 확인 자체의 403은 재조회 루프를 만들지 않습니다. */
  async function send(): Promise<T> {
    try {
      return await customAPI<T>(request);
    } catch (error) {
      const match = /^\/api\/properties\/([0-9a-f-]{36})\/(.+)$/i.exec(options.url.split('?')[0]);
      if (error instanceof ApiError && error.status === 403 && match
        && !['access-context', 'management-context'].includes(match[2])
        && headers.get('Authorization') === `Bearer ${getSession()?.accessToken}`) {
        for (const listener of forbiddenListeners) listener(match[1]);
      }
      throw error;
    }
  }

}

/** 취소된 호출자의 대기만 끝내고 다른 요청이 공유하는 Refresh Rotation은 계속 진행합니다. */
async function waitForRefresh(refresh: Promise<WebSession>, signal?: AbortSignal) {
  if (!signal) return refresh;
  let onAbort = () => {};
  try {
    return await new Promise<WebSession>((resolve, reject) => {
      onAbort = () => reject(new ApiError(0, 'REQUEST_CANCELED', '요청 대기가 취소되었습니다.'));
      signal.addEventListener('abort', onAbort, {
        once: true
      });
      refresh.then(resolve, reject);
      if (signal.aborted) onAbort();
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
