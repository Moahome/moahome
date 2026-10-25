'use client';

import {
  ApiError,
  isRequestCanceled,
  isServerConnectionError
} from '@/shared/api';
import { ServerConnectionError } from './serverConnectionError';
import { StateMessage } from '@/shared/ui/state-message';
import { Button } from '@/shared/ui/button';

/** 네트워크·서버 장애와 권한·대상 없음의 그림을 구분하고 해당 조회만 재시도합니다. */
export function RequestError({ error, onRetry, retrying = false, inputPreserved = false }: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  inputPreserved?: boolean;
}) {
  if (isRequestCanceled(error)) return null;
  if (isServerConnectionError(error)) return (
    <ServerConnectionError
      error={error}
      onRetry={onRetry}
      retrying={retrying}
      inputPreserved={inputPreserved}
    />
  );
  const status = error instanceof ApiError ? error.status : 0;
  let variant: 'forbidden' | 'not-found' | undefined;
  let title = '정보를 불러오지 못했어요';
  let description = '잠시 후 다시 시도해주세요.';
  if (status === 403) {
    variant = 'forbidden';
    title = '접근 권한을 확인해주세요';
    description = '현재 계정으로 이 정보에 접근할 수 없어요. 권한을 확인한 뒤 다시 시도해주세요.';
  }
  if (status === 404) {
    variant = 'not-found';
    title = '요청한 정보를 찾을 수 없어요';
    description = '주소가 올바른지 확인해주세요.';
  }
  return (
    <StateMessage
      variant={variant}
      role={'alert'}
      busy={retrying}
      title={title}
      description={description}
      actions={onRetry && (
        <Button
          size={'lg'}
          loading={retrying}
          onClick={onRetry}
        >
          다시 시도
        </Button>
      )}
    />
  );
}
