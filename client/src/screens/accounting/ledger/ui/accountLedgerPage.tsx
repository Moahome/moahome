'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  getSortedBuildings,
  isPropertyId
} from '@/entities/property';
import { useSession } from '@/entities/session';
import { PayableManager } from '@/features/payable-management';
import { BillingPeriodDetail } from '@/features/billing-management';
import { goBackToPreviousRoute } from '@/shared/lib/navigation-history';
import {
  BankingExpensePage,
  BankingIncomeAllocation
} from '@/widgets/banking-workspace';
import {
  MonthlyDetail,
  PaymentDetail,
  PaymentWorkspaceProvider
} from '@/widgets/payment-workspace';
import { RequestError } from '@/shared/ui/server-connection-error';
import { formatInteger } from '@/shared/lib/format';
import {
  getCurrentMonth,
  isValidMonthRange,
  setMonthRangeQuery
} from '@/shared/lib/month-range';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { Dropdown } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { ListCard } from '@/shared/ui/list-card';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';
import { Pagination } from '@/shared/ui/pagination';
import { useReportDownload } from '@/shared/ui/report-download';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { SummaryCard } from '@/shared/ui/summary-card';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { getAccountLedger } from '../api/accountLedgerApi';
import type {
  LedgerRow,
  LedgerSort
} from '../api/accountLedgerApiTypes';
import {
  getLedgerDateLabel,
  getLedgerSummary
} from '../model/accountLedgerReport';
import { sortLedger } from '../model/accountLedgerSort';
import { LedgerDownload } from './_components/ledger-download/ledgerDownload';
import styles from './accountLedgerPage.module.css';

