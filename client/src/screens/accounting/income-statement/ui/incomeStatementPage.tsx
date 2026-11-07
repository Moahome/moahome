'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { goBackToPreviousRoute } from '@/shared/lib/navigation-history';
import {
  getSortedBuildings,
  isPropertyId
} from '@/entities/property';
import { RequestError } from '@/shared/ui/server-connection-error';
import { LoadingState } from '@/shared/ui/state-message';
import { getIncomeStatementWorkspace } from '../api/incomeStatementApi';
import {
  AccountingEditor,
  type AccountingEditorTarget
} from './_components/accounting-editor/accountingEditor';
import { IncomeSource } from './_components/income-source/incomeSource';
import { AccountingChecks } from './_components/accounting-checks/accountingChecks';
import { formatInteger } from '@/shared/lib/format';
import {
  formatMonthRange,
  getCurrentMonth,
  isValidMonthRange,
  setMonthRangeQuery
} from '@/shared/lib/month-range';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { Dropdown } from '@/shared/ui/form-controls';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';
import { useReportDownload } from '@/shared/ui/report-download';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { StateMessage } from '@/shared/ui/state-message';
import { SummaryCard } from '@/shared/ui/summary-card';
import { getIncomeStatement } from '../model/incomeStatement';
import { IncomeDownload } from './_components/income-download/incomeDownload';
import { IncomeTrend } from './_components/income-trend/incomeTrend';
import styles from './incomeStatementPage.module.css';

