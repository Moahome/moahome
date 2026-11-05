import { ApiError } from './customApi';

/** 통신 실패·서버 장애·잘못된 서버 응답을 공통 그림으로 안내하고 권한·입력 오류와 구분합니다. */
export function isServerConnectionError(error: unknown): boolean {
  return error instanceof ApiError
    && (error.code === 'NETWORK_ERROR' || error.code === 'REQUEST_TIMEOUT' || error.code === 'INVALID_RESPONSE'
      || (error.status >= 500 && error.status <= 599));
}
