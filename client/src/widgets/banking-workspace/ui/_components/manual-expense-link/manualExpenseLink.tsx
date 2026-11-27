import { Button } from '@/shared/ui/button';
import type { BankingTransaction } from '../../../api/bankingApiTypes';
import { getManualExpenseLinkCandidates } from '../../../model/manualExpenseLink';
import { useManualExpenseLink } from '../../_hooks/useManualExpenseLink';
import { ManualExpenseChoice } from './manualExpenseChoice';
import styles from './manualExpenseLink.module.css';

/** 수동 지출 상세와 은행 미확정 출금 상세에서 같은 명시적 연결 흐름을 제공합니다. */
export function ManualExpenseLink({
  propertyId,
  row,
  rows,
  busy,
  onBusyChange,
  onLinked
}: {
  propertyId: string;
  row: BankingTransaction;
  rows: readonly BankingTransaction[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onLinked: () => void;
}) {
  const state = useManualExpenseLink(propertyId, row, onBusyChange, onLinked);
  const candidates = getManualExpenseLinkCandidates(row, rows);
  if (!candidates.length && !state.error)
    return null;

  return (
    <div
      className={styles.link}
    >
      <ManualExpenseChoice
        row={row}
        rows={rows}
        value={state.selectedId}
        disabled={busy}
        onChange={state.setSelectedId}
      />
      {state.error && (
        <p
          role={'alert'}
        >
          {state.error}
        </p>
      )}
      <Button
        variant={'outline'}
        disabled={busy || !candidates.some((candidate) => candidate.id === state.selectedId)}
        loading={busy}
        onClick={() => void state.connect()}
      >
        기존 지출 연결
      </Button>
    </div>
  );
}
