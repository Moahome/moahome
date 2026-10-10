import { Dropdown } from '@/shared/ui/form-controls';
import styles from './unitListToolbar.module.css';

/** 표 위에는 검색 결과 수와 페이지당 표시 개수만 배치합니다. */
export function UnitListToolbar({
  total,
  pageSize,
  onSizeChange,
}: {
  total: number;
  pageSize: number;
  onSizeChange: (size: number) => void;
}) {
  return (
    <div
      className={styles.heading}
    >
      <p>
        총
        {total}
        세대
      </p>
      <Dropdown
        aria-label={'페이지당 세대 수'}
        required
        value={String(pageSize)}
        options={[10, 20, 50].map((size) => ({
          value: String(size),
          label: `${size}개씩 보기`
        }))}
        onChange={(value) => onSizeChange(Number(value))}
      />
    </div>
  );
}
