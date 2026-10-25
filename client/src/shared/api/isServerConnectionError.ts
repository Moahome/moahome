import { ApiError } from './customApi';

/** 통신 실패·서버 장애만 연결 안내로 표시하고 인증·권한·입력 오류의 기존 복구 흐름은 유지합니다. */
export function isServerConnectionError(error: unknown): boolean {
  return error instanceof ApiError
    && (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT' || (error.status >= 500 && error.status <= 599));
}
