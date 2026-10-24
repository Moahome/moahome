'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { RequestError } from '@/shared/ui/server-connection-error';

import { useState } from 'react';
import Link from 'next/link';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthPicker } from '@/shared/ui/month-picker';
import {
  ServiceIcon,
  type ServiceIconName
} from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import { getMonthlySettlement } from '../api/monthlySettlementApi';
import { getSettlementReport } from '../model/monthlySettlement';
import type { MonthlySettlementSnapshot } from '../api/monthlySettlementApiTypes';
import { SettlementDownload } from './_components/settlement-download/settlementDownload';
import { SettlementDetails } from './_components/settlement-details/settlementDetails';
import styles from './monthlySettlementPage.module.css';

const CHECK_ICONS: Record<string, ServiceIconName> = {
  classification: 'document',
  accounts: 'bank',
  buildings: 'building',
  charges: 'receipt',
  manual: 'arrow',
  external: 'alert'
};
const CHECK_TITLES: Record<string, string> = {
  classification: '거래 분류 확인',
  accounts: '통장 잔액 확인',
  buildings: '동별 시작 보유금',
  charges: '청구 정산 기준',
  manual: '수동 등록 중복',
  external: '외부 부담금 미회수'
};
const CHECK_DESCRIPTIONS: Record<string, string> = {
  classification: '미분류·보류·취소 내역',
  accounts: '확인시점·계산 잔액 비교',
  buildings: '기초·기말 잔고 설정',
  charges: '0원·음수 청구 확인',
  manual: '같은 통장·날짜·금액 비교',
  external: '정산 대상 미회수 내역'
};

/** 점검 대상이 없다는 표시를 업무 마감·대사 완료 상태로 오해하지 않도록 구분합니다. */
function getCheckLabel(id: string, count: number): string {
  if (count === 0) return '확인 항목 없음';
  if (id === 'external') return '미회수';
  return '확인 필요';
}

