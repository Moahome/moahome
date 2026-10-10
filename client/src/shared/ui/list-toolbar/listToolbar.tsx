import type { ReactNode } from 'react';
import { Dropdown } from '@/shared/ui/form-controls';
import styles from './listToolbar.module.css';

/** 필터 결과 수와 표시 개수 왼쪽의 선택적 버튼을 공유하며 페이지·버튼 동작은 호출 화면에서 관리합니다. */
export function ListToolbar({
  total,
  unit,
  sizeLabel,
  pageSize,
  onSizeChange,
  actions,
}: {
  total: number;
  unit: string;
  sizeLabel: string;
  pageSize: number;
  onSizeChange: (size: number) => void;
  actions?: ReactNode;
}) {
  return (
    <div
      className={styles.toolbar}
      data-actions={actions ? 'true' : undefined}
    >
      <p>
        총
        {' '}
        {total}
        {unit}
      </p>
      <div
        className={styles.controls}
      >
        {actions}
        <div
          className={styles.size}
        >
          <Dropdown
            aria-label={sizeLabel}
            required
            value={String(pageSize)}
            options={[10, 20, 50].map((size) => ({
              value: String(size),
              label: `${size}개씩 보기`
            }))}
            onChange={(value) => onSizeChange(Number(value))}
          />
        </div>
      </div>
    </div>
  );
}
