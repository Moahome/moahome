'use client';

import { usePathname } from 'next/navigation';
import { useId } from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { MANAGEMENT_NAVIGATION } from '../../_constants/managementNavigation';
import { SidebarDropdown } from './sidebar-dropdown/sidebarDropdown';
import { SidebarLink } from './sidebar-link/sidebarLink';
import styles from './managementSidebar.module.css';

/** 메뉴를 조합하고 PC에서는 맨 아래에 유지되는 아이콘 버튼으로 사이드바를 접고 펼칩니다. */
export function ManagementSidebar({
  propertyId,
  onNavigate,
  variant = 'sidebar',
  collapsed = false,
  onToggle,
  onExpand,
}: {
  propertyId: string;
  onNavigate?: () => void;
  variant?: 'sidebar' | 'drawer';
  collapsed?: boolean;
  onToggle?: () => void;
  onExpand?: () => void;
}) {
  const navigationId = useId();
  const pathname = usePathname();
  const basePath = `/manage/${propertyId}/`;
  const compact = variant === 'sidebar' && collapsed;
  const toggleLabel = compact ? '사이드바 펼치기' : '사이드바 접기';

  return (
    <div
      className={styles.sidebar}
      data-variant={variant}
      data-collapsed={compact}
    >
      <nav
        id={navigationId}
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
                    <ServiceIcon
                      size={22}
                      name={item.icon}
                    />
                  )}
                  active={item.children.some((child) => pathname === basePath + child.path)
                    || (item.id === 'banking' && (pathname.startsWith(`${basePath}banking/`)
                      || pathname.startsWith(`${basePath}payments/`)))}
                  collapsed={compact}
                  onExpand={onExpand}
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
                    <ServiceIcon
                      size={22}
                      name={item.icon}
                    />
                  )}
                  onNavigate={onNavigate}
                  collapsed={compact}
                />
              )}
            </li>
          ))}
        </ul>
      </nav>
      {variant === 'sidebar' && onToggle && (
        <div
          className={styles['toggle-item']}
        >
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={toggleLabel}
            aria-expanded={!compact}
            aria-controls={navigationId}
            title={toggleLabel}
            onClick={onToggle}
          >
            <span
              className={styles['toggle-icon']}
              aria-hidden={'true'}
            >
              <ServiceIcon
                name={'chevron'}
                direction={'left'}
                size={14}
              />
              <ServiceIcon
                name={'chevron'}
                direction={'right'}
                size={14}
              />
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
