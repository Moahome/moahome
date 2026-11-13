import type {
  ExpenseDraft,
  ExpenseAllocationResult
} from './allocationTypes';

/** API 반환 순서와 관계없이 동 이름의 숫자를 기준으로 표시하며 저장된 배열은 변경하지 않습니다. */
export function sortExpenseLabels<T extends { label: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, 'ko', {
    numeric: true
  }));
}

/** 금액은 정수로 계산하고 원 미만 나머지는 숨기지 않고 직접 조정하도록 표시합니다. */
export function calculateExpenseAllocation(total: string, draft: ExpenseDraft, purpose: 'expense' | 'income' = 'expense'): ExpenseAllocationResult {
  // 동 없는 관리대상의 지출은 전액 공용으로 기록하며 가상의 동이나 외부 부담액을 생성하지 않습니다.
  if (draft.mode === 'PROPERTY') {
    const amount = /^[0-9]{1,15}$/.test(total) ? BigInt(total) : BigInt(0);
    return {
      allocations: [],
      allocated: amount,
      remaining: BigInt(0),
      canFillRatioRemainder: false,
      allocationError: purpose !== 'expense' ? '입금 배분 방법을 확인해주세요.' : amount <= BigInt(0) ? '0원보다 큰 출금액을 입력해주세요.' : '',
      error: purpose !== 'expense' ? '입금 배분 방법을 확인해주세요.' : !draft.category.trim() ? '지출명을 입력해주세요.' : amount <= BigInt(0) ? '0원보다 큰 출금액을 입력해주세요.' : ''
    };
  }
  const amount = BigInt(total);
  let fractional = false;
  let ratio = BigInt(0);
  let validRatios = true;
  const allocations = draft.allocations.map((share) => {
    let result = BigInt(0);
    if (draft.mode === 'EQUAL' && draft.allocations.length) {
      const count = BigInt(draft.allocations.length); result = amount / count;
      fractional ||= amount % count !== BigInt(0);
    } else if (draft.mode === 'RATIO') {
      const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(share.percentage ?? '');
      const rate = match ? BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0')) : BigInt(0);
      validRatios &&= match !== null && rate > BigInt(0) && rate <= BigInt(10000);
      ratio += rate; result = amount * rate / BigInt(10000);
      fractional ||= amount * rate % BigInt(10000) !== BigInt(0);
    } else if (/^\d{1,15}$/.test(share.amount)) result = BigInt(share.amount);
    return {
      ...share,
      amount: result.toString()
    };
  });
  let allocated = allocations.reduce((sum, a) => sum + BigInt(a.amount), BigInt(0));
  let remaining = amount - allocated;
  const canAdjustRatio = purpose === 'expense' && draft.mode === 'RATIO' && validRatios && ratio === BigInt(10000)
    && fractional && remaining > BigInt(0);
  // 비율을 유지하면서 관리자가 선택한 한 곳에만 절사 후 나머지 전액을 더합니다.
  // 원본 금액·비율·대상이 달라져 저장한 금액과 맞지 않으면 선택을 재사용하지 않습니다.
  if (canAdjustRatio && draft.allocations.every((share) => /^[0-9]{1,15}$/.test(share.amount))) {
    const adjusted = draft.allocations.map((share, index) => BigInt(share.amount) - BigInt(allocations[index].amount));
    const recipients = adjusted.flatMap((difference, index) => difference === remaining ? [index] : []);
    if (recipients.length === 1 && adjusted.every((difference, index) => index === recipients[0] || difference === BigInt(0))) {
      const remainderIndex = recipients[0];
      allocations[remainderIndex].amount = draft.allocations[remainderIndex].amount;
      allocated = amount;
      remaining = BigInt(0);
      fractional = false;
    }
  }
  // 항목명 누락과 배분 검증을 분리해 필수 입력 때문에 정상 금액까지 경고로 표시하지 않습니다.
  let allocationError = '';
  if (!allocations.length || allocations.some((a) => !a.label.trim() || BigInt(a.amount) <= BigInt(0))) allocationError = purpose === 'income' ? '배분할 동과 0원보다 큰 금액을 입력해주세요.' : '부담할 곳과 0원보다 큰 금액을 입력해주세요.';
  else if (draft.mode === 'RATIO' && (!validRatios || ratio !== BigInt(10000))) allocationError = '비율 합계를 100%로 맞춰주세요.';
  else if (fractional) allocationError = canAdjustRatio
    ? '원 미만 금액이 남습니다. 받을 곳의 남은 금액 버튼을 눌러주세요.'
    : '원 미만 금액이 남습니다. 금액 직접 입력으로 조정해주세요.';
  else if (remaining !== BigInt(0)) allocationError = purpose === 'income' ? '배분액 합계를 입금액과 맞춰주세요.' : '부담액 합계를 출금액과 맞춰주세요.';
  const keys = allocations.map((a) => a.buildingId ?? `external:${a.label.trim()}`);
  const duplicateMessage = purpose === 'income' ? '같은 동이 중복되어 있어요.' : '같은 부담처가 중복되어 있어요.';
  const duplicateError = new Set(keys).size !== keys.length ? duplicateMessage : '';
  allocationError = duplicateError || allocationError;
  const categoryError = !draft.category.trim() ? `${purpose === 'income' ? '입금 항목' : '지출명'}을 입력해주세요.` : '';
  const error = duplicateError || categoryError || allocationError;
  return {
    allocations,
    allocated,
    remaining,
    canFillRatioRemainder: canAdjustRatio && remaining > BigInt(0),
    allocationError,
    error
  };
}

/** 비율의 원 단위 나머지 또는 직접 금액의 양수 잔액을 선택한 한 곳에만 더합니다. */
export function fillAllocationRemainder(total: string, draft: ExpenseDraft, index: number, limit?: string | null): ExpenseDraft {
  if (!draft.allocations[index] || !/^[0-9]{1,15}$/.test(total)) return draft;
  const result = calculateExpenseAllocation(total, draft);
  if (result.remaining <= BigInt(0)) return draft;
  if (draft.mode === 'RATIO') {
    if (!result.canFillRatioRemainder || limit !== undefined) return draft;
    return {
      ...draft,
      allocations: result.allocations.map((share, position) => position === index ? {
        ...share,
        amount: (BigInt(share.amount) + result.remaining).toString()
      } : share)
    };
  }
  if (draft.mode !== 'AMOUNT' || draft.allocations.some((share) => !/^[0-9]{0,15}$/.test(share.amount))) return draft;
  if (limit === null) return draft;
  const current = BigInt(draft.allocations[index].amount || '0');
  const capacity = limit === undefined ? result.remaining : BigInt(limit) - current;
  if (capacity <= BigInt(0)) return draft;
  const added = result.remaining < capacity ? result.remaining : capacity;
  return {
    ...draft,
    allocations: draft.allocations.map((share, position) => position === index ? {
      ...share,
      amount: (current + added).toString()
    } : share)
  };
}
