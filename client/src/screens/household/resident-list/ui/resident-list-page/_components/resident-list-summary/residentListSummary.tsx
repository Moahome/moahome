import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import type { ResidentRow } from '../../../../api/residentApiTypes';
import styles from './residentListSummary.module.css';

/** 카드 집계는 검색 결과나 현재 페이지가 아닌 조회한 명부 전체를 기준으로 계산합니다. */
export function ResidentListSummary({
  residents,
}: {
  residents: ResidentRow[];
}) {
  const items = [
    {
      label: '전체 주민',
      value: residents.length,
      tone: 'primary',
      icon: 'person'
    },
    {
      label: '가입 완료',
      value: residents.filter((row) => row.signupStatus === 'APPROVED').length,
      tone: 'success',
      icon: 'check'
    },
    {
      label: '미가입',
      value: residents.filter((row) => row.signupStatus === 'NOT_JOINED').length,
      tone: 'neutral',
      icon: 'person'
    },
    {
      label: '승인 대기',
      value: residents.filter((row) => row.signupStatus === 'PENDING').length,
      tone: 'warning',
      icon: 'clock'
    }
  ] as const;

  return (
    <div
      className={styles.summary}
      aria-label={'전체 주민 현황'}
    >
      {items.map((item) => (
        <SummaryCard
          key={item.label}
          label={item.label}
          value={item.value}
          unit={'명'}
          tone={item.tone}
          icon={(
            <ServiceIcon
              name={item.icon}
            />
          )}
        />
      ))}
    </div>
  );
}
