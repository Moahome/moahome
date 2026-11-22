'use client';

import { BuildingFilter } from '@/entities/property';

import {
  BalanceAccountContent,
  BalanceAccountEditor
} from './_components/balance-account-panels/balanceAccountPanels';

import { BalanceOverview } from './_components/balance-overview/balanceOverview';
import { BalanceSettlements } from './_components/balance-settlements/balanceSettlements';
import { LoadingState } from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';
import { useBankingBalancesQuery } from './_hooks/useBankingBalancesQuery';
import { useBankingBalances } from './_hooks/useBankingBalances';
import { getBankAccountLabel } from '@/entities/banking';

import { Button } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { MonthRangePicker } from '@/shared/ui/month-range-picker';
import { setMonthRangeQuery } from '@/shared/lib/month-range';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { OpeningBalanceAction } from './_components/balance-common/balanceCommon';
import { ChartDialog } from './_components/balance-chart/balanceChart';
import { BuildingLedger } from './_components/building-ledger/buildingLedger';
import { BankInitialBalanceEditor } from './_components/balance-account-panels/balanceAccountPanels';
import { BankAccountHistory } from './_components/balance-account-panels/balanceAccountPanels';
import { DetailDialog } from './_components/balance-common/balanceCommon';
import { BalanceActionDialog } from './_components/balance-operations/balanceOperations';
import styles from './bankingBalances.module.css';

/** 기간·통장·동 조회 조건을 유지하며 실제 서버 잔고와 외부 입금 연결을 표시합니다. */
export function BankingBalances(props: Parameters<typeof useBankingBalances>[0]) {
  const loadedQuery = useBankingBalancesQuery(props.propertyId);
  if (loadedQuery.isPending)
    return (
      <LoadingState
        title={'잔고를 불러오고 있어요.'}
      />
    );
  if (!loadedQuery.data)
    return (
      <RequestError
        error={loadedQuery.error}
        onRetry={() => void loadedQuery.refetch({
          cancelRefetch: false
        })}
      />
    );

  return (
    <BankingBalancesContent
      {...props}
      loadedQuery={loadedQuery}
    />
  );
}

