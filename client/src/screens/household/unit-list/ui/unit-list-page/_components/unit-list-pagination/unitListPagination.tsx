import { Button } from '@/shared/ui/button';
import styles from './unitListPagination.module.css';

/** 페이지 수가 줄어든 결과를 기준으로 이동 버튼과 현재 표시 범위를 함께 갱신합니다. */
export function UnitListPagination({
  total,
  page,
  pageCount,
  pageSize,
  onPageChange,
}: {
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const firstPage = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pageNumbers = Array.from({
    length: Math.min(5, pageCount)
  }, (_, index) => firstPage + index);
  const firstIndex = (page - 1) * pageSize;

  return (
    <footer
      className={styles.footer}
    >
      <p
        className={styles.count}
        aria-live={'polite'}
      >
        총
        {total}
        세대
        {total > 0 && ` 중 ${firstIndex + 1}–${Math.min(firstIndex + pageSize, total)}`}
      </p>
      <nav
        className={styles.pagination}
        aria-label={'세대 목록 페이지'}
      >
        <Button
          variant={'outline'}
          size={'sm'}
          iconOnly
          aria-label={'이전 페이지'}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹
        </Button>
        {pageNumbers.map((number) => (
          <Button
            key={number}
            variant={number === page ? 'primary' : 'outline'}
            size={'sm'}
            iconOnly
            aria-label={`${number}페이지`}
            aria-current={number === page ? 'page' : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </Button>
        ))}
        <Button
          variant={'outline'}
          size={'sm'}
          iconOnly
          aria-label={'다음 페이지'}
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </Button>
      </nav>
    </footer>
  );
}
