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
  collapsed = false,
}: {
  item: ManagementMenuLink;
  propertyId: string;
  pathname: string;
  icon?: ReactNode;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const href = `/manage/${propertyId}/${item.path}`;
  const isCurrent = pathname === href || (item.path === 'banking/transactions' && pathname === `/manage/${propertyId}/banking/upload`);
  const content = (
    <>
      {icon}
      <span
        hidden={collapsed}
      >
        {item.label}
      </span>
      {!item.available && !collapsed && <small>
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
        data-collapsed={collapsed}
        aria-label={collapsed ? `${item.label} (준비 중)` : undefined}
        title={collapsed ? `${item.label} (준비 중)` : undefined}
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
      data-collapsed={collapsed}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      aria-current={isCurrent ? 'page' : undefined}
      onNavigate={onNavigate}
      replace={Boolean(onNavigate)}
    >
      {content}
    </Link>
  );
}