/** 월별 정산의 조회·점검·다운로드를 연결하고 원천 업무와 마감 상태는 변경하지 않습니다. */
export function MonthlySettlementPage({ propertyId }: { propertyId: string }) {
  const session = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const rawMonth = search.get('month');
  const validMonth = rawMonth === null || /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(rawMonth);
  const base = `/manage/${propertyId}`;
  const query = useQuery({
    queryKey: ['monthly-settlement', session.data?.id, propertyId, rawMonth],
    queryFn: () => getMonthlySettlement(propertyId, rawMonth ?? undefined),
    enabled: Boolean(session.data) && validMonth,
    retry: false,
    gcTime: 0
  });
  const [downloadData, setDownloadData] = useState<MonthlySettlementSnapshot | null>(null);
  const data = query.data;
  const ready = Boolean(data && !query.isFetching && !query.isError && validMonth);
  const report = ready && data ? getSettlementReport(data) : null;
  const month = validMonth ? rawMonth ?? data?.month ?? '' : '';
  const href = (path: string) => `${base}/${path}?month=${month}`;

  /** 월은 전체 정산 자료에 한 번 적용하고 선택한 상세 탭은 유지합니다. */
  function changeMonth(value: string) {
    const params = new URLSearchParams(search.toString());
    params.set('month', value);
    router.replace(`${base}/closing/monthly?${params}`, {
      scroll: false
    });
  }

  return (
    <div
      className={styles.page}
    >
      <ListHeader
        menu={'정산 / 마감'}
        title={'월별 정산'}
        description={'한 달의 입출금과 수납, 동별 자금과 확인할 일을 모아봅니다.'}
        titleId={'monthly-settlement-title'}
        className={styles.header}
        actionsClassName={styles['header-actions']}
        actions={(
          <div
            className={styles['header-controls']}
          >
            <div
              className={styles['header-buttons']}
            >
              <div
                className={styles['month-picker']}
              >
                <MonthPicker
                  label={'조회 월'}
                  labelHidden
                  value={month}
                  onChange={changeMonth}
                />
              </div>
              <Button
                variant={'outline'}
                leadingIcon={(
                  <ServiceIcon
                    name={'download'}
                  />
                )}
                disabled={!ready}
                onClick={() => { if (ready && data) setDownloadData(data); }}
              >
                다운로드
              </Button>
            </div>
            {data && validMonth && (
              <div
                className={styles.updated}
              >
                <span>
                  최종 조회
                </span>
                <time
                  dateTime={data.generatedAt}
                >
                  {new Date(data.generatedAt).toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </time>
                <Button
                  variant={'ghost'}
                  size={'sm'}
                  iconOnly
                  aria-label={'정산 자료 새로고침'}
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <ServiceIcon
                    name={'reset'}
                  />
                </Button>
              </div>
            )}
          </div>
        )}
      />
      {!validMonth && (
        <p
          role={'alert'}
        >
          조회할 월을 다시 선택해주세요.
        </p>
      )}
      {validMonth && query.isPending && (
        <LoadingState
          title={'월별 정산 자료를 불러오고 있어요.'}
        />
      )}
      {validMonth && query.isFetching && !query.isPending && (
        <p
          role={'status'}
        >
          최신 정산 자료를 확인하고 있어요.
        </p>
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch({
            cancelRefetch: false
          })}
        />
      )}
      {report && data && (
        <>
          <div
            className={styles.summary}
          >
            {([
              {
                label: '통장 입금',
                value: report.bankIncome,
                icon: 'wallet',
                tone: 'primary',
                description: '은행 원본·수동 등록 기준',
                help: '해당 월 은행 원본과 은행 미연결 확정 수동 입금입니다. 내부 이체도 포함합니다.'
              },
              {
                label: '통장 출금',
                value: report.bankExpense,
                icon: 'card',
                tone: 'warning',
                description: '외부 부담·내부 이체 포함',
                help: '해당 월 은행 원본과 수동 지출입니다. 외부 부담분과 내부 이체도 포함합니다.'
              },
              {
                label: '관리비 실제 수납',
                value: report.householdIncome,
                icon: 'coins',
                tone: 'success',
                description: '확정된 세대 입금 전액',
                help: '해당 월 확정된 세대 관리비 입금 전액입니다. 청구 충당액과 구분합니다.'
              },
              {
                label: '동별 보유금',
                value: report.buildingBalance,
                icon: 'building',
                tone: 'teal',
                description: '조회 월말 동별 합계',
                help: '조회 월말의 동별 보유금 합계입니다. 은행 확인 잔액과 구분합니다.'
              },
              {
                label: '청구 수납 반영액',
                value: report.applied,
                icon: 'receipt',
                tone: 'teal',
                description: '',
                help: '기존 월별 수납 표 기준입니다. 이전 선입금 충당을 포함해 실제 입금과 다를 수 있습니다.'
              },
              {
                label: '월별 수납 미수금',
                value: report.receivable,
                icon: 'document',
                tone: 'danger',
                description: '',
                help: '기존 월별 수납 대상 세대의 전월 이월 포함 잔여액입니다. 미정 청구가 있으면 정산 확인이 필요합니다.'
              },
              {
                label: '당월 청구액',
                value: report.billed,
                icon: 'coins',
                tone: 'neutral',
                description: '',
                help: '기존 월별 수납 표의 당월 발생액이며 0원·음수 원금액도 포함합니다.'
              },
              {
                label: '외부 미회수액',
                value: report.outstanding,
                icon: 'alert',
                tone: 'warning',
                description: '',
                help: '선택한 월에 지출한 외부 부담금 중 미회수액입니다. 정산 제외분은 합산하지 않습니다.'
              }
            ] as const).map((item) => (
              <SummaryCard
                key={item.label}
                label={item.label}
                value={item.value === null ? '확인 필요' : formatInteger(item.value)}
                unit={item.value === null ? '' : '원'}
                icon={(
                  <ServiceIcon
                    name={item.icon}
                  />
                )}
                density={'compact'}
                tone={item.tone}
                description={item.description || undefined}
                help={(
                  <InfoTooltip
                    size={'sm'}
                    label={`${item.label} 도움말`}
                    title={item.label}
                  >
                    {item.help}
                  </InfoTooltip>
                )}
              />
            ))}
          </div>
          <section
            className={styles.checklist}
            aria-labelledby={'settlement-checks'}
          >
            <div
              className={styles['checklist-heading']}
            >
              <div
                className={styles['checklist-title']}
              >
                <span
                  className={styles['checklist-icon']}
                >
                  <ServiceIcon
                    name={'check'}
                  />
                </span>
                <div>
                  <h2
                    id={'settlement-checks'}
                  >
                    월말 점검
                  </h2>
                  <p>
                    정산 자료에서 확인할 항목을 모아봤어요.
                  </p>
                </div>
              </div>
              <span
                className={styles['checklist-count']}
              >
                {report.checks.length}
                개 점검 항목
              </span>
            </div>
            <ul
              className={styles.checks}
            >
              {report.checks.map((row) => (
                <li
                  key={row.id}
                >
                  <Link
                    className={styles['check-card']}
                    href={href(row.path)}
                    aria-label={`${row.title} ${row.count}건`}
                    title={row.description}
                  >
                    <span
                      className={styles['check-card-heading']}
                    >
                      <ServiceIcon
                        name={CHECK_ICONS[row.id] ?? 'document'}
                      />
                      <strong>
                        {CHECK_TITLES[row.id] ?? row.title}
                      </strong>
                      <span
                        className={styles['check-count']}
                        data-active={row.count > 0}
                      >
                        {row.count}
                        건
                      </span>
                    </span>
                    <span
                      className={styles['check-description']}
                    >
                      {CHECK_DESCRIPTIONS[row.id] ?? row.description}
                    </span>
                    <span
                      className={styles['check-status']}
                      data-active={row.count > 0}
                    >
                      {getCheckLabel(row.id, row.count)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <SettlementDetails
            key={month}
            propertyId={propertyId}
            month={month}
            report={report}
          />
        </>
      )}
      {downloadData && downloadData.propertyId === propertyId && downloadData.month === month && (
        <SettlementDownload
          data={downloadData}
          onClose={() => setDownloadData(null)}
        />
      )}
    </div>
  );
}
