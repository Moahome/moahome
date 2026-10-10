import type { UnitDraft } from '@/entities/property';
import { ServiceIcon } from '@/shared/ui/service-icon';
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
      tone: 'total'
    },
    {
      label: '사용중',
      count: units.filter((unit) => unit.status === 'ACTIVE').length,
      tone: 'active'
    },
    {
      label: '공실',
      count: units.filter((unit) => unit.status === 'VACANT').length,
      tone: 'vacant'
    }
  ];

  return (
    <div
      className={styles.summary}
      aria-label={'전체 세대 현황'}
    >
      {items.map((item) => (
        <article
          key={item.tone}
          className={styles.card}
          data-tone={item.tone}
          aria-label={`${item.label} ${item.count}세대`}
        >
          <span
            className={styles.icon}
          >
            <ServiceIcon
              name={'home'}
            />
          </span>
          <div>
            <p>
              {item.label}
            </p>
            <strong>
              {item.count}
            </strong>
            <span
              className={styles.unit}
            >
              세대
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
