'use client';

import Link from 'next/link';
import {
  useRef,
  type ReactNode
} from 'react';
import { useSession } from '@/entities/session';
import type { CurrentUser } from '@/entities/session';
import { LogoutButton } from '@/features/logout';
import { BrandMark } from '@/shared/ui/brand-mark';
import { NoticeDialog } from '@/shared/ui/notice-dialog';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { HeaderAvatar } from './_components/header-avatar/headerAvatar';
import { HeaderMobileMenu } from './_components/header-mobile-menu/headerMobileMenu';
import styles from './serviceHeader.module.css';

export function ServiceHeader({
  user,
  onNotify,
  homeHref = '/start',
  homeLabel = '시작 화면',
  mobileContent,
  mobileBack,
}: {
  user?: Pick<CurrentUser, 'displayName' | 'profileImageUrl'>;
  onNotify?: () => void;
  homeHref?: string;
  homeLabel?: string;
  mobileContent?: (onNavigate: () => void) => ReactNode;
  mobileBack?: {
    href: string;
    label: string;
    title: string;
  };
}) {
  // 관리 레이아웃은 권한 확인 후 이 위젯을 표시하며, 세션 조회 결과는 시작 화면과 공유합니다.
  const session = useSession();
  const profile = user ?? session.data;
  const noticeRef = useRef<HTMLDialogElement>(null);
  if (!profile) return null;

  return (
    <>
      <header
        className={styles.header}
        data-management={Boolean(mobileContent) || undefined}
        data-subpage={Boolean(mobileBack) || undefined}
      >
        {mobileBack && (
          <div
            className={styles['mobile-navigation']}
          >
            <Link
              href={mobileBack.href}
              aria-label={mobileBack.label}
              className={styles['back-link']}
            >
              <ServiceIcon
                name={'chevron'}
              />
            </Link>
            <span>
              {mobileBack.title}
            </span>
          </div>
        )}
        <Link
          href={homeHref}
          className={styles.brand}
          aria-label={`모아홈 ${homeLabel}`}
        >
          <BrandMark />
          <span>
            모아홈
          </span>
        </Link>
        <div
          className={styles['header-actions']}
        >
          <button
            type={'button'}
            className={styles['notification-button']}
            aria-label={'알림'}
            onClick={onNotify ?? (() => noticeRef.current?.showModal())}
          >
            <ServiceIcon
              name={'bell'}
            />
          </button>
          <details
            className={styles.profile}
          >
            <summary
              aria-label={`${profile.displayName}님 계정 정보`}
            >
              <HeaderAvatar
                user={profile}
              />
              <span
                className={styles['profile-name']}
              >
                {profile.displayName}
                님
              </span>
              <span
                className={styles['profile-chevron']}
              >
                <ServiceIcon
                  name={'chevron'}
                />
              </span>
            </summary>
            <div
              className={styles['profile-panel']}
            >
              <strong>
                {profile.displayName}
                님
              </strong>
              <p>
                모아홈에 오신 것을 환영해요.
              </p>
              <LogoutButton />
            </div>
          </details>
          <HeaderMobileMenu
            user={profile}
            homeHref={homeHref}
            homeLabel={homeLabel}
            content={mobileContent}
          />
        </div>
      </header>
      {!onNotify && (
        <NoticeDialog
          dialogRef={noticeRef}
          title={'알림'}
          message={'알림 기능을 준비하고 있어요.'}
        />
      )}
    </>
  );
}
