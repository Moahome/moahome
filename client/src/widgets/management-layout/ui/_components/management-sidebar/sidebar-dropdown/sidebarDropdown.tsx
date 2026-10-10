'use client';

import {
  useId,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './sidebarDropdown.module.css';

/** 각 그룹은 독립적으로 펼치며 현재 페이지가 속한 그룹으로 이동하면 자동으로 엽니다. */
export function SidebarDropdown({
  label,
  icon,
  active,
  children,
  collapsed = false,
  onExpand,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  children: ReactNode;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const contentId = useId();
  const [expansion, setExpansion] = useState({
    active,
    open: active
  });
  // 경로가 바뀔 때에만 현재 그룹을 열고 사용자가 펼친 다른 그룹의 상태는 유지합니다.
  if (expansion.active !== active) {
    setExpansion({
      active,
      open: active || expansion.open
    });
  }
  const open = !collapsed && expansion.open;

  /** 접힌 사이드바의 그룹을 누르면 전체 메뉴와 해당 하위 목록을 함께 펼칩니다. */
  function toggleGroup() {
    if (collapsed) {
      onExpand?.();
      setExpansion((previous) => ({
        ...previous,
        open: true
      }));
      return;
    }
    setExpansion((previous) => ({
      ...previous,
      open: !previous.open
    }));
  }

  return (
    <div
      className={styles.dropdown}
    >
      <Button
        variant={'ghost'}
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        data-collapsed={collapsed}
        onClick={toggleGroup}
      >
        {icon}
        <span
          hidden={collapsed}
        >
          {label}
        </span>
        <span
          className={styles.chevron}
          data-open={open}
          hidden={collapsed}
        >
          <ServiceIcon
            size={22}
            name={'chevron'}
            direction={'down'}
          />
        </span>
      </Button>
      <ul
        id={contentId}
        hidden={!open}
        className={styles.children}
      >
        {children}
      </ul>
    </div>
  );
}
