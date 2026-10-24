import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ManagementMenuLink } from '../../../_constants/managementNavigation';
import styles from './sidebarLink.module.css';

/** 미구현 메뉴는 준비 배지를 유지하며 같은 관리대상의 준비 안내 화면으로 연결합니다. */
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
  const isCurrent = pathname === href || (item.path === 'banking/transactions' && ['upload', 'manual', 'manual-expense'].some((path) => pathname === `/manage/${propertyId}/banking/${path}`));
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

  return (
    <Link
      href={href}
      className={styles.link}
      data-icon={Boolean(icon)}
      data-collapsed={collapsed}
      aria-label={collapsed ? `${item.label}${item.available ? '' : ' (준비 중)'}` : undefined}
      title={collapsed ? `${item.label}${item.available ? '' : ' (준비 중)'}` : undefined}
      aria-current={isCurrent ? 'page' : undefined}
      onNavigate={onNavigate}
      replace={Boolean(onNavigate)}
    >
      {content}
    </Link>
  );
}
