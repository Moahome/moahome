import {
  MANUAL_EXPENSE_LINK_OPTIONS,
  NEW_EXPENSE_CHOICE
} from '../../../constant/bankingOptions';
import { Dropdown } from '@/shared/ui/form-controls';
import { formatWon } from '@/shared/lib/format';
import type { BankingTransaction } from '../../../api/bankingApiTypes';
import { getManualExpenseLinkCandidates } from '../../../model/manualExpenseLink';
import styles from './manualExpenseLink.module.css';

/** 후보가 하나여도 자동 연결하지 않고 관리자가 거래 내용과 기존 배분을 확인하게 합니다. */
export function ManualExpenseChoice({
  row,
  rows,
  value,
  onChange,
  disabled,
  importing = false
}: {
  row: BankingTransaction;
  rows: readonly BankingTransaction[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  importing?: boolean;
}) {
  const candidates = getManualExpenseLinkCandidates(row, rows);
  if (!candidates.length && !value)
    return null;
  const selected = candidates.find((candidate) => candidate.id === value);

  return (
    <section
      className={styles.choice}
      aria-label={'기존 지출 연결'}
    >
      <Dropdown
        label={row.sourceType === 'MANUAL' ? '연결할 은행 출금' : '기존 수동 지출'}
        value={value}
        placeholder={'처리 방법 선택'}
        disabled={disabled}
        options={[
          MANUAL_EXPENSE_LINK_OPTIONS[importing ? 'importing' : 'saved'],
          ...candidates.map((candidate, index) => ({
            value: candidate.id,
            label: `${candidate.expense?.category ?? candidate.payer} · ${formatWon(candidate.amount)} · ${candidate.expense?.note || candidate.memo || candidate.date} (${index + 1})`
          }))
        ]}
        onChange={onChange}
      />
      <p>
        같은 통장·거래일·금액의 기록이 있어요. 같은 거래인지 확인한 뒤 연결하면 한 번만 반영합니다.
      </p>
      {selected?.expense && (
        <p>
          {selected.expense.allocations.map((part) => `${part.label} ${formatWon(part.amount)}`).join(' / ') || '관리대상 전체 부담'}
          {selected.expense.note ? ` · ${selected.expense.note}` : ''}
        </p>
      )}
      {value && value !== NEW_EXPENSE_CHOICE && !selected && (
        <p
          role={'alert'}
        >
          선택한 거래가 변경됐어요. 최신 목록에서 다시 선택해주세요.
        </p>
      )}
    </section>
  );
}
