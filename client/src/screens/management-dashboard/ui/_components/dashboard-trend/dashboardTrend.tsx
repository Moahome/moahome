'use client';

import {
  useId,
  useState,
  type CSSProperties
} from 'react';
import { formatWon } from '@/shared/lib/format';
import { getChartRatio } from '../../../model/dashboard';
import type { DashboardReport } from '../../../model/dashboardTypes';
import { DashboardPanel } from '../dashboard-panel/dashboardPanel';
import styles from './dashboardTrend.module.css';

/** 큰 금액은 비율 좌표로만 변환하고 음수 청구도 기준선 아래에 원금액 그대로 설명합니다. */
export function DashboardTrend({ trend, href }: { trend: DashboardReport['trend']; href: string }) {
  const [active, setActive] = useState<{ index: number; series: 'billed' | 'applied' } | null>(null);
  const tooltipId = useId();
  const selected = active === null ? undefined : trend[active.index];
  const selectedValue = selected && active ? selected[active.series] : null;
  const values = trend.flatMap((row) => [row.billed, row.applied]).filter((value): value is bigint => value !== null);
  const maximum = values.reduce((max, value) => {
    const absolute = value < BigInt(0) ? -value : value;

    return absolute > max ? absolute : max;
  }, BigInt(0));
  const negative = values.some((value) => value < BigInt(0));
  const baseline = negative ? 125 : 205;
  const plotHeight = negative ? 92 : 170;

  return (
    <DashboardPanel
      title={'최근 6개월 관리비 현황'}
      href={href}
      linkLabel={'월별 수납'}
    >
      <figure
        className={styles.trend}
      >
        <div
          className={styles.legend}
        >
          <span>
            <i />
            청구액
          </span>
          <span>
            <i />
            납부반영액
          </span>
        </div>
        <svg
          viewBox={'0 0 560 250'}
          role={'img'}
          aria-label={'최근 6개월 청구액과 납부반영액 비교. 상세 금액은 이어지는 표에서 확인할 수 있습니다.'}
        >
          {[0, 0.5, 1].map((step) => (
            <line
              key={step}
              x1={16}
              x2={550}
              y1={baseline - plotHeight * step}
              y2={baseline - plotHeight * step}
              className={styles.grid}
            />
          ))}
          {trend.map((row, index) => {
            const x = 30 + index * 88;

            return (
              <g
                key={row.month}
                onPointerLeave={() => setActive(null)}
              >
                {(['billed', 'applied'] as const).map((key, series) => {
                  const value = row[key];
                  const height = getChartRatio(value ?? BigInt(0), maximum) * plotHeight;
                  const label = `${row.month} ${series ? '납부반영액' : '청구액'} ${value === null ? '확인 필요' : formatWon(value)}`;

                  return (
                    <rect
                      key={key}
                      x={x + series * 29}
                      y={(value ?? BigInt(0)) < BigInt(0) ? baseline : baseline - height}
                      width={24}
                      height={height || 1}
                      rx={3}
                      className={styles.bar}
                      data-series={key}
                      tabIndex={0}
                      aria-label={label}
                      aria-describedby={active?.index === index && active.series === key ? tooltipId : undefined}
                      onPointerEnter={() => setActive({
                        index,
                        series: key
                      })}
                      onFocus={() => setActive({
                        index,
                        series: key
                      })}
                      onBlur={() => setActive(null)}
                      onClick={() => setActive({
                        index,
                        series: key
                      })}
                      onKeyDown={(event) => { if (event.key === 'Escape') setActive(null); }}
                    />
                  );
                })}
                <text
                  x={x + 26}
                  y={244}
                  textAnchor={'middle'}
                >
                  {row.month.slice(2, 4)}
                  .
                  {row.month.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
        {selected && active !== null && (
          <div
            id={tooltipId}
            role={'tooltip'}
            className={styles.tooltip}
            style={{
              '--tooltip-anchor': `${(active.index + 0.5) * 100 / trend.length}%`
            } as CSSProperties}
          >
            <strong>
              {selected.month.replace('-', '년 ')}
              월
            </strong>
            <span>
              {active.series === 'billed' ? '청구액' : '납부반영액'}
              <b>
                {selectedValue === null ? '확인 필요' : formatWon(selectedValue)}
              </b>
            </span>
          </div>
        )}
        <table
          className={styles['accessible-table']}
        >
          <caption>
            최근 6개월 관리비 금액
          </caption>
          <thead>
            <tr>
              <th
                scope={'col'}
              >
                월
              </th>
              <th
                scope={'col'}
              >
                청구액
              </th>
              <th
                scope={'col'}
              >
                납부반영액
              </th>
            </tr>
          </thead>
          <tbody>
            {trend.map((row) => (
              <tr
                key={row.month}
              >
                <th
                  scope={'row'}
                >
                  {row.month}
                </th>
                <td>
                  {formatWon(row.billed)}
                </td>
                <td>
                  {row.applied === null ? '확인 필요' : formatWon(row.applied)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </DashboardPanel>
  );
}
