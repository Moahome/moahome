'use client';

import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './queryRefresh.module.css';

function getRefreshStatus(refreshing: boolean, failed: boolean, valid: boolean) {
  if (refreshing) return {
    state: 'refreshing',
    label: '업데이트 중'
  };
  if (failed) return {
    state: 'failed',
    label: '업데이트 실패'
  };
  return {
    state: valid ? 'ready' : 'waiting',
    label: '마지막 업데이트'
  };
}

/** 마지막 조회 시각과 조회 상태를 공통으로 표시하고 클릭한 조회만 다시 실행합니다. */
export function QueryRefresh({ updatedAt, refreshing = false, failed = false, disabled = false, onRefresh, label = '자료 새로고침', className }: {
  updatedAt?: string | number | null;
  refreshing?: boolean;
  failed?: boolean;
  disabled?: boolean;
  onRefresh: () => void;
  label?: string;
  className?: string;
}) {
  const date = updatedAt ? new Date(updatedAt) : null;
  const valid = date !== null && Number.isFinite(date.getTime());
  const status = getRefreshStatus(refreshing, failed, valid);
  const dateLabel = valid ? new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date) : null;
  const timeLabel = valid ? new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date) : null;

  return (
    <div
      className={[styles.refresh, className].filter(Boolean).join(' ')}
      data-state={status.state}
    >
      <div
        className={styles.status}
        aria-live={'polite'}
      >
        <span
          className={styles.indicator}
          aria-hidden={'true'}
        />
        <div
          className={styles.information}
        >
          <span
            className={styles.label}
          >
            {status.label}
          </span>
          {valid ? (
            <time
              dateTime={date.toISOString()}
              className={styles.time}
            >
              <span>
                {dateLabel}
              </span>
              <span>
                {timeLabel}
              </span>
            </time>
          ) : (
            <strong
              className={styles.time}
            >
              {refreshing ? '조회하고 있어요' : '조회 내역 없음'}
            </strong>
          )}
        </div>
      </div>
      <div
        className={styles.action}
      >
        <Button
          className={styles.button}
          loading={refreshing}
          disabled={disabled}
          onClick={onRefresh}
          aria-label={label}
          leadingIcon={(
            <ServiceIcon
              name={'reset'}
              size={20}
            />
          )}
        >
          새로고침
        </Button>
      </div>
    </div>
  );
}
