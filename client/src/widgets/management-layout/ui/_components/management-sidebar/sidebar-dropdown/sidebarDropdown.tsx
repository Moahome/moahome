'use client';

import {
  useId,
  useState,
  type ReactNode
} from 'react';
import { Button } from '@/shared/ui/button';
import { ManagementIcon } from '../../management-icon/managementIcon';
import styles from './sidebarDropdown.module.css';

/** 각 그룹은 독립적으로 펼치며 현재 페이지가 속한 그룹으로 이동하면 자동으로 엽니다. */
export function SidebarDropdown({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  children: ReactNode;
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
  const open = expansion.open;

  return (
    <div
      className={styles.dropdown}
    >
      <Button
        variant={'ghost'}
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setExpansion((previous) => ({
          ...previous,
          open: !previous.open
        }))}
      >
        {icon}
        <span>
          {label}
        </span>
        <span
          className={styles.chevron}
          data-open={open}
        >
          <ManagementIcon
            name={'chevron'}
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
