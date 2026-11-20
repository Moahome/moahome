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
import { usePathname } from 'next/navigation';
import {
  useSession,
  clearSession,
  getCurrentUser,
  getSession,
  CURRENT_USER_QUERY_KEY,
  subscribeAccountWithdrawal,
  subscribeSessionInvalidation,
  type CurrentUser
} from '@/entities/session';
import { RegistrationDraftLifecycle } from '@/features/property-registration';
import { AppInstallProvider } from '@/features/app-install';
import { trackNavigationHistory } from '@/shared/lib/navigation-history';

/** 공개 화면도 표시하면서 앱 시작 시 세션을 복원합니다. 콜백 화면은 같은 조회 상태를 사용합니다. */
function SessionBootstrap() {
  const session = useSession();
  const cache = useQueryClient();
  useEffect(() => subscribeSessionInvalidation(() => {
    // 최초 로그인 검증의 실패는 콜백 화면이 안내합니다. 확인된 로그인 화면만 강제 종료합니다.
    if (!cache.getQueryData<CurrentUser>(CURRENT_USER_QUERY_KEY)) return;
    cache.clear();
    window.location.replace('/login');
  }), [cache]);

  useEffect(() => {
    if (!session.data?.id) return;
    let pending: AbortController | null = null;

    /** 다른 기기의 탈퇴도 확인하며, 기존 화면의 조회·편집 상태를 바꾸지 않고 인증만 재검증합니다. */
    async function revalidate() {
      if (pending || !getSession() || document.visibilityState === 'hidden'
        || window.location.pathname === '/account/recovery') return;
      const controller = new AbortController();
      pending = controller;
      try {
        await getCurrentUser(controller.signal);
      } catch {
        // 인증 거부는 공통 API가 전역에 알립니다. 일시 장애·취소는 로그인과 편집 내용을 유지합니다.
      } finally {
        if (pending === controller) pending = null;
      }
    }

    // 숨겨진 기기는 복귀 시 확인하고, 켜둔 화면도 사용자 조작 없이 전체 로그아웃을 반영합니다.
    const timer = window.setInterval(() => { void revalidate(); }, 15_000);
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('online', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      pending?.abort();
    };
  }, [session.data?.id]);

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
  const pathname = usePathname();
  const residentNotice = pathname === '/notices' || pathname.startsWith('/notices/');
  useEffect(() => trackNavigationHistory(), []);

  return (
    <QueryClientProvider
      client={queryClient}
    >
      {!residentNotice && <SessionBootstrap />}
      {!residentNotice && <RegistrationDraftLifecycle />}
      <AppInstallProvider>
        {children}
      </AppInstallProvider>
    </QueryClientProvider>
  );
}
