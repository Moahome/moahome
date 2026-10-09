'use client';

import { usePathname } from 'next/navigation';
import { MANAGEMENT_NAVIGATION } from '../../_constants/managementNavigation';
import { ManagementIcon } from '../management-icon/managementIcon';
import { SidebarDropdown } from './sidebar-dropdown/sidebarDropdown';
import { SidebarLink } from './sidebar-link/sidebarLink';
import styles from './managementSidebar.module.css';

/** 메뉴 데이터와 독립적인 드롭다운·링크를 조합하며 업무 페이지는 URL로 연결합니다. */
export function ManagementSidebar({
  propertyId,
  onNavigate,
  variant = 'sidebar',
}: {
  propertyId: string;
  onNavigate?: () => void;
  variant?: 'sidebar' | 'drawer';
}) {
  const pathname = usePathname();
  const basePath = `/manage/${propertyId}/`;

  return (
    <div
      className={styles.sidebar}
      data-variant={variant}
    >
      <nav
        aria-label={'관리 메뉴'}
        className={styles.navigation}
      >
        <ul>
          {MANAGEMENT_NAVIGATION.map((item) => (
            <li
              key={item.id}
            >
              {'children' in item ? (
                <SidebarDropdown
                  label={item.label}
                  icon={(
                    <ManagementIcon
                      name={item.icon}
                    />
                  )}
                  active={item.children.some((child) => pathname === basePath + child.path)}
                >
                  {item.children.map((child) => (
                    <li
                      key={child.id}
                    >
                      <SidebarLink
                        item={child}
                        propertyId={propertyId}
                        pathname={pathname}
                        onNavigate={onNavigate}
                      />
                    </li>
                  ))}
                </SidebarDropdown>
              ) : (
                <SidebarLink
                  item={item}
                  propertyId={propertyId}
                  pathname={pathname}
                  icon={(
                    <ManagementIcon
                      name={item.icon}
                    />
                  )}
                  onNavigate={onNavigate}
                />
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
