'use client';

import { useState } from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { formatInteger } from '@/shared/lib/format';
import { isValidMonth } from '@/shared/lib/month-range';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthPicker } from '@/shared/ui/month-picker';
import { RequestError } from '@/shared/ui/server-connection-error';
import { QueryRefresh } from '@/shared/ui/query-refresh';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { SummaryCard } from '@/shared/ui/summary-card';
import {
  BankAccountDetails,
  BankingExpensePage,
  BankingIncomeAllocation
} from '@/widgets/banking-workspace';
import {
  PaymentDetail,
  PaymentWorkspaceProvider
} from '@/widgets/payment-workspace';
import { getDashboard } from '../api/dashboardApi';
import { getDashboardReport } from '../model/dashboard';
import type { DashboardReport } from '../model/dashboardTypes';
import { DashboardAccounts } from './_components/dashboard-accounts/dashboardAccounts';
import { DashboardPaymentStatus } from './_components/dashboard-payment-status/dashboardPaymentStatus';
import { DashboardTasks } from './_components/dashboard-tasks/dashboardTasks';
import { DashboardTransactions } from './_components/dashboard-transactions/dashboardTransactions';
import { DashboardTrend } from './_components/dashboard-trend/dashboardTrend';
import styles from './managementDashboardPage.module.css';