/** 서버가 권한·원천·확인 상태를 검사한 자료만 조회 조건별 손익과 보고서에 연결합니다. */
export function IncomeStatementPage({ propertyId, presentation = 'main' }: {
  propertyId: string;
  presentation?: 'main' | 'sources' | 'review';
}) {
  const search = useSearchParams();
  const router = useRouter();
  const { openDownload } = useReportDownload();
  const filterQuery = new URLSearchParams(search.toString());
  for (const key of ['view', 'sources', 'sourceStatus', 'sourcePage', 'sourceSize', 'kind', 'item']) filterQuery.delete(key);
  const queryKey = filterQuery.toString();
  const session = useSession();
  const cache = useQueryClient();
  const buildingId = search.get('building') ?? '';
  const requested = search.has('startMonth') || search.has('endMonth')
    ? {
      startMonth: search.get('startMonth') ?? '',
      endMonth: search.get('endMonth') ?? ''
    }
    : search.has('month') ? {
      startMonth: search.get('month') ?? '',
      endMonth: search.get('month') ?? ''
    } : undefined;
  const validQuery = (!requested || isValidMonthRange(requested)) && (!buildingId || isPropertyId(buildingId));
  const query = useQuery({
    queryKey: ['income-statement', session.data?.id, propertyId, requested?.startMonth, requested?.endMonth, buildingId],
    queryFn: ({ signal }) => getIncomeStatementWorkspace({
      propertyId,
      startMonth: requested?.startMonth,
      endMonth: requested?.endMonth,
      buildingId,
      signal
    }),
    enabled: Boolean(session.data) && validQuery,
    retry: false,
    gcTime: 0
  });
  const data = query.data;
  const currentMonth = getCurrentMonth();
  const range = requested && validQuery ? requested : data?.range ?? {
    startMonth: currentMonth,
    endMonth: currentMonth
  };
  const checksOpen = search.get('sources') === '1';
  const [source, setSource] = useState<string | null>(null);
  const [editor, setEditor] = useState<AccountingEditorTarget | null>(null);
  const [selection, setSelection] = useState({
    queryKey,
    range,
    buildingId
  });
  // 주소 복귀·직접 접근은 주소의 조건을 복원하고 조회 전 편집은 결과에 먼저 반영하지 않습니다.
  const draft = selection.queryKey === queryKey ? selection : {
    queryKey,
    range,
    buildingId
  };
  // 삭제 동은 신규 선택에서 제외하되 과거 주소로 명시한 동의 ID와 원천 연결은 유지합니다.
  const selectableBuildings = getSortedBuildings((data?.buildings ?? []).filter((building) => !building.deleted || building.id === draft.buildingId));
  const cumulative = search.get('view') === 'cumulative';
  const ready = data && validQuery && !query.isFetching && !query.isError;
  const report = ready && ['READY', 'REVIEW_REQUIRED'].includes(data.completeness) ? getIncomeStatement(data, range, buildingId) : null;
  const base = `/manage/${propertyId}/accounting/income-statement`;

  /** 원천 상세에서 모바일 뒤로가기를 하면 확인 목록의 필터·페이지도 함께 복원합니다. */
  function setChecksOpen(open: boolean) {
    const params = new URLSearchParams(search.toString());
    if (open) {
      params.set('sources', '1');
      params.set('sourceStatus', data?.issues.length ? 'pending' : 'all');
      if (window.matchMedia('(max-width: 767px)').matches) {
        params.delete('sources');
        router.push(`${base}/sources?${params}`);
        return;
      }
    } else {
      for (const key of ['sources', 'sourceStatus', 'sourcePage', 'sourceSize']) params.delete(key);
    }
    router.replace(`${base}${params.size ? `?${params}` : ''}`, {
      scroll: false
    });
  }

  /** 모바일은 독립 페이지로 이동하고 PC는 목록 대신 분류 모달 하나만 표시합니다. */
  function openEditor(target: AccountingEditorTarget) {
    if (!window.matchMedia('(max-width: 767px)').matches) {
      setEditor(target);
      return;
    }
    const params = new URLSearchParams(search.toString());
    params.delete('sources');
    params.set('kind', target.kind);
    params.set('item', target.value.id);
    router.push(`${base}/review?${params}`);
  }

  /** 기기 뒤로가기와 같은 이전 화면을 사용하며 직접 접근 때만 같은 대상의 목록으로 대체합니다. */
  function closeEditor() {
    if (presentation !== 'review') {
      setEditor(null);
      return;
    }
    const params = new URLSearchParams(search.toString());
    params.delete('kind');
    params.delete('item');
    if (!goBackToPreviousRoute()) router.replace(`${base}/sources?${params}`);
  }

  /** 주소의 ID는 현재 관리대상 응답에서만 찾아 다른 대상·삭제 원천을 입력 화면에 연결하지 않습니다. */
  function getPageEditor(): AccountingEditorTarget | null {
    const item = search.get('item');
    if (search.get('kind') === 'expense') {
      const value = data?.expenses.find((value) => value.id === item);
      return value ? {
        kind: 'expense',
        value
      } : null;
    }
    if (search.get('kind') === 'revenue') {
      const value = data?.revenueItems.find((value) => value.id === item);
      return value ? {
        kind: 'revenue',
        value
      } : null;
    }
    return null;
  }

  /** 기간 선택창의 조회와 바깥 조회 버튼을 같은 처리로 연결하며 확정한 새 기간을 바로 주소에 반영합니다. */
  function applyFilters(nextRange = draft.range) {
    if (!isValidMonthRange(nextRange)) return;
    const params = setMonthRangeQuery(new URLSearchParams(search.toString()), nextRange);
    if (draft.buildingId) params.set('building', draft.buildingId);
    else params.delete('building');
    router.replace(`${base}?${params}`, {
      scroll: false
    });
  }

  /** 모바일 다운로드에서 복귀해도 월별·누계 선택을 같은 주소에서 복원합니다. */
  function changeMode(value: boolean) {
    const params = new URLSearchParams(search.toString());
    if (value) params.set('view', 'cumulative');
    else params.delete('view');
    router.replace(`${base}${params.size ? `?${params}` : ''}`, {
      scroll: false
    });
  }

  if (presentation !== 'main') {
    if (!validQuery) return (
      <StateMessage
        variant={'no-results'}
        title={'조회 기간·동을 다시 선택해주세요.'}
      />
    );
    if (query.isError) return (
      <RequestError
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
    if (!data || query.isPending) return (
      <LoadingState
        title={'손익 자료를 불러오고 있어요.'}
      />
    );
    if (presentation === 'sources') return (
      <AccountingChecks
        data={data}
        presentation={'page'}
        onClose={() => { if (!goBackToPreviousRoute()) router.replace(base); }}
        onEdit={openEditor}
        onSource={(path) => router.push(`/manage/${propertyId}${path}`)}
      />
    );
    const target = getPageEditor();
    if (!data.canManage) return (
      <StateMessage
        variant={'forbidden'}
        title={'분류 권한이 없습니다.'}
      />
    );
    if (!target) return (
      <StateMessage
        variant={'not-found'}
        title={'분류할 자료를 찾을 수 없습니다.'}
      />
    );
    return (
      <AccountingEditor
        propertyId={propertyId}
        data={data}
        target={target}
        presentation={'page'}
        onClose={closeEditor}
        onSaved={async () => { await cache.invalidateQueries({
          queryKey: ['income-statement', session.data?.id, propertyId]
        }); }}
      />
    );
  }

  return (
    <div
      className={styles.page}
    >
      <ListHeader
        menu={'회계·정산'}
        title={'손익계산서'}
        titleId={'income-statement-title'}
        description={'선택 기간의 수익·비용과 순손익을 한눈에 확인합니다.'}
        className={styles.header}
        actions={(
          <Button
            variant={'outline'}
            disabled={!report}
            leadingIcon={(
              <ServiceIcon
                name={'download'}
              />
            )}
            onClick={() => {
              if (!report) return;
              openDownload({
                pageHref: `${base}/download?${search.toString()}`,
                render: (presentation, onClose) => (
                  <IncomeDownload
                    report={report}
                    cumulative={cumulative}
                    presentation={presentation}
                    onClose={onClose}
                  />
                )
              });
            }}
          >
            다운로드
          </Button>
        )}
      />
      <div
        className={styles.notice}
        role={'note'}
      >
        <ServiceIcon
          name={'info'}
        />
        <div>
          <strong>
            {data?.completeness === 'REVIEW_REQUIRED' ? `잠정 손익 · 확인 필요 ${data.issues.length}건` : '등록·확인 자료 기준'}
          </strong>
          <span>
            {data?.notice ?? '부과월 수익과 관리자가 확인한 지출 귀속 월을 기준으로 조회합니다.'}
          </span>
        </div>
        {report && data && (data.issues.length > 0 || data.expenses.length > 0 || data.revenueItems.length > 0
          || (data.receivables?.length ?? 0) > 0 || (data.otherIncomes?.length ?? 0) > 0
          || (data.households?.length ?? 0) > 0) && (
          <Button
            variant={'outline'}
            size={'sm'}
            onClick={() => setChecksOpen(true)}
          >
            {data.issues.length ? `확인 필요 ${data.issues.length}건` : '반영 내역'}
          </Button>
        )}
      </div>
      <form
        className={styles.filters}
        aria-label={'손익 조회 조건'}
        onSubmit={(event) => { event.preventDefault(); applyFilters(); }}
      >
        <Dropdown
          aria-label={'조회 동'}
          value={draft.buildingId}
          options={[{
            value: '',
            label: '전체 동'
          }, ...selectableBuildings.map((building) => ({
            value: building.id,
            label: building.deleted ? `${building.name} (삭제된 동)` : building.name
          }))]}
          onChange={(buildingId) => setSelection({
            ...draft,
            buildingId
          })}
        />
        <MonthRangePicker
          label={'조회 기간'}
          labelHidden
          value={draft.range}
          referenceMonth={currentMonth}
          onChange={(range) => {
            setSelection({
              ...draft,
              range
            });
            applyFilters(range);
          }}
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
      {!validQuery && (
        <StateMessage
          variant={'no-results'}
          title={'조회 기간·동을 다시 선택해주세요.'}
        />
      )}
      {validQuery && query.isPending && (
        <LoadingState
          title={'손익 자료를 불러오고 있어요.'}
        />
      )}
      {validQuery && query.isFetching && !query.isPending && (
        <LoadingState
          title={'최신 손익 자료를 확인하고 있어요.'}
        />
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch({
            cancelRefetch: false
          })}
        />
      )}
      {ready && ['NO_BILLING', 'SETUP_REQUIRED'].includes(data.completeness) && (
        <StateMessage
          variant={'no-results'}
          title={'아직 확정된 관리비 부과가 없습니다.'}
          description={'첫 부과월을 기준으로 회계 자료가 자동 연결됩니다.'}
        />
      )}
      {ready && data.completeness === 'BEFORE_START' && (
        <StateMessage
          variant={'no-results'}
          title={'첫 부과월 이전의 기간입니다.'}
          description={`첫 부과월: ${data.configuration?.startMonth}. 조회 기간을 다시 선택해주세요.`}
        />
      )}
      {report && (
        <>
          <section
            className={styles.summary}
            aria-label={'기간 손익 요약'}
          >
            {([
              {
                label: '수익 합계',
                value: report.revenue,
                icon: 'coins',
                tone: 'primary',
                help: '선택한 기간·동의 운영수익과 영업외수익 합계입니다.'
              },
              {
                label: '비용 합계',
                value: report.expense,
                icon: 'receipt',
                tone: 'neutral',
                help: '선택한 기간·동의 운영비용과 영업외비용 합계입니다.'
              },
              {
                label: '기간 순손익',
                value: report.profit,
                icon: 'chart',
                tone: 'teal',
                help: '선택한 기간의 수익 합계에서 비용 합계를 뺀 금액입니다.'
              }
            ] as const).map((item) => (
              <SummaryCard
                key={item.label}
                density={'compact'}
                label={item.label}
                value={formatInteger(item.value)}
                unit={'원'}
                tone={item.tone}
                valueTone={item.value < BigInt(0) ? 'danger' : 'neutral'}
                icon={(
                  <ServiceIcon
                    name={item.icon}
                  />
                )}
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
          </section>
          <div
            className={styles.content}
          >
            <section
              className={styles.statement}
              aria-labelledby={'income-accounts-title'}
            >
              <div
                className={styles['panel-heading']}
              >
                <div>
                  <h2
                    id={'income-accounts-title'}
                  >
                    손익계산서
                  </h2>
                  <p>
                    {formatMonthRange(report.range)}
                    {' · '}
                    {report.buildingName}
                  </p>
                </div>
                <span>
                  단위: 원
                </span>
              </div>
              <DataTable
                label={'계정과목별 손익계산서'}
                rows={report.rows}
                getRowKey={(row) => row.id}
                minWidth={300}
                emptyState={'선택한 기간의 자료가 없습니다.'}
                columns={[
                  {
                    key: 'account',
                    header: '계정과목',
                    rowHeader: true,
                    render: (row) => (
                      <span
                        className={styles['row-label']}
                        data-row-kind={row.kind}
                      >
                        {row.kind === 'account' ? (
                          <Link
                            href={`/manage/${propertyId}/accounting/ledger?${new URLSearchParams({
                              startMonth: report.range.startMonth,
                              endMonth: report.range.endMonth,
                              account: row.id.split(':').at(-1)!,
                              ...(buildingId ? {
                                building: buildingId
                              } : {})
                            })}`}
                          >
                            {row.label}
                          </Link>
                        ) : row.label}
                      </span>
                    )
                  },
                  {
                    key: 'amount',
                    header: '기간 합계',
                    align: 'right',
                    render: (row) => (
                      <span
                        className={styles.money}
                        data-negative={row.amount < BigInt(0)}
                      >
                        {formatInteger(row.amount)}
                      </span>
                    )
                  }
                ]}
              />
            </section>
            <IncomeTrend
              report={report}
              cumulative={cumulative}
              onModeChange={changeMode}
            />
          </div>
        </>
      )}
      {checksOpen && data && !editor && !source && (
        <AccountingChecks
          data={data}
          onClose={() => setChecksOpen(false)}
          onEdit={openEditor}
          onSource={(path) => {
            if (window.matchMedia('(max-width: 767px)').matches || path.startsWith('/billing/') || path.startsWith('/banking/balances') || path === '/banking/transactions') {
              router.push(`/manage/${propertyId}${path}`);
              return;
            }
            setSource(path);
          }}
        />
      )}
      {source && (
        <IncomeSource
          propertyId={propertyId}
          path={source}
          onClose={() => {
            setSource(null);
            void cache.invalidateQueries({
              queryKey: ['income-statement', session.data?.id, propertyId]
            });
          }}
        />
      )}
      {editor && data && data.canManage && (
        <AccountingEditor
          propertyId={propertyId}
          data={data}
          target={editor}
          onClose={closeEditor}
          onSaved={async () => { await cache.invalidateQueries({
            queryKey: ['income-statement', session.data?.id, propertyId]
          }); }}
        />
      )}
    </div>
  );
}
