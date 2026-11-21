'use client';
import { useBankingWorkspace } from '../../_hooks/useBankingWorkspace';
import { formatInteger } from '@/shared/lib/format';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import { type CSSProperties } from 'react';
import styles from './bankingTransactionResults.module.css';
type Props = Pick<ReturnType<typeof useBankingWorkspace>['results'],
 | 'view'
 | 'summaryColumns'
 | 'preview'
 | 'showIncome'
 | 'summaryDescription'
 | 'income'
 | 'showExpense'
 | 'periodLabel'
 | 'buildingExpense'
 | 'expense'
 | 'netAmount'
 | 'baseRows'
 | 'status'>;

/** 통장 목록의 금액 요약을 표시합니다. */
export function BankingTransactionSummary({
  view,
  summaryColumns,
  preview,
  showIncome,
  summaryDescription,
  income,
  showExpense,
  periodLabel,
  buildingExpense,
  expense,
  netAmount,
  baseRows
}: Props) {
  return (
    <div
      className={styles.summary}
      data-view={view}
      style={{
        '--summary-columns': summaryColumns
      } as CSSProperties}
    >
      {(preview || showIncome) && (
      <SummaryCard
        density={'compact'}
        label={'입금 합계'}
        help={(
          <InfoTooltip
            size={'sm'}
            label={'입금 합계 도움말'}
            title={'입금 합계'}
          >
            {summaryDescription}
          </InfoTooltip>
        )}
        value={formatInteger(income)}
        unit={'원'}
        tone={'success'}
        icon={(
          <ServiceIcon
            name={'coins'}
          />
        )}
      />
      )}
      {(preview || showExpense || view === 'expenses') && (
      <SummaryCard
        density={'compact'}
        label={view === 'expenses' ? '지출 합계' : '출금 합계'}
        tone={view === 'expenses' ? 'warning' : 'neutral'}
        help={(
          <InfoTooltip
            size={'sm'}
            label={view === 'expenses' ? '지출 합계 도움말' : '출금 합계 도움말'}
            title={view === 'expenses' ? '지출 합계' : '출금 합계'}
          >
            {view === 'expenses' ? `${periodLabel} 기준` : summaryDescription}
          </InfoTooltip>
        )}
        value={formatInteger(view === 'expenses' ? buildingExpense : expense)}
        unit={'원'}
        icon={(
          <ServiceIcon
            name={'receipt'}
          />
        )}
      />
      )}
      {view !== 'expenses' && (
      <SummaryCard
        density={'compact'}
        label={'입출금 차액'}
        help={(
          <InfoTooltip
            size={'sm'}
            label={'입출금 차액 도움말'}
            title={'입출금 차액'}
          >
            입금 합계 − 출금 합계
          </InfoTooltip>
        )}
        value={formatInteger(netAmount)}
        unit={'원'}
        valueTone={netAmount < BigInt(0) ? 'danger' : 'neutral'}
        icon={(
          <ServiceIcon
            name={'coins'}
          />
        )}
      />
      )}
      {view !== 'expenses' && (
      <SummaryCard
        density={'compact'}
        label={'확인 필요'}
        help={(
          <InfoTooltip
            size={'sm'}
            label={'확인 필요 도움말'}
            title={'확인 필요'}
          >
            {`조회 거래 ${baseRows.length}건 중 처리를 확인해야 하는 거래 건수입니다.`}
          </InfoTooltip>
        )}
        value={baseRows.filter((row) => row.status === 'PENDING').length}
        unit={'건'}
        tone={'warning'}
        icon={(
          <ServiceIcon
            name={'info'}
          />
        )}
      />
      )}

    </div>
  );
}
