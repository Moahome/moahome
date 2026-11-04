'use client';

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
import { isPropertyId } from '@/entities/property';
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
export function IncomeStatementPage({ propertyId }: { propertyId: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const { openDownload } = useReportDownload();
  const filterQuery = new URLSearchParams(search.toString());
  for (const key of ['view', 'sources', 'sourceStatus', 'sourcePage', 'sourceSize']) filterQuery.delete(key);
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
    } else {
      for (const key of ['sources', 'sourceStatus', 'sourcePage', 'sourceSize']) params.delete(key);
    }
    router.replace(`${base}${params.size ? `?${params}` : ''}`, {
      scroll: false
    });
  }

  /** 조회 버튼으로 적용한 조건을 주소에 기록해 뒤로가기·새로고침에도 같은 조회 자료를 표시합니다. */
  function applyFilters() {
    if (!isValidMonthRange(draft.range)) return;
    const params = setMonthRangeQuery(new URLSearchParams(search.toString()), draft.range);
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
        {report && data && (data.issues.length > 0 || data.expenses.length > 0 || data.revenueItems.length > 0) && (
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
        <MonthRangePicker
          label={'조회 기간'}
          value={draft.range}
          referenceMonth={currentMonth}
          onChange={(range) => setSelection({
            ...draft,
            range
          })}
        />
        <Dropdown
          label={'조회 동'}
          value={draft.buildingId}
          options={[{
            value: '',
            label: '전체 동'
          }, ...(data?.buildings ?? []).map((building) => ({
            value: building.id,
            label: building.name
          }))]}
          onChange={(buildingId) => setSelection({
            ...draft,
            buildingId
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
      {ready && data.completeness === 'SETUP_REQUIRED' && (
        <StateMessage
          variant={'review-required'}
          title={'회계 시작 기준을 설정해주세요.'}
          description={data.canManage ? '확인할 회계 시작 월과 회계연도 시작 월을 지정한 뒤 자료를 연결합니다.' : '관리소장에게 회계 시작 기준 설정을 요청해주세요.'}
          actions={data.canManage && (
            <Button
              onClick={() => setEditor({
                kind: 'setup'
              })}
            >
              회계 시작 설정
            </Button>
          )}
        />
      )}
      {ready && data.completeness === 'BEFORE_START' && (
        <StateMessage
          variant={'no-results'}
          title={'회계 시작 월 이전의 기간입니다.'}
          description={`회계 시작 월: ${data.configuration?.startMonth}. 조회 기간을 다시 선택해주세요.`}
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
                        {row.label}
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
      {checksOpen && data && (
        <AccountingChecks
          data={data}
          onClose={() => setChecksOpen(false)}
          onEdit={setEditor}
          onSource={(path) => {
            if (window.matchMedia('(max-width: 767px)').matches || path.startsWith('/billing/') || path === '/banking/transactions') {
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
          onClose={() => setEditor(null)}
          onSaved={async () => { await cache.invalidateQueries({
            queryKey: ['income-statement', session.data?.id, propertyId]
          }); }}
        />
      )}
    </div>
  );
}
