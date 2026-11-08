'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/features/logout';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './accountMenu.module.css';

/** PC 프로필 카드와 모바일 메뉴가 같은 계정 항목·권한·설명 표현을 사용합니다. */
export function AccountMenu({ systemAdministrator, replace = false, showLogout = true, onNavigate }: {
  systemAdministrator: boolean;
  replace?: boolean;
  showLogout?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div
      className={styles.menu}
    >
      <p
        className={styles.label}
      >
        계정 및 설정
      </p>
      <nav
        aria-label={'계정 메뉴'}
      >
        <Link
          className={styles.link}
          href={'/account'}
          replace={replace}
          aria-label={'내 정보'}
          aria-current={pathname === '/account' ? 'page' : undefined}
          onNavigate={onNavigate}
          onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
        >
          <span
            className={styles.icon}
            aria-hidden
          >
            <ServiceIcon
              name={'person'}
              size={20}
            />
          </span>
          <span
            className={styles.copy}
          >
            <strong>
              내 정보
            </strong>
            <span>
              프로필 및 계정 정보
            </span>
          </span>
          <ServiceIcon
            name={'chevron'}
            size={18}
          />
        </Link>
        {systemAdministrator && (
          <Link
            className={styles.link}
            href={'/admin'}
            replace={replace}
            aria-label={'시스템 관리'}
            aria-current={pathname === '/admin' || pathname.startsWith('/admin/') ? 'page' : undefined}
            onNavigate={onNavigate}
            onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
          >
            <span
              className={styles.icon}
              aria-hidden
            >
              <ServiceIcon
                name={'shield'}
                size={20}
              />
            </span>
            <span
              className={styles.copy}
            >
              <strong>
                시스템 관리
              </strong>
              <span>
                사용자 및 시스템 권한
              </span>
            </span>
            <ServiceIcon
              name={'chevron'}
              size={18}
            />
          </Link>
        )}
      </nav>
      {showLogout && (
        <div
          className={styles.logout}
        >
          <LogoutButton
            variant={'profile'}
          />
        </div>
      )}
    </div>
  );
}
