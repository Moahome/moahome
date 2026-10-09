import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ManagementMenuLink } from '../../../_constants/managementNavigation';
import styles from './sidebarLink.module.css';

/** 활성 메뉴만 실제 링크로 연결하며 미구현 목적지는 이동 없이 준비 상태를 표시합니다. */
export function SidebarLink({
  item,
  propertyId,
  pathname,
  icon,
  onNavigate,
}: {
  item: ManagementMenuLink;
  propertyId: string;
  pathname: string;
  icon?: ReactNode;
  onNavigate?: () => void;
}) {
  const href = `/manage/${propertyId}/${item.path}`;
  const content = (
    <>
      {icon}
      <span>
        {item.label}
      </span>
      {!item.available && <small>
        준비 중
      </small>}
    </>
  );

  if (!item.available) {
    return (
      <span
        className={styles.link}
        data-icon={Boolean(icon)}
        aria-disabled={'true'}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={styles.link}
      data-icon={Boolean(icon)}
      aria-current={pathname === href ? 'page' : undefined}
      onNavigate={onNavigate}
      replace={Boolean(onNavigate)}
    >
      {content}
    </Link>
  );
}
