'use client';

import {
  ApiError,
  isServerConnectionError
} from '@/shared/api';
import { ServerConnectionError } from './serverConnectionError';

/** 조회 실패는 공통 이미지로 표시하고 권한·대상 없음과 서버 장애의 안내만 구분합니다. */
export function RequestError({ error, onRetry, retrying = false, inputPreserved = false }: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  inputPreserved?: boolean;
}) {
  if (isServerConnectionError(error)) return (
    <ServerConnectionError
      onRetry={onRetry}
      retrying={retrying}
      inputPreserved={inputPreserved}
    />
  );
  const denied = error instanceof ApiError && error.status === 403;
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <ServerConnectionError
      title={denied ? '접근 권한을 확인해주세요' : missing ? '요청한 정보를 찾을 수 없어요' : '정보를 불러오지 못했어요'}
      description={denied ? '현재 계정으로 이 정보에 접근할 수 없어요. 권한을 확인한 뒤 다시 시도해주세요.' : missing ? '주소가 올바른지 확인해주세요.' : '잠시 후 다시 시도해주세요.'}
      onRetry={onRetry}
      retrying={retrying}
    />
  );
}
