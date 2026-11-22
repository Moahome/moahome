'use client';

import { BALANCE_SETTLEMENT_FILTER_OPTIONS } from '../../../../constant/bankingOptions';

import { useBankingBalances } from '../../_hooks/useBankingBalances';
import {
  Dropdown,
  Input,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { getExternalExpensesForRange } from '../../../../model/balanceLedger';
import { sortExpenseLabels } from '../../../../model/expenseAllocation';
import { PagedTable } from '../balance-common/balanceCommon';
import { formatBalanceMoney } from '../../../../lib/balanceMoney';
import styles from './balanceSettlements.module.css';
type Props = Pick<Extract<ReturnType<typeof useBankingBalances>, {
  kind: 'ready';
}> & Parameters<typeof useBankingBalances>[0], 'incomeBuilding' | 'setIncomeBuilding' | 'incomeSearch' | 'setIncomeSearch' | 'externalFilter' | 'setExternalFilter' | 'externalSearch' | 'setExternalSearch' | 'data' | 'openPanel'>;
/** BalanceSettlements에 필요한 표시와 공통 UI를 조합합니다. */
export function BalanceSettlements({
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
}:Props) {
  return (<>
    <section
      className={styles.card}
      id={'external-settlements'}
    >
      <h2>
        외부 부담금 정산
      </h2>
      <p
        className={styles.muted}
      >
        선택한 기간의 외부 지출입니다. 먼저 받은 외부 보관금이나 실제 기타 입금을 연결한 만큼 정산에 반영합니다.
      </p>
      <PagedTable
        label={'외부 부담금'}
        hasFilters={Boolean(externalSearch.trim() || externalFilter !== 'ALL')}
        rows={getExternalExpensesForRange(data).filter((row) => (externalFilter === 'UNRECOVERED' ? !row.excluded && BigInt(row.remaining) > BigInt(0) : externalFilter === 'ALL' || Boolean(row.excluded) === (externalFilter === 'EXCLUDED')) && `${row.label} ${row.expenseName}`.includes(externalSearch.trim())).sort((a, b) => b.date.localeCompare(a.date))}
        toolbar={(
          <>
            <Input
              label={'외부 부담금 검색'}
              placeholder={'부담처·지출명 검색'}
              value={externalSearch}
              onChange={(event) => setExternalSearch(event.target.value)}
            />
            <Dropdown
              label={'정산 대상'}
              value={externalFilter}
              onChange={setExternalFilter}
              options={BALANCE_SETTLEMENT_FILTER_OPTIONS}
            />
          </>
        )}
        onRowClick={(row) => openPanel('settlement', row.id)}
        columns={[
          {
            key: 'date',
            header: '거래일',
            render: (e) => e.date
          }, {
            key: 'name',
            header: '지출명',
            render: (e) => e.expenseName
          }, {
            key: 'target',
            header: '부담처',
            render: (e) => e.label
          },
          {
            key: 'amount',
            header: '부담액',
            render: (e) => formatBalanceMoney(e.amount)
          }, {
            key: 'received',
            header: '회수액',
            render: (e) => formatBalanceMoney(e.received)
          }, {
            key: 'remaining',
            header: '남은 금액',
            render: (e) => formatBalanceMoney(e.remaining)
          },
          {
            key: 'state',
            header: '상태',
            render: (e) => (
              <span
                className={styles.badge}
                data-done={!e.excluded && BigInt(e.remaining) === BigInt(0)}
                data-excluded={e.excluded}
              >
                {e.excluded ? '정산 제외' : BigInt(e.remaining) === BigInt(0) ? '정산 완료' : BigInt(e.received) > BigInt(0) ? '일부 회수' : '회수 필요'}
              </span>
            )
          }
        ]}
      />
    </section>
    {data.buildings.length > 0 && data.incomes.some((i) => i.kind === 'HOUSEHOLD') && (
      <section
        className={styles.card}
      >
        <h2>
          입금 귀속 동 확인
        </h2>
        <p
          className={styles.muted}
        >
          세대가 연결된 확정 입금은 해당 동에 자동 반영됩니다. 세대 연결이나 동 정보가 없는 입금만 확인해주세요.
        </p>
        <PagedTable
          label={'입금 귀속 동 확인'}
          hasFilters={Boolean(incomeSearch.trim() || incomeBuilding !== 'ALL')}
          rows={data.incomes.filter((i) => i.kind === 'HOUSEHOLD'
              && (incomeBuilding === 'ALL' || (incomeBuilding === 'UNKNOWN' ? !i.linkedBuildingId : i.linkedBuildingId === incomeBuilding))
              && `${i.payer} ${i.linkedUnitLabel ?? ''}`.replace(/\s/g, '').includes(incomeSearch.trim().replace(/\s/g, '')))}
          toolbar={(
            <>
              <Input
                label={'입금 검색'}
                placeholder={'입금자 또는 연결 세대 검색'}
                value={incomeSearch}
                onChange={(event) => setIncomeSearch(event.target.value)}
              />
              <SelectDropdown
                label={'연결 세대 동'}
                value={incomeBuilding}
                onChange={setIncomeBuilding}
                options={[
                  {
                    value: 'ALL',
                    label: '전체 동'
                  },
                  {
                    value: 'UNKNOWN',
                    label: '세대 미확인'
                  },
                  ...sortExpenseLabels(data.buildings).map((b) => ({
                    value: b.id,
                    label: b.label
                  }))
                ]}
              />
            </>
          )}
          onRowClick={(i) => openPanel('assignment', i.id)}
          columns={[
            {
              key: 'date',
              header: '입금일',
              render: (i) => i.date
            }, {
              key: 'payer',
              header: '입금자',
              render: (i) => i.payer
            }, {
              key: 'unit',
              header: '연결 세대',
              render: (i) => i.linkedUnitLabel ?? '세대 미확인'
            }, {
              key: 'amount',
              header: '입금액',
              render: (i) => formatBalanceMoney(i.amount)
            }, {
              key: 'action',
              header: '확인',
              render: () => '귀속 동 지정'
            }
          ]}
        />
      </section>
    )}
  </>);
}
