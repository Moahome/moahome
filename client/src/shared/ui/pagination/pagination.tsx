'use client';

import { Button } from '@/shared/ui/button';
import styles from './pagination.module.css';

/** 숫자는 최대 다섯 페이지씩 묶고 화살표는 이전·다음 묶음의 첫 페이지로 이동합니다. */
export function Pagination({
  label,
  unit,
  total,
  page,
  pageCount,
  pageSize,
  onPageChange,
  showCount = true,
}: {
  label: string;
  unit: string;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showCount?: boolean;
}) {
  const firstPage = Math.floor((page - 1) / 5) * 5 + 1;
  const lastPage = Math.min(firstPage + 4, pageCount);
  const pageNumbers = Array.from({
    length: lastPage - firstPage + 1
  }, (_, index) => firstPage + index);
  const firstIndex = (page - 1) * pageSize;

  return (
    <footer
      className={styles.footer}
      data-show-count={showCount}
    >
      {showCount && (
        <p
          className={styles.count}
          aria-live={'polite'}
        >
          총
          {total}
          {unit}
          {total > 0 && ` 중 ${firstIndex + 1}–${Math.min(firstIndex + pageSize, total)}`}
        </p>
      )}
      <nav
        className={styles.pagination}
        aria-label={label}
      >
        <Button
          variant={'outline'}
          size={'sm'}
          iconOnly
          aria-label={'이전 5페이지'}
          disabled={firstPage === 1}
          onClick={() => onPageChange(Math.max(1, firstPage - 5))}
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
          aria-label={'다음 5페이지'}
          disabled={lastPage === pageCount}
          onClick={() => onPageChange(firstPage + 5)}
        >
          ›
        </Button>
      </nav>
    </footer>
  );
}
