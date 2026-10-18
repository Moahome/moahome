export type BankingAllocation = { buildingId: string | null; label: string; amount: string; percentage: string | null };
export type ExpenseDraft = {
  category: string; note: string; mode: 'EQUAL' | 'RATIO' | 'AMOUNT'; saveAsRule: boolean; allocations: BankingAllocation[];
};

/** API 반환 순서와 관계없이 동 이름의 숫자를 기준으로 표시하며 저장된 배열은 변경하지 않습니다. */
export function sortExpenseLabels<T extends { label: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, 'ko', {
    numeric: true
  }));
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
