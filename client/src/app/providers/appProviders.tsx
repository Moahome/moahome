'use client';

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient
} from '@tanstack/react-query';
import {
  useEffect,
  useState,
  type ReactNode
} from 'react';
import {
  useSession,
  clearSession,
  CURRENT_USER_QUERY_KEY,
  subscribeAccountWithdrawal,
  type CurrentUser
} from '@/entities/session';
import { RegistrationDraftLifecycle } from '@/features/property-registration';
import { AppInstallProvider } from '@/features/app-install';
import { trackNavigationHistory } from '@/shared/lib/navigation-history';

/** 공개 화면도 표시하면서 앱 시작 시 세션을 복원합니다. 콜백 화면은 같은 조회 상태를 사용합니다. */
function SessionBootstrap() {
  useSession();
  const cache = useQueryClient();
  useEffect(() => subscribeAccountWithdrawal((userId) => {
    const current = cache.getQueryData<CurrentUser>(CURRENT_USER_QUERY_KEY);
    if (current && current.id !== userId) return;
    clearSession();
    cache.clear();
    window.location.replace('/login?withdrawal=requested');
  }), [cache]);

  return null;
}

/** 브라우저 앱 수명 동안 조회 캐시를 유지하며 서버 렌더링 요청 간 사용자 정보를 공유하지 않습니다. */
export function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => trackNavigationHistory(), []);

  return (
    <QueryClientProvider
      client={queryClient}
    >
      <SessionBootstrap />
      <RegistrationDraftLifecycle />
      <AppInstallProvider>
        {children}
      </AppInstallProvider>
    </QueryClientProvider>
  );
}
