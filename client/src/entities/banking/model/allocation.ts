import type { ExpenseDraft } from './allocationTypes';

/** API 반환 순서와 관계없이 동 이름의 숫자를 기준으로 표시하며 저장된 배열은 변경하지 않습니다. */
export function sortExpenseLabels<T extends { label: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, 'ko', {
    numeric: true
  }));
}

/** 금액은 정수로 계산하고 원 미만 나머지는 숨기지 않고 직접 조정하도록 표시합니다. */
export function calculateExpenseAllocation(total: string, draft: ExpenseDraft, purpose: 'expense' | 'income' = 'expense') {
  // 동 없는 관리대상의 지출은 전액 공용으로 기록하며 가상의 동이나 외부 부담액을 생성하지 않습니다.
  if (draft.mode === 'PROPERTY') {
    const amount = /^[0-9]{1,15}$/.test(total) ? BigInt(total) : BigInt(0);
    return {
      allocations: [],
      allocated: amount,
      remaining: BigInt(0),
      allocationError: purpose !== 'expense' ? '입금 배분 방법을 확인해주세요.' : amount <= BigInt(0) ? '0원보다 큰 출금액을 입력해주세요.' : '',
      error: purpose !== 'expense' ? '입금 배분 방법을 확인해주세요.' : !draft.category.trim() ? '지출명을 입력해주세요.' : amount <= BigInt(0) ? '0원보다 큰 출금액을 입력해주세요.' : ''
    };
  }
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
  // 항목명 누락과 배분 검증을 분리해 필수 입력 때문에 정상 금액까지 경고로 표시하지 않습니다.
  let allocationError = '';
  if (!allocations.length || allocations.some((a) => !a.label.trim() || BigInt(a.amount) <= BigInt(0))) allocationError = purpose === 'income' ? '배분할 동과 0원보다 큰 금액을 입력해주세요.' : '부담할 곳과 0원보다 큰 금액을 입력해주세요.';
  else if (draft.mode === 'RATIO' && ratio !== BigInt(10000)) allocationError = '비율 합계를 100%로 맞춰주세요.';
  else if (fractional) allocationError = '원 미만 금액이 남습니다. 금액 직접 입력으로 조정해주세요.';
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
    allocationError,
    error
  };
}

/** 직접 금액 입력에서 관리자가 지정한 한 곳에만 양수 잔액을 더하며 다른 몫은 보존합니다. */
export function fillAllocationRemainder(total: string, draft: ExpenseDraft, index: number, limit?: string | null): ExpenseDraft {
  if (draft.mode !== 'AMOUNT' || !draft.allocations[index] || !/^[0-9]{1,15}$/.test(total)
    || draft.allocations.some((share) => !/^[0-9]{0,15}$/.test(share.amount))) return draft;
  const result = calculateExpenseAllocation(total, draft);
  if (result.remaining <= BigInt(0)) return draft;
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
