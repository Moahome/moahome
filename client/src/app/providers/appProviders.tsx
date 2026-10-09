'use client';

import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query';
import {
  useState,
  type ReactNode
} from 'react';
import { useSession } from '@/entities/session';
import { RegistrationDraftLifecycle } from '@/features/property-registration';

/** 공개 화면도 표시하면서 앱 시작 시 세션을 복원합니다. 콜백 화면은 같은 조회 상태를 사용합니다. */
function SessionBootstrap() {
  useSession();

  return null;
}

/** 브라우저 앱 수명 동안 조회 캐시를 유지하며 서버 렌더링 요청 간 사용자 정보를 공유하지 않습니다. */
export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider
      client={queryClient}
    >
      <SessionBootstrap />
      <RegistrationDraftLifecycle />
      {children}
    </QueryClientProvider>
  );
}
