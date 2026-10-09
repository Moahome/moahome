'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { CurrentUser } from '@/entities/session';
import { LogoutButton } from '@/features/logout';
import { HeaderAvatar } from '../header-avatar/headerAvatar';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './headerMobileMenu.module.css';

/** 모바일 계정 메뉴를 모달로 열고 화면 크기 변경과 닫기 시 배경 스크롤을 복구합니다. */
export function HeaderMobileMenu({
  user,
  homeHref,
  homeLabel,
  content,
}: {
  user: Pick<CurrentUser, 'displayName' | 'profileImageUrl'>;
  homeHref: string;
  homeLabel: string;
  content?: (onNavigate: () => void) => ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const animationsRef = useRef<Animation[]>([]);
  const isClosingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const isManagement = Boolean(content);
  const historyId = useId();
  const ownsHistoryRef = useRef(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia(isManagement ? '(max-width: 767px)' : '(max-width: 640px)');

    function closeOnDesktop() {
      if (!mobileQuery.matches) {
        dialogRef.current?.close();
      }
    }

    /** 메뉴에서 뒤로가기를 누르면 현재 페이지를 유지하고 메뉴만 닫습니다. */
    function closeOnBack() {
      if (!ownsHistoryRef.current || window.history.state?.moahomeMenu === historyId) return;
      ownsHistoryRef.current = false;
      dialogRef.current?.dispatchEvent(new Event('cancel', {
        cancelable: true
      }));
    }

    mobileQuery.addEventListener('change', closeOnDesktop);
    window.addEventListener('popstate', closeOnBack);
    return () => {
      mobileQuery.removeEventListener('change', closeOnDesktop);
      window.removeEventListener('popstate', closeOnBack);
      animationsRef.current.forEach((animation) => animation.cancel());
      // 페이지 이동 중 언마운트에서는 이력을 이동시키지 않고 메뉴 표시만 제거합니다.
      if (ownsHistoryRef.current && window.history.state?.moahomeMenu === historyId) {
        const { moahomeMenu: _menu, ...state } = window.history.state;
        window.history.replaceState(state, '');
      }
    };
  }, [isManagement, historyId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  /** 화면 오른쪽 밖에서 진입하며, 도중에 닫으면 현재 위치에서 이어서 퇴장합니다. */
  function animateMenu(isEntering: boolean) {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    if (!panel || !backdrop) {
      return null;
    }

    // 취소 전에 현재 위치를 읽어 열림 도중 닫아도 패널과 배경이 갑자기 튀지 않게 합니다.
    const startTransform = isEntering ? 'translateX(100%)' : getComputedStyle(panel).transform;
    const startOpacity = isEntering ? '0' : getComputedStyle(backdrop).opacity;
    animationsRef.current.forEach((animation) => animation.cancel());
    const options: KeyframeAnimationOptions = {
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : (isEntering ? 320 : 220),
      easing: isEntering ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'both',
    };
    const panelAnimation = panel.animate([
      {
        transform: startTransform
      },
      {
        transform: isEntering ? 'translateX(0)' : 'translateX(100%)'
      },
    ], options);
    const backdropAnimation = backdrop.animate([
      {
        opacity: startOpacity
      },
      {
        opacity: isEntering ? '1' : '0'
      },
    ], options);
    animationsRef.current = [panelAnimation, backdropAnimation];

    return panelAnimation;
  }

  /** 모달을 표시한 프레임 안에서 이동을 시작하고 포커스 이동으로 인한 스크롤을 막습니다. */
  function openMenu() {
    if (dialogRef.current?.open) return;
    dialogRef.current?.showModal();
    if (isManagement) {
      window.history.pushState({
        ...window.history.state,
        moahomeMenu: historyId
      }, '');
      ownsHistoryRef.current = true;
    }
    setIsOpen(true);
    animateMenu(true);
    closeButtonRef.current?.focus({
      preventScroll: true
    });
  }

  /** 퇴장 모션이 끝날 때까지 모달과 스크롤 잠금을 유지합니다. */
  function closeMenu() {
    if (isClosingRef.current || !dialogRef.current?.open) {
      return;
    }

    isClosingRef.current = true;
    const animation = animateMenu(false);

    if (!animation) {
      dialogRef.current.close();
      return;
    }

    void animation.finished.then(() => dialogRef.current?.close()).catch(() => {
      // 데스크톱 전환이나 컴포넌트 해제로 취소되면 해당 경로가 닫기와 스크롤 복구를 처리합니다.
    });
  }

  /** Escape와 화면 전환을 포함한 모든 닫기 경로에서 모션과 열린 상태를 정리합니다. */
  function finishClose() {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current = [];
    isClosingRef.current = false;
    setIsOpen(false);
    if (ownsHistoryRef.current && window.history.state?.moahomeMenu === historyId) {
      ownsHistoryRef.current = false;
      window.history.back();
    }
  }

  /** 메뉴에서 선택한 페이지는 메뉴의 임시 이력을 대체하므로 닫기에서 다시 뒤로가지 않습니다. */
  function closeForNavigation() {
    if (ownsHistoryRef.current && window.history.state?.moahomeMenu === historyId) {
      const { moahomeMenu: _menu, ...state } = window.history.state;
      window.history.replaceState(state, '');
      ownsHistoryRef.current = false;
    }
    closeMenu();
  }

  return (
    <>
      <button
        type={'button'}
        className={styles['menu-trigger']}
        data-management={isManagement || undefined}
        aria-label={`${user.displayName}님 메뉴 열기`}
        aria-expanded={isOpen}
        aria-controls={'start-mobile-menu'}
        aria-haspopup={'dialog'}
        onClick={openMenu}
      >
        <HeaderAvatar
          user={user}
        />
      </button>
      <dialog
        ref={dialogRef}
        id={'start-mobile-menu'}
        className={styles.dialog}
        aria-labelledby={'start-mobile-menu-title'}
        onClose={finishClose}
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
      >
        <button
          ref={backdropRef}
          type={'button'}
          className={styles.backdrop}
          tabIndex={-1}
          aria-label={'메뉴 바깥 영역을 눌러 닫기'}
          onClick={closeMenu}
        />
        <div
          ref={panelRef}
          className={styles.panel}
          data-management={isManagement || undefined}
        >
          <div
            className={styles.heading}
          >
            <h2
              id={'start-mobile-menu-title'}
            >
              메뉴
            </h2>
            <button
              ref={closeButtonRef}
              type={'button'}
              className={styles['close-button']}
              aria-label={'메뉴 닫기'}
              onClick={closeMenu}
            >
              <ServiceIcon
                name={'close'}
              />
            </button>
          </div>
          <div
            className={styles.account}
          >
            <HeaderAvatar
              user={user}
            />
            <div>
              <strong>
                {user.displayName}
                님
              </strong>
              {!isManagement && (
                <p>
                  모아홈에 오신 것을 환영해요.
                </p>
              )}
            </div>
          </div>
          {content ? (
            isOpen && (
              <div
                className={styles['management-content']}
              >
                <MobileMenuContent
                  renderContent={content}
                  onNavigate={closeForNavigation}
                />
              </div>
            )
          ) : (
            <nav
              className={styles.navigation}
              aria-label={'모바일 주요 메뉴'}
            >
              <Link
                href={homeHref}
                onClick={closeMenu}
              >
                {homeLabel}
                <ServiceIcon
                  name={'chevron'}
                />
              </Link>
            </nav>
          )}
          <div
            className={styles.footer}
          >
            <LogoutButton
              variant={'menu'}
            />
          </div>
        </div>
      </dialog>
    </>
  );
}

/** 메뉴 콘텐츠에는 이동 이벤트만 전달하고 드로어의 참조·애니메이션 상태는 노출하지 않습니다. */
function MobileMenuContent({ renderContent, onNavigate }: {
  renderContent: (onNavigate: () => void) => ReactNode;
  onNavigate: () => void;
}) {
  return renderContent(onNavigate);
}
