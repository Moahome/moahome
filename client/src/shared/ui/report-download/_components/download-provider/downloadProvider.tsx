'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  usePathname,
  useRouter
} from 'next/navigation';
import { StateMessage } from '@/shared/ui/state-message';

interface DownloadEntry {
  pageHref: string;
  focusTarget?: HTMLElement | null;
  render: (presentation: 'modal' | 'page', onClose: () => void) => ReactNode;
}

interface OpenDownload extends DownloadEntry {
  origin: string;
  presentation: 'modal' | 'page';
}

interface DownloadContextValue {
  entry: OpenDownload | null;
  openDownload: (entry: DownloadEntry) => void;
  close: () => void;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

/** 현재 계정·관리대상에서 연 다운로드만 메모리에 보관하고 URL·저장소에는 보고서 자료를 쓰지 않습니다. */
export function ReportDownloadProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [entry, setEntry] = useState<OpenDownload | null>(null);
  const enteredPage = useRef(false);

  useEffect(() => {
    if (!entry) return;
    if (pathname === entry.pageHref.split('?')[0]) {
      enteredPage.current = true;
      return;
    }
    // 뒤로가기·메뉴 이동 후 앞으로 가기에서 과거 선택 자료를 다시 노출하지 않습니다.
    if (enteredPage.current || pathname !== entry.origin) {
      enteredPage.current = false;
      setEntry(null);
    }
  }, [pathname, entry]);

  /** 열기 시점의 화면 자료는 유지하고 작은 화면에서만 독립 주소로 이동합니다. */
  function openDownload(next: DownloadEntry) {
    const presentation = window.matchMedia('(max-width: 767px)').matches ? 'page' : 'modal';
    enteredPage.current = false;
    setEntry({
      ...next,
      focusTarget: next.focusTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      origin: pathname,
      presentation
    });
    if (presentation === 'page') router.push(next.pageHref);
  }

  /** 비동기 준비 중 포커스를 잃은 다운로드 버튼도 모달이 닫힌 뒤 다시 찾을 수 있게 합니다. */
  function close() {
    const target = entry?.focusTarget;
    setEntry(null);
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({
        preventScroll: true
      });
    });
  }

  return (
    <DownloadContext.Provider
      value={{
        entry,
        openDownload,
        close
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

/** 업무 화면은 자료를 고정한 뒤 렌더 함수만 전달하며 PC·모바일 표시 판단을 반복하지 않습니다. */
export function useReportDownload() {
  const context = useContext(DownloadContext);
  if (!context) throw new Error('ReportDownloadProvider가 필요합니다.');
  return context;
}

/** 권한을 확인한 관리 레이아웃 안에서만 모달을 그려 접근 차단 중 자료가 노출되지 않게 합니다. */
export function ReportDownloadModal() {
  const { entry, close } = useReportDownload();
  return entry?.presentation === 'modal' ? entry.render('modal', close) : null;
}

/** 새로고침·직접 접근 때 자료를 임의로 다시 선택하거나 전체 출력으로 바꾸지 않습니다. */
export function ReportDownloadOutlet() {
  const pathname = usePathname();
  const { entry, close } = useReportDownload();
  if (!entry || entry.presentation !== 'page' || entry.pageHref.split('?')[0] !== pathname) return (
    <StateMessage
      variant={'review-required'}
      title={'다운로드할 자료를 다시 선택해주세요'}
      description={'이전 화면에서 다운로드를 다시 선택해주세요.'}
    />
  );
  return entry.render('page', close);
}
