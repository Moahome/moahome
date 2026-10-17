import type {
  BankingTransaction,
  BankingWorkspaceData,
  ExpenseDraft
} from '../api/bankingApi';

/** API 반환 순서와 관계없이 동 이름의 숫자를 기준으로 표시하며 저장된 배열은 변경하지 않습니다. */
export function sortExpenseLabels<T extends { label: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, 'ko', {
    numeric: true
  }));
}

/** 선택한 동의 실제 부담액만 합산해 외부 부담액·은행 출금 원액과 구분합니다. */
export function getExpenseAmount(row: BankingTransaction, buildingIds: readonly string[]): bigint {
  const selected = new Set(buildingIds);
  return row.expense?.allocations.reduce((sum, part) => (
    part.buildingId && selected.has(part.buildingId) ? sum + BigInt(part.amount) : sum
  ), BigInt(0)) ?? BigInt(0);
}

/** 저장한 내용별 설정을 제안하고, 처음 보는 거래는 원본 내용을 지출명으로 채워 현재 관리 동에 나눕니다. */
export function createExpenseDraft(row: BankingTransaction, workspace: BankingWorkspaceData): ExpenseDraft {
  const rule = row.direction === 'EXPENSE' && workspace.rules.find((item) => item.accountId === row.accountId && item.key === row.ruleKey);
  if (rule) return {
    category: rule.category,
    note: '',
    mode: rule.mode,
    saveAsRule: false,
    allocations: sortExpenseLabels(rule.allocations).map((a) => ({
      ...a
    }))
  };
  return {
    category: row.payer.trim().slice(0, 100),
    note: '',
    mode: 'EQUAL',
    saveAsRule: false,
    allocations: sortExpenseLabels(workspace.buildings).map((building) => ({
      buildingId: building.id,
      label: building.label,
      amount: '',
      percentage: ''
    }))
  };
}
/** 금액은 정수로 계산하고 원 미만 나머지는 숨기지 않고 직접 조정하도록 표시합니다. */
export function calculateExpenseAllocation(total: string, draft: ExpenseDraft, purpose: 'expense' | 'income' = 'expense') {
  const amount = BigInt(total);
  let fractional = false;
  let ratio = BigInt(0);
  const allocations = draft.allocations.map((share) => {
    let result = BigInt(0);
    if (draft.mode === 'EQUAL' && draft.allocations.length) {
      const count = BigInt(draft.allocations.length); result = amount / count;
      fractional ||= amount % count !== BigInt(0);
    } else if (draft.mode === 'RATIO') {
      const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(share.percentage ?? '');
      const rate = match ? BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0')) : BigInt(0);
      ratio += rate; result = amount * rate / BigInt(10000);
      fractional ||= amount * rate % BigInt(10000) !== BigInt(0);
    } else if (/^\d{1,15}$/.test(share.amount)) result = BigInt(share.amount);
    return {
      ...share,
      amount: result.toString()
    };
  });
  const allocated = allocations.reduce((sum, a) => sum + BigInt(a.amount), BigInt(0));
  const remaining = amount - allocated;
  let error = '';
  if (!draft.category.trim()) error = purpose === 'income' ? '입금 항목을 입력해주세요.' : '지출명을 입력해주세요.';
  else if (!allocations.length || allocations.some((a) => !a.label.trim() || BigInt(a.amount) <= BigInt(0))) error = purpose === 'income' ? '배분할 동과 0원보다 큰 금액을 입력해주세요.' : '부담할 곳과 0원보다 큰 금액을 입력해주세요.';
  else if (draft.mode === 'RATIO' && ratio !== BigInt(10000)) error = '비율 합계를 100%로 맞춰주세요.';
  else if (fractional) error = '원 미만 금액이 남습니다. 금액 직접 입력으로 조정해주세요.';
  else if (remaining !== BigInt(0)) error = purpose === 'income' ? '배분액 합계를 입금액과 맞춰주세요.' : '부담액 합계를 출금액과 맞춰주세요.';
  const keys = allocations.map((a) => a.buildingId ?? `external:${a.label.trim()}`);
  if (new Set(keys).size !== keys.length) error = purpose === 'income' ? '같은 동이 중복되어 있어요.' : '같은 부담처가 중복되어 있어요.';
  return {
    allocations,
    allocated,
    remaining,
    error
  };
}
