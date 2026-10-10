import type { UnitDraft } from '@/entities/property';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import styles from './unitListSummary.module.css';

/** 요약은 검색 결과가 아니라 관리대상 전체 세대의 현재 상태를 집계합니다. */
export function UnitListSummary({
  units,
}: {
  units: UnitDraft[];
}) {
  const items = [
    {
      label: '전체 세대',
      count: units.length,
      tone: 'primary'
    },
    {
      label: '사용중',
      count: units.filter((unit) => unit.status === 'ACTIVE').length,
      tone: 'success'
    },
    {
      label: '공실',
      count: units.filter((unit) => unit.status === 'VACANT').length,
      tone: 'neutral'
    }
  ] as const;

  return (
    <div
      className={styles.summary}
      aria-label={'전체 세대 현황'}
    >
      {items.map((item) => (
        <SummaryCard
          key={item.tone}
          label={item.label}
          value={item.count}
          unit={'세대'}
          tone={item.tone}
          icon={(
            <ServiceIcon
              name={'home'}
            />
          )}
        />
      ))}
    </div>
  );
}
