'use client';

import { usePathname } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { BrandMark } from '@/shared/ui/brand-mark';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { AppInstallContext } from '../../model/appInstallContext';
import type { BeforeInstallPromptEvent } from '../../model/appInstallTypes';
import { ExternalBrowserGuide } from '../_components/external-browser-guide/externalBrowserGuide';
import styles from './appInstallProvider.module.css';

const DISMISSED_UNTIL_KEY = 'moahome-app-install-dismissed-until';
const DISMISS_DURATION_MS = 60 * 60 * 1000;

/** 화면 전환 전에 설치 이벤트를 보관하고 모바일 배너와 설정의 설치 동작을 공유합니다. */
export function AppInstallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const busyRef = useRef(false);
  const dismissedUntilRef = useRef(0);
  const syncDismissalRef = useRef<(() => void) | null>(null);
  const [environment, setEnvironment] = useState({
    ready: false,
    mobile: false,
    ios: false,
    android: false,
    kakao: false,
    installUrl: '',
    standalone: false,
  });
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const available = environment.ready && environment.mobile;
  const isInstalled = installed || environment.standalone;
  const showBanner = available && !isInstalled && !dismissed && (pathname === '/' || pathname === '/login');
  // 카카오톡의 공개 링크에서는 선택 안내만 먼저 표시하며 외부 앱 실행은 사용자 클릭에 맡깁니다.
  const showGuide = available && !isInstalled && (guideOpen || (showBanner && environment.kakao));

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    let dismissalTimer: ReturnType<typeof setTimeout> | undefined;

    /** 한 시간 숨김은 탭 간에 공유하고 열린 화면도 만료 시점에 다시 표시합니다. 저장소 차단 시에는 메모리를 사용합니다. */
    function syncDismissal() {
      try {
        const storedUntil = Number(localStorage.getItem(DISMISSED_UNTIL_KEY));
        if (Number.isFinite(storedUntil)) dismissedUntilRef.current = Math.max(storedUntil, dismissedUntilRef.current);
      } catch {
        // 비공개 모드 등으로 저장소를 사용할 수 없어도 현재 창에서는 한 시간 숨김을 유지합니다.
      }
      const remaining = dismissedUntilRef.current - Date.now();
      setDismissed(remaining > 0);
      clearTimeout(dismissalTimer);
      if (remaining > 0) dismissalTimer = setTimeout(syncDismissal, remaining);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === DISMISSED_UNTIL_KEY || event.key === null) syncDismissal();
    }

    syncDismissalRef.current = syncDismissal;

    /** 화면 크기와 실제 실행 모드를 확인하며 iPad의 데스크톱 UA도 iOS 안내로 처리합니다. */
    function syncEnvironment() {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      setEnvironment({
        ready: true,
        mobile: mobileQuery.matches,
        ios,
        android: /Android/i.test(navigator.userAgent),
        kakao: /KAKAOTALK/i.test(navigator.userAgent),
        // 설치 진입점만 전달해 인증 콜백·초대 링크의 쿼리와 해시를 외부 앱에 복사하지 않습니다.
        installUrl: new URL('/start', window.location.origin).href,
        standalone: standaloneQuery.matches || ('standalone' in navigator && navigator.standalone === true),
      });
      syncDismissal();
    }

    /** 브라우저가 제공한 일회용 이벤트만 저장하고 설치 창은 사용자가 누를 때 엽니다. */
    function capturePrompt(event: Event) {
      if (!mobileQuery.matches) return;
      if (!('prompt' in event) || typeof event.prompt !== 'function' || !('userChoice' in event)) return;
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
    }

    function handleInstalled() {
      promptRef.current = null;
      setInstalled(true);
      setGuideOpen(false);
    }

    const frame = window.requestAnimationFrame(syncEnvironment);
    mobileQuery.addEventListener('change', syncEnvironment);
    standaloneQuery.addEventListener('change', syncEnvironment);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', syncDismissal);
    document.addEventListener('visibilitychange', syncDismissal);

    return () => {
      window.cancelAnimationFrame(frame);
      mobileQuery.removeEventListener('change', syncEnvironment);
      standaloneQuery.removeEventListener('change', syncEnvironment);
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', syncDismissal);
      document.removeEventListener('visibilitychange', syncDismissal);
      clearTimeout(dismissalTimer);
      syncDismissalRef.current = null;
    };
  }, []);

  /** 배너를 한 시간 숨기되 설정의 설치 진입점은 유지하고 같은 브라우저의 다른 탭에도 반영합니다. */
  function dismissBanner() {
    dismissedUntilRef.current = Date.now() + DISMISS_DURATION_MS;
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(dismissedUntilRef.current));
    } catch {
      // 저장소 접근 실패 시에도 메모리 상태로 배너를 닫습니다.
    }
    syncDismissalRef.current?.();
  }

  /** 카카오톡에는 외부 브라우저 선택을 안내하고, 일반 브라우저의 설치 이벤트는 한 번만 소비합니다. */
  async function install() {
    if (!available || isInstalled || busyRef.current) return;
    setFailed(false);
    const event = promptRef.current;
    if (environment.kakao || !event) {
      setGuideOpen(true);
      return;
    }

    promptRef.current = null;
    busyRef.current = true;
    setBusy(true);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      setFailed(true);
      setGuideOpen(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** 카카오톡에서 먼저 열린 안내를 닫으면 배너와 함께 한 시간 숨깁니다. 설정에서는 다시 열 수 있습니다. */
  function closeGuide() {
    setGuideOpen(false);
    if (environment.kakao) dismissBanner();
  }

  let guideTitle = '모아홈 앱 설치';
  if (environment.ios) guideTitle = '홈 화면에 추가';
  if (environment.kakao) guideTitle = '외부 브라우저에서 설치';

  return (
    <AppInstallContext.Provider
      value={{
        available,
        installed: isInstalled,
        busy,
        install,
      }}
    >
      {children}
      {showBanner && (
        <aside
          className={styles.banner}
          data-landing={pathname === '/' || undefined}
          aria-label={'모아홈 앱 설치 안내'}
        >
          <div
            className={styles.brand}
            aria-hidden
          >
            <BrandMark />
          </div>
          <div
            className={styles.copy}
          >
            <p
              className={styles.title}
            >
              모아홈 앱으로 설치하기
            </p>
            <p>
              이 사이트를 앱처럼 설치하고 더 편리하게 이용하세요.
            </p>
          </div>
          <Button
            className={styles.install}
            size={'sm'}
            loading={busy}
            onClick={() => void install()}
            leadingIcon={(
              <ServiceIcon
                name={'download'}
                size={16}
              />
            )}
          >
            설치하기
          </Button>
          <Button
            className={styles.close}
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'앱 설치 안내 닫기'}
            onClick={dismissBanner}
          >
            <ServiceIcon
              name={'close'}
              size={16}
            />
          </Button>
        </aside>
      )}
      {showGuide && (
        <ClientModal
          className={styles.guide}
          aria-labelledby={'app-install-title'}
          aria-describedby={'app-install-description'}
          onClose={closeGuide}
          closeOnOutsideClick
        >
          <header
            className={styles['guide-header']}
          >
            <h2
              id={'app-install-title'}
            >
              {guideTitle}
            </h2>
            <Button
              variant={'ghost'}
              size={'sm'}
              iconOnly
              aria-label={'설치 방법 닫기'}
              onClick={closeGuide}
            >
              <ServiceIcon
                name={'close'}
              />
            </Button>
          </header>
          {environment.kakao ? (
            <ExternalBrowserGuide
              android={environment.android}
              ios={environment.ios}
              installUrl={environment.installUrl}
            />
          ) : (
            <>
              {failed && (
                <p
                  role={'status'}
                >
                  설치 창을 열지 못했어요. 브라우저 메뉴에서 설치해 주세요.
                </p>
              )}
              <p
                id={'app-install-description'}
              >
                홈 화면에 모아홈을 추가하면 앱처럼 바로 열 수 있어요.
              </p>
              {environment.ios ? (
                <ol>
                  <li>
                    브라우저의 공유 버튼을 누르세요.
                  </li>
                  <li>
                    홈 화면에 추가를 선택하세요.
                  </li>
                  <li>
                    추가를 눌러 완료하세요.
                  </li>
                </ol>
              ) : (
                <ol>
                  <li>
                    Chrome 또는 삼성 인터넷에서 모아홈을 여세요.
                  </li>
                  <li>
                    브라우저 메뉴에서 앱 설치 또는 홈 화면에 추가를 선택하세요.
                  </li>
                  <li>
                    설치 또는 추가를 눌러 완료하세요.
                  </li>
                </ol>
              )}
              <p
                className={styles.note}
              >
                {environment.ios
                  ? '메뉴가 보이지 않으면 Safari에서 열어 주세요.'
                  : '설치 메뉴가 보이지 않으면 최신 브라우저에서 다시 확인해 주세요.'}
                {' '}
                카카오톡 안에서 열었다면 외부 브라우저에서 열어 주세요.
              </p>
            </>
          )}
        </ClientModal>
      )}
    </AppInstallContext.Provider>
  );
}
