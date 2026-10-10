import { Dropdown } from '@/shared/ui/form-controls';
import styles from './listToolbar.module.css';

/** 필터 결과의 건수와 표시 개수를 공유하며 실제 페이지 상태는 호출 화면에서 관리합니다. */
export function ListToolbar({
  total,
  unit,
  sizeLabel,
  pageSize,
  onSizeChange,
}: {
  total: number;
  unit: string;
  sizeLabel: string;
  pageSize: number;
  onSizeChange: (size: number) => void;
}) {
  return (
    <div
      className={styles.toolbar}
    >
      <p>
        총
        {' '}
        {total}
        {unit}
      </p>
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
  );
}
