import { Dropdown } from '@/shared/ui/form-controls';
import styles from './residentListToolbar.module.css';

export function ResidentListToolbar({
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
      className={styles.toolbar}
    >
      <p>
        총
        {' '}
        {total}
        명
      </p>
      <div
        className={styles.size}
      >
        <Dropdown
          aria-label={'페이지당 주민 수'}
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