/** 기존 통장·미수·선수금·손익 원본과 적용 조건을 같은 원장에서 조회합니다. */
export function AccountLedgerPage({ propertyId, presentation = 'main' }: { propertyId: string; presentation?: 'main' | 'billing' }) {
  const search = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const { openDownload } = useReportDownload();
  const base = `/manage/${propertyId}/accounting/ledger`;
  const queryString = search.toString();
  const accountIds = [...new Set(search.getAll('account'))].filter(Boolean).sort();
  const buildingId = search.get('building') ?? '';
  const bankAccountId = search.get('bank') ?? '';
  const requested = search.has('startMonth') || search.has('endMonth') ? {
    startMonth: search.get('startMonth') ?? '',
    endMonth: search.get('endMonth') ?? ''
  } : undefined;
  const valid = (!requested || isValidMonthRange(requested)) && accountIds.every(isPropertyId)
    && (!buildingId || isPropertyId(buildingId)) && (!bankAccountId || isPropertyId(bankAccountId));
  const query = useQuery({
    queryKey: ['account-ledger', session.data?.id, propertyId, requested?.startMonth, requested?.endMonth, buildingId, accountIds, bankAccountId],
    queryFn: ({ signal }) => getAccountLedger({
      propertyId,
      startMonth: requested?.startMonth,
      endMonth: requested?.endMonth,
      buildingId,
      bankAccountId,
      accountIds,
      signal
    }),
    enabled: Boolean(session.data) && valid,
    retry: false,
    gcTime: 0
  });
  const sort: LedgerSort = search.get('sort') === 'oldest' ? 'oldest' : 'latest';
  const data = query.data ? sortLedger(query.data, sort) : undefined;
  const totals = data ? getLedgerSummary(data) : null;
  const currentMonth = getCurrentMonth();
  const range = requested ?? data?.range ?? {
    startMonth: currentMonth,
    endMonth: currentMonth
  };
  const [selection, setSelection] = useState({
    key: queryString,
    range,
    accountIds,
    buildingId
  });
  const draft = selection.key === queryString ? selection : {
    key: queryString,
    range,
    accountIds,
    buildingId
  };
  const [payableSelection, setPayableSelection] = useState<{ id?: string } | null>(null);
  const [sourceRow, setSourceRow] = useState<LedgerRow | null>(null);
  const source = sourceRow?.entry.source;
  const pageSize = [10, 20, 50].includes(Number(search.get('size'))) ? Number(search.get('size')) : 10;
  const pageCount = Math.max(1, Math.ceil((data?.rows.length ?? 0) / pageSize));
  const requestedPage = Number(search.get('page'));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
  const ready = data && valid && !query.isFetching && !query.isError;
  const canShow = ready && data.supported && ['READY', 'REVIEW_REQUIRED'].includes(data.completeness);
  const buildings = getSortedBuildings((data?.buildings ?? []).filter((row) => !row.deleted || row.id === draft.buildingId));
  const accounts = [...(data?.accounts ?? [])].sort((left, right) => left.code.localeCompare(right.code));

  /** 조회 전 입력과 적용된 주소를 구분하고 새 조건에서는 첫 페이지부터 표시합니다. */
  function apply(nextRange = draft.range) {
    if (!isValidMonthRange(nextRange)) return;
    const params = setMonthRangeQuery(new URLSearchParams(search.toString()), nextRange);
    if (draft.accountIds.join(',') !== accountIds.join(',')) params.delete('bank');
    params.delete('account');
    draft.accountIds.forEach((id) => params.append('account', id));
    if (draft.buildingId) params.set('building', draft.buildingId);
    else params.delete('building');
    params.delete('page');
    router.replace(`${base}?${params}`, {
      scroll: false
    });
  }

  /** 표시 개수·페이지는 주소에만 반영하며 전체 누계와 다운로드 범위는 변경하지 않습니다. */
  function changePage(next: number, size = pageSize) {
    const params = new URLSearchParams(search.toString());
    params.set('page', String(next));
    params.set('size', String(size));
    router.replace(`${base}?${params}`, {
      scroll: false
    });
  }

  /** 기존 원본 상세를 PC 모달로 재사용하고 모바일에서는 기존 독립 상세 경로로 이동합니다. */
  function openSource(row: LedgerRow) {
    if (row.entry.source.kind === 'PAYABLE') {
      if (window.matchMedia('(max-width: 767px)').matches) router.push(`/manage/${propertyId}${row.entry.source.path}?${search}`);
      else setPayableSelection({
        id: row.entry.source.id!
      });
      return;
    }
    if (['BANK', 'TRANSFER', 'EXTERNAL', 'OPENING_CREDIT'].includes(row.entry.source.kind)) {
      router.push(`/manage/${propertyId}${row.entry.source.path}`);
      return;
    }
    if (window.matchMedia('(max-width: 767px)').matches) {
      if (row.entry.source.kind === 'BILLING') {
        const params = new URLSearchParams(search.toString());
        params.set('item', row.entry.id);
        router.push(`${base}/billing?${params}`);
        return;
      }
      router.push(`/manage/${propertyId}${row.entry.source.path}`);
      return;
    }
    setSourceRow(row);
  }

  function closeSource() {
    setSourceRow(null);
    void query.refetch();
  }

  const incomeParams = setMonthRangeQuery(new URLSearchParams(), range);
  if (buildingId) incomeParams.set('building', buildingId);
  if (presentation === 'billing') {
    if (query.isFetching) return (
      <LoadingState
        title={'부과 내역을 불러오고 있어요.'}
      />
    );
    if (query.isError) return (
      <RequestError
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
    const selected = data?.rows.find((row) => row.entry.id === search.get('item') && row.entry.source.kind === 'BILLING');
    if (!selected) return (
      <StateMessage
        variant={'not-found'}
        title={'부과 내역을 찾을 수 없습니다.'}
      />
    );
    return (
      <BillingPeriodDetail
        propertyId={propertyId}
        month={selected.entry.month}
        itemIds={selected.sourceIds.map((id) => id.slice(7))}
        expectedAmount={selected.entry.amount}
        presentation={'page'}
        onClose={() => {
          if (goBackToPreviousRoute()) return;
          const params = new URLSearchParams(search.toString());
          params.delete('item');
          router.replace(`${base}?${params}`);
        }}
      />
    );
  }
  return (
    <div
      className={styles.page}
    >
      <ListHeader
        menu={'회계·정산'}
        title={'계정별 원장'}
        titleId={'account-ledger-title'}
        description={'계정과목별 반영 내역과 원본 거래를 확인합니다.'}
        actionsClassName={styles['header-actions']}
        actions={(
          <>
            <Button
              variant={'outline'}
              disabled={!canShow}
              leadingIcon={(
                <ServiceIcon
                  name={'download'}
                />
              )}
              onClick={() => {
                if (!canShow) return;
                openDownload({
                  pageHref: `${base}/download?${search}`,
                  render: (presentation, onClose) => (
                    <LedgerDownload
                      data={data}
                      presentation={presentation}
                      onClose={onClose}
                    />
                  )
                });
              }}
            >
              다운로드
            </Button>
          </>
        )}
      />
      <form
        className={styles.filters}
        aria-label={'원장 조회 조건'}
        onSubmit={(event) => { event.preventDefault(); apply(); }}
      >
        <MonthRangePicker
          label={'조회 기간'}
          labelHidden
          value={draft.range}
          referenceMonth={currentMonth}
          onChange={(value) => { setSelection({
            ...draft,
            range: value
          }); apply(value); }}
        />
        <Dropdown
          aria-label={'계정과목'}
          placeholder={query.isError ? '계정과목 조회 실패' : '계정과목'}
          multiple
          value={draft.accountIds}
          options={[
            {
              value: '',
              label: '전체 계정과목'
            },
            ...accounts.map((account) => ({
              value: account.id,
              label: `${account.code} ${account.name}`
            }))
          ]}
          onChange={(value) => setSelection({
            ...draft,
            accountIds: value
          })}
        />
        <Dropdown
          aria-label={'조회 동'}
          placeholder={query.isError ? '조회 동 확인 필요' : '조회 동'}
          value={draft.buildingId}
          options={[
            {
              value: '',
              label: '전체 동'
            },
            ...buildings.map((building) => ({
              value: building.id,
              label: `${building.name}${building.deleted ? ' (삭제된 동)' : ''}`
            }))
          ]}
          onChange={(value) => setSelection({
            ...draft,
            buildingId: value
          })}
        />
        <Button
          type={'submit'}
          leadingIcon={(
            <ServiceIcon
              name={'search'}
            />
          )}
        >
          조회
        </Button>
      </form>
      {!valid && (
        <StateMessage
          variant={'no-results'}
          title={'조회 기간·과목·동을 다시 선택해주세요.'}
        />
      )}
      {valid && query.isFetching && (
        <LoadingState
          title={'원장 자료를 불러오고 있어요.'}
        />
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {ready && data.completeness === 'SETUP_REQUIRED' && (
        <StateMessage
          variant={'review-required'}
          title={'회계 시작 기준을 설정해주세요.'}
          description={'손익계산서에서 설정한 회계 시작 기준을 함께 사용합니다.'}
          actions={(
            <Link
              href={`/manage/${propertyId}/accounting/income-statement`}
            >
              손익계산서
            </Link>
          )}
        />
      )}
      {ready && data.completeness === 'BEFORE_START' && (
        <StateMessage
          variant={'no-results'}
          title={'회계 시작 월 이전의 기간입니다.'}
          description={`회계 시작 월: ${data.configuration?.startMonth}`}
        />
      )}
      {ready && data.completeness === 'NO_BILLING' && (
        <StateMessage
          variant={'no-results'}
          title={'부과 시작 기준을 확인해주세요.'}
          description={'관리비의 첫 부과월부터 원장을 조회할 수 있습니다.'}
        />
      )}
      {canShow && (
        <>
          {data.issues.length > 0 && (
            <div
              className={styles.review}
              role={'note'}
            >
              <span>
                확인 필요
                {' '}
                {data.issues.length}
                건 · 현재 조회의 전체 과목 기준이며 미반영 금액은 합계에서 제외됩니다.
              </span>
              <Link
                href={`/manage/${propertyId}/accounting/income-statement/sources?${incomeParams}`}
              >
                확인 내역
              </Link>
            </div>
          )}
          <section
            className={styles.summary}
            aria-label={'원장 요약'}
          >
            <SummaryCard
              density={'compact'}
              label={totals![0].label}
              value={formatInteger(totals![0].value)}
              unit={'원'}
              tone={'primary'}
              help={(
                <InfoTooltip
                  size={'sm'}
                  label={`${totals![0].label} 도움말`}
                  title={totals![0].label}
                >
                  {totals![0].label === '증가 반영액'
                    ? '선택한 기간·계정·동에 반영된 증가액의 합계입니다. 현재 잔액이 아닌 조회 기간의 증가 내역입니다.'
                    : '선택한 기간·계정·동에 반영된 수익 합계입니다. 관리비는 부과 기준으로 반영하므로 실제 입금액과 다릅니다.'}
                </InfoTooltip>
              )}
              icon={(
                <ServiceIcon
                  name={'arrow'}
                  className={styles['increase-icon']}
                />
              )}
            />
            <SummaryCard
              density={'compact'}
              label={totals![1].label}
              value={formatInteger(totals![1].value)}
              unit={'원'}
              tone={'neutral'}
              help={(
                <InfoTooltip
                  size={'sm'}
                  label={`${totals![1].label} 도움말`}
                  title={totals![1].label}
                >
                  {totals![1].label === '감소 반영액'
                    ? '표에 음수로 표시한 감소액의 합계입니다. 현재 잔액이 아닌 조회 기간의 감소 내역입니다.'
                    : '선택한 기간·계정·동에 반영된 비용 합계입니다. 확인 필요로 제외된 금액은 포함하지 않습니다.'}
                </InfoTooltip>
              )}
              icon={(
                <ServiceIcon
                  name={'arrow'}
                  className={styles['decrease-icon']}
                />
              )}
            />
            <SummaryCard
              density={'compact'}
              label={'반영 내역'}
              value={String(data.rows.length)}
              unit={'건'}
              tone={'teal'}
              help={(
                <InfoTooltip
                  size={'sm'}
                  label={'반영 내역 도움말'}
                  title={'반영 내역'}
                >
                  조회 조건에 해당하는 전체 원장 행 수입니다. 부과는 월·계정별 합계 한 건으로 표시하며, 같은 원본이 여러 계정에 반영될 수 있어 통장 거래 건수와 다를 수 있습니다.
                </InfoTooltip>
              )}
              icon={(
                <ServiceIcon
                  name={'document'}
                />
              )}
            />
          </section>
          <ListCard>
            <section
              className={styles.ledger}
              aria-label={'계정별 거래 내역'}
            >
              <ListToolbar
                total={data.rows.length}
                unit={'건'}
                sizeLabel={'원장 표시 개수'}
                pageSize={pageSize}
                onSizeChange={(size) => changePage(1, size)}
                actions={(
                  <>
                    {data.accounts.find((account) => account.id === data.accountId)?.systemKey === 'BANK' && (
                      <Dropdown
                        aria-label={'조회 계좌'}
                        value={bankAccountId}
                        options={[{
                          value: '',
                          label: '전체 계좌'
                        }, ...data.bankBalances.map((bank) => ({
                          value: bank.accountId,
                          label: bank.name
                        }))]}
                        onChange={(value) => {
                          const params = new URLSearchParams(search.toString());
                          if (value) params.set('bank', value); else params.delete('bank');
                          params.delete('page');
                          router.replace(`${base}?${params}`, {
                            scroll: false
                          });
                        }}
                      />
                    )}
                    <Dropdown
                      aria-label={'원장 정렬'}
                      value={sort}
                      options={[
                        {
                          value: 'latest',
                          label: '최신순'
                        },
                        {
                          value: 'oldest',
                          label: '오래된순'
                        }
                      ]}
                      onChange={(value) => {
                        const params = new URLSearchParams(search.toString());
                        if (value === 'latest') params.delete('sort');
                        else params.set('sort', value);
                        params.delete('page');
                        router.replace(`${base}?${params}`, {
                          scroll: false
                        });
                      }}
                    />
                  </>
                )}
              />
              <DataTable
                label={'계정별 원장'}
                rows={data.rows.slice((page - 1) * pageSize, page * pageSize)}
                getRowKey={(row) => row.entry.id}
                emptyState={(
                  <StateMessage
                    variant={'no-results'}
                    layout={'inline'}
                    title={'선택한 조건의 반영 내역이 없습니다.'}
                    description={'조회 기간이나 계정과목·동 조건을 변경해주세요.'}
                  />
                )}
                minWidth={1000}
                onRowClick={openSource}
                columns={[
                  {
                    key: 'account',
                    header: '계정과목',
                    render: ({ entry }) => `${accounts.find((account) => account.id === entry.accountId)?.code} ${entry.accountName}`
                  },
                  {
                    key: 'name',
                    header: '적요',
                    rowHeader: true,
                    render: ({ entry }) => (
                      <span
                        className={styles.description}
                      >
                        {entry.source.name}
                      </span>
                    )
                  },
                  {
                    key: 'building',
                    header: '동',
                    render: ({ entry }) => data.buildings.find((building) => building.id === entry.buildingId)?.name ?? '전체'
                  },
                  {
                    key: 'month',
                    header: '귀속 월',
                    render: ({ entry }) => entry.month
                  },
                  {
                    key: 'date',
                    header: getLedgerDateLabel(data),
                    render: ({ entry }) => entry.source.date ?? '—'
                  },
                  {
                    key: 'amount',
                    header: '반영액',
                    align: 'right',
                    render: ({ entry }) => (
                      <span
                        className={BigInt(entry.amount) < BigInt(0) ? styles.negative : undefined}
                      >
                        {formatInteger(BigInt(entry.amount))}
                        원
                      </span>
                    )
                  },
                  {
                    key: 'cumulative',
                    header: data.bankBalances.length ? '장부 잔액 / 기간 누계' : '과목별 기간 누계',
                    align: 'right',
                    render: (row) => (
                      <span
                        className={BigInt(row.cashBalance ? row.cashBalance.ledgerBalance ?? '0' : row.cumulativeAmount) < BigInt(0) ? styles.negative : undefined}
                      >
                        {row.cashBalance ? (row.cashBalance.ledgerBalance === null ? '확인 필요' : `${formatInteger(BigInt(row.cashBalance.ledgerBalance))}원`) : `${formatInteger(BigInt(row.cumulativeAmount))}원`}
                      </span>
                    )
                  },
                ]}
              />
              <Pagination
                label={'원장 페이지'}
                unit={'건'}
                total={data.rows.length}
                page={page}
                pageCount={pageCount}
                pageSize={pageSize}
                onPageChange={changePage}
              />
            </section>
          </ListCard>
        </>
      )}
      {payableSelection && (
        <PayableManager
          propertyId={propertyId}
          payableId={payableSelection.id}
          onCreated={(id) => setPayableSelection({
            id
          })}
          onClose={() => { setPayableSelection(null); void query.refetch(); }}
        />
      )}
      {source?.kind === 'EXPENSE' && (
        <BankingExpensePage
          propertyId={propertyId}
          transactionId={source.path.split('/').at(-1)!}
          presentation={'modal'}
          onClose={closeSource}
        />
      )}
      {source?.kind === 'BILLING' && sourceRow && (
        <BillingPeriodDetail
          propertyId={propertyId}
          month={sourceRow.entry.month}
          itemIds={sourceRow.sourceIds.map((id) => id.slice(7))}
          expectedAmount={sourceRow.entry.amount}
          presentation={'modal'}
          onClose={closeSource}
        />
      )}
      {source && !['EXPENSE', 'BILLING'].includes(source.kind) && (
        <PaymentWorkspaceProvider
          propertyId={propertyId}
        >
          {['CHARGE', 'RECEIVABLE'].includes(source.kind) ? (
            <MonthlyDetail
              month={source.path.split('/')[3]}
              unitId={source.path.split('/')[4].split('?')[0]}
              onClose={closeSource}
            />
          ) : (
            <PaymentDetail
              paymentId={source.id!}
              menuLabel={'통장 관리'}
              onClose={closeSource}
              onProcessed={() => {}}
              renderSupplement={(onBusyChange) => (
                <BankingIncomeAllocation
                  propertyId={propertyId}
                  paymentId={source.id!}
                  onBusyChange={onBusyChange}
                />
              )}
            />
          )}
        </PaymentWorkspaceProvider>
      )}
    </div>
  );
}
