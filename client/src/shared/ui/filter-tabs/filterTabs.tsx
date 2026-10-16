import { Button } from '@/shared/ui/button';
import styles from './filterTabs.module.css';

/** 같은 목록의 필터를 글자·밑줄 탭으로 표시하며 조회와 페이지 초기화는 호출자가 처리합니다. */
export function FilterTabs<Value extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly {
    value: Value;
    label: string;
    count?: number;
  }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div
      className={styles.tabs}
      role={'group'}
      aria-label={label}
    >
      {items.map((item) => (
        <Button
          key={item.value}
          variant={'ghost'}
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && ` (${item.count})`}
        </Button>
      ))}
    </div>
  );
}
