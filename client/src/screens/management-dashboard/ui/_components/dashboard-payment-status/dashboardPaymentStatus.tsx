import type { DashboardReport } from '../../../model/dashboardTypes';
import { DashboardPanel } from '../dashboard-panel/dashboardPanel';
import styles from './dashboardPaymentStatus.module.css';

const COLORS = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--sub-text)'
};

/** 도넛은 기존 수납 대상의 세대 수이며 실제 입금액의 비율과 혼동하지 않게 이름을 구분합니다. */
export function DashboardPaymentStatus({ report, href }: { report: DashboardReport; href: string }) {
  let end = 0;
  const segments = report.states.map((row) => {
    const start = end;
    end += report.targetCount ? row.count * 100 / report.targetCount : 0;

    return `${COLORS[row.tone]} ${start}% ${end}%`;
  });

  return (
    <DashboardPanel
      title={'세대 납부 현황'}
      href={href}
    >
      <div
        className={styles.status}
      >
        <div
          className={styles.donut}
          style={{
            background: report.targetCount ? `conic-gradient(${segments.join(',')})` : 'var(--border)'
          }}
          role={'img'}
          aria-label={`수납 대상 ${report.targetCount}세대. ${report.states.map((row) => `${row.label} ${row.count}세대`).join(', ')}`}
        >
          <div>
            <strong>
              {report.targetCount}
              세대
            </strong>
            <span>
              수납 대상
            </span>
          </div>
        </div>
        <ul
          className={styles.legend}
        >
          {report.states.map((row) => (
            <li
              key={row.label}
            >
              <span
                className={styles.dot}
                style={{
                  background: COLORS[row.tone]
                }}
                aria-hidden={'true'}
              />
              <span>
                {row.label}
              </span>
              <strong>
                {row.count}
                세대
              </strong>
            </li>
          ))}
          <li
            className={styles.prepaid}
          >
            <span
              className={styles.dot}
              style={{
                background: 'var(--secondary-teal)'
              }}
              aria-hidden={'true'}
            />
            <span>
              선입금 보유
            </span>
            <strong>
              {report.prepaidCount}
              세대
            </strong>
          </li>
        </ul>
      </div>
      <div
        className={styles.note}
      >
        <strong>
          {report.completeRate !== null ? `완납 세대 비율 ${report.completeRate.toFixed(1)}%` : report.targetCount ? '청구 정산 기준을 확인해주세요.' : '수납 대상이 없어요.'}
        </strong>
        <span>
          선입금은 납부 상태와 별도로 집계해요. 당월 미부과
          {' '}
          {report.prepaidOnlyCount}
          세대
        </span>
      </div>
    </DashboardPanel>
  );
}