function BankingBalancesContent({
  loadedQuery,
  ...props
}: Parameters<typeof useBankingBalances>[0] & { loadedQuery: ReturnType<typeof useBankingBalancesQuery> }) {
  const {
    propertyId,
    renderReceiptDetail
  } = props;

  const state = useBankingBalances(props, loadedQuery);

  if (state.kind === 'history') {
    const {
      propertyId,
      closePage,
      params
    } = state;

    return (
      <BankAccountHistory
        propertyId={propertyId}
        accountId={params.get('target') ?? ''}
        presentation={'page'}
        onClose={closePage}
      />
    );
  }

  if (state.kind === 'initial') {
    const {
      propertyId,
      target,
      closePage,
      data,
      saved
    } = state;

    return target ? (
      <BankInitialBalanceEditor
        key={target.id}
        propertyId={propertyId}
        account={target}
        data={data}
        presentation={'page'}
        onClose={closePage}
        onSaved={() => saved('초기 잔액을 정정했어요.')}
      />
    ) : (
      <p>
        해당 통장을 찾을 수 없습니다.
      </p>
    );
  }

  if (state.kind === 'account') {
    const {
      closePage,
      params,
      accountContent,
      accountEditor
    } = state;

    return (
      <DetailDialog
        title={'통장 상세'}
        className={styles['account-dialog']}
        presentation={'page'}
        onClose={closePage}
      >
        <BalanceAccountContent
          {...accountContent}
          targetId={params.get('target')}
        />
        <BalanceAccountEditor
          {...accountEditor}
        />
      </DetailDialog>
    );
  }

  if (state.kind === 'chart') {
    const {
      closePage,
      filtered
    } = state;

    return (
      <ChartDialog
        buildings={filtered}
        presentation={'page'}
        onClose={closePage}
      />
    );
  }

  if (state.kind === 'operation') {
    const {
      propertyId,
      panel,
      closePage,
      params,
      data,
      saved
    } = state;

    return (
      <BalanceActionDialog
        key={`${panel}-${params.get('target') ?? ''}`}
        action={{
          kind: panel,
          id: params.get('target') ?? undefined
        }}
        data={data}
        propertyId={propertyId}
        presentation={'page'}
        onClose={closePage}
        onSaved={saved}
      />
    );
  }

  if (state.kind === 'ledger') {
    const {
      propertyId,
      renderReceiptDetail,
      periodLabel,
      data,
      detailBuilding
    } = state;

    return (
      <section
        className={styles.page}
      >
        <ListHeader
          className={styles.header}
          titleId={'balance-title'}
          menu={'통장 관리'}
          title={detailBuilding ? `${detailBuilding.label} 상세 원장` : '동별 상세 원장'}
          description={`${periodLabel} 기준 실제 입금과 부담 지출입니다.`}
        />
        {detailBuilding ? (
          <BuildingLedger
            building={detailBuilding}
            data={data}
            propertyId={propertyId}
            renderReceiptDetail={renderReceiptDetail}
          />
        ) : (
          <p>
            해당 동의 원장을 찾을 수 없습니다.
          </p>
        )}
      </section>
    );
  }

  const {
    context,
    router,
    params,
    range,
    month,
    startMonth,
    search,
    setSearch,
    sort,
    setSort,
    filter,
    setFilter,
    incomeBuilding,
    setIncomeBuilding,
    incomeSearch,
    setIncomeSearch,
    externalFilter,
    setExternalFilter,
    externalSearch,
    setExternalSearch,
    detail,
    setDetail,
    accountDetailId,
    setAccountDetailId,
    editingAccountId,
    historyAccountId,
    setHistoryAccountId,
    initialAccountId,
    chartOpen,
    setChartOpen,
    action,
    setAction,
    notice,
    setNotice,
    exporting,
    downloadButton,
    query,
    data,
    summary,
    selectedAccount,
    bankBalance,
    bankLabel,
    bankAsOf,
    bankHelp,
    differenceDescription,
    missing,
    buildings,
    selectedBuilding,
    filtered,
    detailBuilding,
    closeInitial,
    saved,
    openDetail,
    openPanel,
    download,
    accountContent,
    accountEditor
  } = state;

  return (
    <section
      className={styles.page}
    >
      <ListHeader
        className={styles.header}
        actionsClassName={styles['header-actions']}
        titleId={'balance-title'}
        menu={'통장 관리'}
        title={'잔고·정산'}
        description={data.buildings.length > 0 ? '은행 거래를 기준으로 각 동의 보유금과 외부 부담금을 확인합니다.' : '은행 거래를 기준으로 통장 잔액과 외부 부담금을 확인합니다.'}
        actions={(
          <>
            <div
              className={styles['action-buttons']}
            >
              {/* 동별 기준값을 다루는 진입이므로 대상 동이 없거나 기한이 끝나면 도움말까지 제거합니다. */}
              {data.buildings.length > 0 && data.initialCorrectionAllowed !== false && (
                <OpeningBalanceAction
                  missing={missing.length > 0}
                  onOpen={() => openPanel('opening', selectedAccount?.id)}
                />
              )}
              {/* 내려받기는 동별 귀속 명세이므로 동 없는 대상에서 빈 명세를 전체 통장 자료로 표시하지 않습니다. */}
              {data.buildings.length > 0 && (
              <Button
                variant={'outline'}
                ref={downloadButton}
                loading={exporting}
                disabled={query.isFetching || query.isError || !context.data?.name}
                onClick={() => {
                  void download();
                }}
                leadingIcon={(
                  <ServiceIcon
                    name={'download'}
                  />
                )}
              >
                다운로드
              </Button>
              )}
            </div>
          </>
        )}
      />
      <section
        className={styles['query-card']}
        aria-label={'조회 조건'}
      >
        <div
          className={styles['query-controls']}
          data-has-buildings={data.buildings.length > 0}
        >
          <div
            className={styles['month-control']}
          >
            <MonthRangePicker
              label={'조회 기간'}
              labelHidden
              value={range}
              onChange={(value) => {
                setDetail(null);
                const next = setMonthRangeQuery(new URLSearchParams(params.toString()), value);
                router.replace(`?${next}`, {
                  scroll: false
                });
              }}
            />
          </div>
          {!!data.accounts?.length && (
            <Dropdown
              aria-label={'조회 통장'}
              value={selectedAccount?.id ?? 'ALL'}
              onChange={(value) => {
                const next = new URLSearchParams(params.toString());
                next.set('account', value);
                router.replace(`?${next}`, {
                  scroll: false
                });
              }}
              options={[{
                value: 'ALL',
                label: '전체 통장'
              }, ...data.accounts.map((account) => ({
                value: account.id,
                label: getBankAccountLabel(account)
              }))]}
            />
          )}
          {data.buildings.length > 0 && (
          <BuildingFilter
            aria-label={'조회 동'}
            value={selectedBuilding?.id ?? 'ALL'}
            onChange={(value) => {
              const next = new URLSearchParams(params.toString());
              if (value === 'ALL')
                next.delete('building');
              else
                next.set('building', value);
              setDetail(null);
              router.replace(`?${next}`, {
                scroll: false
              });
            }}
            buildings={buildings.map((building) => ({
              value: building.id,
              label: building.label
            }))}
            allValue={'ALL'}
          />
          )}
        </div>
      </section>
      {data.cutoffDate && (
        <p
          className={styles['calculation-note']}
        >
          잔고 기준일
          {' '}
          {data.cutoffDate}
          {' '}
        </p>
      )}
      <BalanceOverview
        {...{
          month,
          startMonth,
          search,
          setSearch,
          sort,
          setSort,
          filter,
          setFilter,
          data,
          summary,
          selectedAccount,
          bankBalance,
          bankLabel,
          bankAsOf,
          bankHelp,
          differenceDescription,
          selectedBuilding,
          filtered,
          openDetail,
          openPanel,
        }}
      />

      <BalanceSettlements
        {...{
          incomeBuilding,
          setIncomeBuilding,
          incomeSearch,
          setIncomeSearch,
          externalFilter,
          setExternalFilter,
          externalSearch,
          setExternalSearch,
          data,
          openPanel
        }}
      />

      {initialAccountId && data.accounts?.find((row) => row.id === initialAccountId) && (
        <BankInitialBalanceEditor
          propertyId={propertyId}
          data={data}
          account={data.accounts.find((row) => row.id === initialAccountId)!}
          onClose={closeInitial}
          onSaved={async () => {
            await saved('초기 잔액을 정정했어요.');
            closeInitial();
          }}
        />
      )}
      {accountDetailId && !editingAccountId && !historyAccountId && (
        <DetailDialog
          title={'통장 상세'}
          className={styles['account-dialog']}
          onClose={() => setAccountDetailId(null)}
        >
          <BalanceAccountContent
            {...accountContent}
            targetId={accountDetailId}
          />
        </DetailDialog>
      )}
      <BalanceAccountEditor
        {...accountEditor}
      />
      {historyAccountId && (
        <BankAccountHistory
          propertyId={propertyId}
          accountId={historyAccountId}
          onClose={() => setHistoryAccountId(null)}
        />
      )}
      {chartOpen && (
        <ChartDialog
          buildings={filtered}
          onClose={() => setChartOpen(false)}
        />
      )}
      {detailBuilding && detail && (
        <DetailDialog
          title={`${detailBuilding.label} 상세 원장`}
          onClose={() => setDetail(null)}
        >
          <BuildingLedger
            building={detailBuilding}
            data={data}
            propertyId={propertyId}
            renderReceiptDetail={renderReceiptDetail}
          />
        </DetailDialog>
      )}
      {action && (
        <BalanceActionDialog
          key={`${action.kind}-${action.id ?? ''}`}
          action={action}
          data={data}
          propertyId={propertyId}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}
      {notice && (
        <Toast
          message={notice.message}
          tone={notice.tone}
          onClose={() => setNotice(null)}
        />
      )}
    </section>
  );

}