/** 월별 자료와 현재 업무를 구분하고 실제 원천 조회가 성공한 범위만 대시보드로 표시합니다. */
export function ManagementDashboardPage({ propertyId }: { propertyId: string }) {
  const session = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const requestedMonth = search.get('month');
  const validMonth = requestedMonth === null || isValidMonth(requestedMonth);
  const base = `/manage/${propertyId}`;
  const query = useQuery({
    queryKey: ['dashboard', session.data?.id, propertyId, requestedMonth],
    queryFn: ({ signal }) => getDashboard(propertyId, requestedMonth ?? undefined, signal),
    enabled: Boolean(session.data) && validMonth,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60_000
  });
  const data = validMonth && !query.isError ? query.data : undefined;
  const month = validMonth ? requestedMonth ?? data?.month ?? '' : '';
  const report = data ? getDashboardReport(data) : null;
  const [detail, setDetail] = useState<{ id: string; kind: 'account' | 'receipt' | 'expense'; propertyId: string; month: string } | null>(null);
  const activeDetail = detail?.propertyId === propertyId && detail.month === month ? detail : null;
  const selectedAccount = data?.balances.accounts?.find((account) => account.id === activeDetail?.id);
  const href = (path: string) => `${base}/${path}?month=${month}`;

  function changeMonth(value: string) {
    const params = new URLSearchParams(search.toString());
    params.set('month', value);
    setDetail(null);
    router.replace(`${base}/dashboard?${params}`, {
      scroll: false
    });
  }

  /** PC는 기존 업무 모달을 재사용하고 모바일은 기존 상세와 목록 복귀 경로로 연결합니다. */
  function openTransaction(row: DashboardReport['recent'][number]) {
    const receipt = Boolean(row.paymentId && !row.transferId && !row.transferCandidate);
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`${base}/banking/${receipt ? `receipts/${row.paymentId}` : `transactions/${row.id}`}?month=${month}`);
      return;
    }
    setDetail({
      id: receipt ? row.paymentId! : row.id,
      kind: receipt ? 'receipt' : 'expense',
      propertyId,
      month
    });
  }

  function openAccount(id: string) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`${base}/banking/balances/details/account?month=${month}&target=${encodeURIComponent(id)}`);
      return;
    }
    setDetail({
      id,
      kind: 'account',
      propertyId,
      month
    });
  }

  /** 상세에서 처리한 결과는 원천을 다시 조회하며 저장 자체를 자동 반복하지 않습니다. */
  function closeDetail() {
    setDetail(null);
    void query.refetch();
  }

  return (
    <section
      className={styles.page}
      aria-labelledby={'dashboard-title'}
    >
      <ListHeader
        menu={'모아홈'}
        title={'대시보드'}
        titleId={'dashboard-title'}
        description={data ? `${data.propertyName}의 관리 현황을 한눈에 확인하세요.` : '관리 현황을 한눈에 확인하세요.'}
      />
      <div
        className={styles.controls}
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
        <QueryRefresh
          updatedAt={query.data?.generatedAt}
          refreshing={query.isFetching}
          failed={query.isError}
          disabled={!validMonth}
          label={'대시보드 새로고침'}
          onRefresh={() => void query.refetch({
            cancelRefetch: false
          })}
        />
      </div>
      {!validMonth && (
        <StateMessage
          variant={'no-results'}
          title={'조회 월을 확인해주세요.'}
          description={'달력에서 조회할 월을 다시 선택해주세요.'}
        />
      )}
      {validMonth && query.isPending && (
        <LoadingState
          title={'대시보드를 불러오고 있어요.'}
        />
      )}
      {validMonth && query.isFetching && !query.isPending && (
        <p
          className={styles.refreshing}
          role={'status'}
        >
          최신 관리 현황을 확인하고 있어요.
        </p>
      )}
      {validMonth && query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch({
            cancelRefetch: false
          })}
        />
      )}
      {data && report && (
        <>
          <div
            className={styles.summary}
          >
            {([
              {
                label: '선택 월 청구액',
                value: report.billed,
                icon: 'receipt',
                tone: 'primary',
                description: `${month} 신규 부과 기준`,
                help: '선택 월의 신규 청구액입니다. 기존 미수 인계와 전월 이월을 포함하지 않습니다. 0원·음수 청구의 정산은 별도 확인이 필요합니다.'
              },
              {
                label: '청구 납부반영액',
                value: report.applied,
                icon: 'check',
                tone: 'success',
                description: '선택 월 청구에 반영된 납부액',
                help: '선택 월 신규 청구에 충당한 납부액입니다. 이전 선입금에서 충당한 금액도 포함하며 실제 신규 입금액과 구분합니다.'
              },
              {
                label: '당월 청구 미수금',
                value: report.receivable,
                icon: 'alert',
                tone: 'danger',
                description: '선택 월 청구 중 남은 미납액',
                help: '선택 월 신규 청구에서 아직 충당하지 못한 금액입니다. 과거 미납은 이월 원장에서 확인하며 미정 청구가 있으면 확인 필요로 표시합니다.'
              },
              {
                label: '관리대상 부담 지출',
                value: report.expense,
                icon: 'wallet',
                tone: 'teal',
                description: `확정 지출 ${report.expenseCount}건 · 내부 이체 제외`,
                help: '선택 월의 확정 지출 중 관리대상 부담액입니다. 외부 부담분과 내부 이체·미분류 출금은 제외하며 동 구분 없는 지출은 전액을 포함합니다.'
              }
            ] as const).map((item) => (
              <SummaryCard
                key={item.label}
                label={item.label}
                value={item.value === null ? '확인 필요' : formatInteger(item.value)}
                unit={item.value === null ? '' : '원'}
                tone={item.tone}
                valueTone={item.tone === 'danger' || (item.value !== null && item.value < BigInt(0)) ? 'danger' : 'neutral'}
                density={'compact'}
                icon={(
                  <ServiceIcon
                    name={item.icon}
                  />
                )}
                description={item.description}
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
          <div
            className={styles.overview}
          >
            <DashboardTasks
              tasks={data.tasks}
              base={base}
              businessDate={data.businessDate}
            />
            <DashboardPaymentStatus
              report={report}
              href={href('banking/monthly')}
            />
            <DashboardAccounts
              report={report}
              href={href('banking/balances')}
              onOpen={openAccount}
            />
          </div>
          <div
            className={styles.activity}
          >
            <DashboardTransactions
              report={report}
              href={href('banking/transactions')}
              onOpen={openTransaction}
            />
            <DashboardTrend
              trend={report.trend}
              href={href('banking/monthly')}
            />
          </div>
        </>
      )}
      {activeDetail?.kind === 'account' && selectedAccount && (
        <ClientModal
          className={styles['account-modal']}
          aria-labelledby={'dashboard-account-title'}
          onClose={closeDetail}
          closeOnOutsideClick
        >
          <header>
            <h2
              id={'dashboard-account-title'}
            >
              통장 상세
            </h2>
            <Button
              variant={'ghost'}
              size={'sm'}
              iconOnly
              aria-label={'통장 상세 닫기'}
              onClick={closeDetail}
            >
              <ServiceIcon
                name={'close'}
              />
            </Button>
          </header>
          <BankAccountDetails
            propertyId={propertyId}
            account={selectedAccount}
            month={month}
          />
        </ClientModal>
      )}
      {activeDetail?.kind === 'expense' && (
        <BankingExpensePage
          key={activeDetail.id}
          propertyId={propertyId}
          transactionId={activeDetail.id}
          presentation={'modal'}
          onClose={closeDetail}
        />
      )}
      {activeDetail?.kind === 'receipt' && (
        <PaymentWorkspaceProvider
          propertyId={propertyId}
        >
          <PaymentDetail
            key={activeDetail.id}
            paymentId={activeDetail.id}
            menuLabel={'통장 관리'}
            onClose={closeDetail}
            onProcessed={closeDetail}
            renderSupplement={(onBusyChange) => (
              <BankingIncomeAllocation
                propertyId={propertyId}
                paymentId={activeDetail.id}
                onBusyChange={onBusyChange}
              />
            )}
          />
        </PaymentWorkspaceProvider>
      )}
    </section>
  );
}
