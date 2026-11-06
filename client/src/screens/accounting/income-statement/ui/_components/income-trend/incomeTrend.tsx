'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import {
  getIncomeChartRatio,
  getIncomeTrend
} from '../../../model/incomeStatement';
import type { IncomeStatementReport } from '../../../model/incomeStatementTypes';
import styles from './incomeTrend.module.css';

/** 기간 내 월별·누계는 같은 월 자료를 사용하고 적자는 기준선 아래에 표시합니다. */
export function IncomeTrend({ report, cumulative, onModeChange }: {
  report: IncomeStatementReport;
  cumulative: boolean;
  onModeChange: (value: boolean) => void;
}) {
  const [active, setActive] = useState<{ month: string; left: number; top: number; width: number; arrow: number; below: boolean } | null>(null);
  const [chartWidth, setChartWidth] = useState(600);
  const scroll = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const negativeClipId = useId();
  const trend = getIncomeTrend(report, cumulative);
  const values = trend.flatMap((row) => [row.revenue, row.expense, row.profit]);
  const maximum = values.reduce((max, value) => value > max ? value : max, BigInt(1));
  const minimum = values.reduce((min, value) => value < min ? value : min, BigInt(0));
  const step = BigInt(10) ** BigInt(Math.max(0, maximum.toString().length - 2));
  const top = ((maximum + step - BigInt(1)) / step) * step;
  const bottom = minimum < BigInt(0) ? -((-minimum + step - BigInt(1)) / step) * step : BigInt(0);
  const width = Math.max(chartWidth, 440, trend.length * 82 + 70);
  const plotWidth = width - 76;
  const slot = plotWidth / trend.length;
  const y = (value: bigint) => 24 + getIncomeChartRatio(top - value, top - bottom) * 200;
  const x = (index: number) => 60 + slot * (index + 0.5);
  const selected = trend.find((row) => row.month === active?.month);
  const unit = top >= BigInt(10000) ? BigInt(10000) : BigInt(1);

  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setChartWidth(Math.floor(entry.contentRect.width));
      setActive(null);
    });
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !stage.current?.contains(event.target)) setActive(null);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [active]);

  /** 말풍선을 선택한 점에 붙이고 가로 스크롤 중에도 현재 보이는 그래프 폭 안에 제한합니다. */
  function showTooltip(month: string, point: SVGCircleElement) {
    if (!stage.current || !scroll.current) return;
    const pointBounds = point.getBoundingClientRect();
    const bounds = stage.current.getBoundingClientRect();
    const tooltipWidth = Math.min(228, scroll.current.clientWidth - 16);
    const anchor = pointBounds.x + pointBounds.width / 2 - bounds.x;
    const left = Math.max(scroll.current.scrollLeft + 8, Math.min(anchor - tooltipWidth / 2,
      scroll.current.scrollLeft + scroll.current.clientWidth - tooltipWidth - 8));
    const top = pointBounds.y + pointBounds.height / 2 - bounds.y;
    setActive({
      month,
      left,
      top,
      width: tooltipWidth,
      arrow: anchor - left,
      below: top < 135
    });
  }

  return (
    <section
      className={styles.panel}
      aria-labelledby={'income-trend-title'}
    >
      <div
        className={styles.heading}
      >
        <h2
          id={'income-trend-title'}
        >
          {cumulative ? '기간 누계 손익' : '월별 손익 추이'}
        </h2>
        <div
          className={styles.switch}
          role={'group'}
          aria-label={'손익 그래프 표시 방식'}
        >
          {[false, true].map((value) => (
            <Button
              key={String(value)}
              size={'sm'}
              variant={'ghost'}
              aria-pressed={cumulative === value}
              onClick={() => { onModeChange(value); setActive(null); }}
            >
              {value ? '누계' : '월별'}
            </Button>
          ))}
        </div>
      </div>
      <div
        className={styles.legend}
        aria-hidden={'true'}
      >
        <span
          data-series={'revenue'}
        >
          <i />
          수익
        </span>
        <span
          data-series={'expense'}
        >
          <i />
          비용
        </span>
        <span
          data-series={'profit'}
        >
          <i />
          손익
        </span>
      </div>
      <div
        className={styles.scroll}
        ref={scroll}
        tabIndex={0}
        role={'region'}
        aria-label={'손익 그래프 가로 스크롤'}
        onScroll={() => setActive(null)}
      >
        <div
          ref={stage}
          className={styles.stage}
          style={{
            width
          }}
          onPointerDown={(event) => {
            if (!(event.target instanceof SVGCircleElement)) setActive(null);
          }}
        >
          <svg
            viewBox={`0 0 ${width} 266`}
            height={266}
            role={'img'}
            aria-label={`${cumulative ? '조회 시작 월부터의 누계' : '월별'} 수익·비용 막대와 순손익 선 그래프. 정확한 금액은 아래 표에서 확인할 수 있습니다.`}
          >
            <defs>
              <clipPath
                id={negativeClipId}
              >
                <rect
                  x={0}
                  y={y(BigInt(0))}
                  width={width}
                  height={266 - y(BigInt(0))}
                />
              </clipPath>
            </defs>
            <text
              x={8}
              y={12}
            >
              {unit === BigInt(1) ? '(원)' : '(만원)'}
            </text>
            {[0, 1, 2, 3, 4].map((index) => {
              const amount = top - (top - bottom) * BigInt(index) / BigInt(4);
              return (
                <g
                  key={index}
                >
                  <line
                    x1={60}
                    x2={width - 16}
                    y1={y(amount)}
                    y2={y(amount)}
                    className={styles.grid}
                  />
                  <text
                    x={48}
                    y={y(amount) + 4}
                    textAnchor={'end'}
                  >
                    {formatInteger(amount / unit)}
                  </text>
                </g>
              );
            })}
            <line
              x1={60}
              x2={width - 16}
              y1={y(BigInt(0))}
              y2={y(BigInt(0))}
              className={styles.baseline}
            />
            {trend.map((row, index) => (
              <g
                key={row.month}
              >
                {(['revenue', 'expense'] as const).map((series, seriesIndex) => (
                  <rect
                    key={series}
                    className={styles.bar}
                    data-series={series}
                    data-negative={row[series] < BigInt(0)}
                    x={x(index) - 26 + seriesIndex * 28}
                    y={Math.min(y(row[series]), y(BigInt(0)))}
                    width={24}
                    height={Math.max(1, Math.abs(y(row[series]) - y(BigInt(0))))}
                    rx={3}
                  />
                ))}
                <text
                  x={x(index)}
                  y={252}
                  textAnchor={'middle'}
                >
                  {row.month.slice(2).replace('-', '.')}
                </text>
              </g>
            ))}
            <polyline
              className={styles.line}
              points={trend.map((row, index) => `${x(index)},${y(row.profit)}`).join(' ')}
            />
            <polyline
              className={styles['negative-line']}
              clipPath={`url(#${negativeClipId})`}
              points={trend.map((row, index) => `${x(index)},${y(row.profit)}`).join(' ')}
            />
            {trend.map((row, index) => (
              <circle
                key={row.month}
                className={styles.point}
                data-negative={row.profit < BigInt(0)}
                cx={x(index)}
                cy={y(row.profit)}
                r={5}
                tabIndex={0}
                aria-describedby={active?.month === row.month ? tooltipId : undefined}
                aria-label={`${row.month} ${cumulative ? '누계 ' : ''}수익 ${formatInteger(row.revenue)}원, 비용 ${formatInteger(row.expense)}원, 순손익 ${formatInteger(row.profit)}원`}
                onPointerEnter={(event) => { if (event.pointerType === 'mouse') showTooltip(row.month, event.currentTarget); }}
                onPointerLeave={(event) => { if (event.pointerType === 'mouse') setActive(null); }}
                onFocus={(event) => showTooltip(row.month, event.currentTarget)}
                onBlur={() => setActive(null)}
                onClick={(event) => showTooltip(row.month, event.currentTarget)}
                onKeyDown={(event) => { if (event.key === 'Escape') setActive(null); }}
              />
            ))}
          </svg>
          {selected && active && (
            <div
              id={tooltipId}
              role={'tooltip'}
              className={styles.tooltip}
              data-below={active.below}
              style={{
                left: active.left,
                top: active.top,
                width: active.width,
                '--tooltip-arrow': `${active.arrow}px`
              } as CSSProperties}
            >
              <strong>
                {selected.month.replace('-', '년 ')}
                월
                {cumulative ? ' 누계' : ''}
              </strong>
              <dl>
                {([['수익', selected.revenue], ['비용', selected.expense], ['순손익', selected.profit]] as const).map(([label, amount]) => (
                  <div
                    key={label}
                  >
                    <dt>
                      {label}
                    </dt>
                    <dd
                      data-negative={amount < BigInt(0)}
                    >
                      {formatInteger(amount)}
                      원
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
      <div
        className={styles.detail}
      >
        그래프의 점을 선택하면 해당 월의 금액을 확인할 수 있습니다.
      </div>
      <DataTable
        label={cumulative ? '누계 손익 내역' : '월별 손익 내역'}
        rows={trend}
        getRowKey={(row) => row.month}
        minWidth={490}
        emptyState={'선택한 기간의 자료가 없습니다.'}
        columns={[
          {
            key: 'month',
            header: '월',
            rowHeader: true,
            render: (row) => row.month.replace('-', '.')
          },
          {
            key: 'revenue',
            header: '수익',
            align: 'right',
            render: (row) => (
              <span
                className={styles.money}
                data-negative={row.revenue < BigInt(0)}
              >
                {formatInteger(row.revenue)}
              </span>
            )
          },
          {
            key: 'expense',
            header: '비용',
            align: 'right',
            render: (row) => (
              <span
                className={styles.money}
                data-negative={row.expense < BigInt(0)}
              >
                {formatInteger(row.expense)}
              </span>
            )
          },
          {
            key: 'profit',
            header: '순손익',
            align: 'right',
            render: (row) => (
              <strong
                className={styles.profit}
                data-negative={row.profit < BigInt(0)}
              >
                {formatInteger(row.profit)}
              </strong>
            )
          }
        ]}
      />
    </section>
  );
}
