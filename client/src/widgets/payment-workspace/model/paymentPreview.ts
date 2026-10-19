import type {
  CumulativePaymentDraft,
  MonthlyCollectionFilters,
  MonthlyPreviewRow,
  PreviewAllocation,
  PreviewCharge,
  PreviewDraft,
  PreviewLedger,
  PreviewPayment
} from './paymentPreviewTypes';

/** 월별 표와 엑셀에서 같은 검색·동·납부 상태를 적용하고 페이지 구분은 호출 화면에 맡깁니다. */
export function filterMonthlyPreviewRows(rows: MonthlyPreviewRow[], filters: MonthlyCollectionFilters): MonthlyPreviewRow[] {
  const query = filters.query.trim();
  return rows.filter((row) => (!filters.building || row.buildingName === filters.building)
    && `${row.unitLabel} ${row.representativeName} ${row.latestPayer}`.includes(query)
    && (filters.status === '전체' || row.status === filters.status));
}

/** 과거 입금이나 선입금도 직접 연결할 수 있도록 청구월과 관계없이 현재 사용 중 명단의 세대를 선택합니다. */
export function getPreviewSelectableUnits(ledger: PreviewLedger): PreviewLedger['units'] {
  return ledger.units.filter((unit) => unit.status === 'ACTIVE' && unit.eligible !== false)
    .sort((left, right) => left.label.localeCompare(right.label, 'ko', {
      numeric: true
    }));
}

/** 서버의 실제 동 이름을 우선 사용하고 이전 원장 응답은 동·호수 표시에서 동 이름을 찾습니다. */
export function getPreviewBuildingName(unit: PreviewLedger['units'][number]): string {
  return unit.buildingName ?? unit.label.match(/^(\S+동)\s*/)?.[1] ?? '';
}

/** 입금 매칭과 월별 수납은 같은 실제 명단의 동을 숫자 오름차순으로 선택합니다. */
export function getPreviewBuildingOptions(ledger: PreviewLedger) {
  return [...new Set(ledger.units.map(getPreviewBuildingName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ko', {
      numeric: true
    }))
    .map((name) => ({
      value: name,
      label: name
    }));
}

/** 이름과 동·호수 표기로 현재 세대를 찾으며 검색 결과는 실제 세대 식별자로만 선택합니다. */
export function getPreviewUnitSearchOptions(ledger: PreviewLedger) {
  return getPreviewSelectableUnits(ledger).map((unit) => ({
    value: unit.id,
    label: unit.label,
    searchKeywords: [
      ...(unit.residentNames ?? []),
      unit.representativeName ?? '',
      unit.label.replace(/[동호\s]/g, ''),
      unit.label.replace(/동\s*/, '-').replace(/호$/, '')
    ]
  }));
}

/** 실제 발행된 해당 월 청구의 세대만 반환하며 취소·공실 제외와 명부만 있는 세대는 선택하지 않습니다. */
export function getPreviewBilledUnits(ledger: PreviewLedger, month: string): PreviewLedger['units'] {
  const billedIds = new Set(ledger.charges.filter((charge) => charge.status === 'ISSUED'
    && ((charge.chargeType !== 'OPENING_RECEIVABLE' && charge.month === month)
      || (charge.chargeType === 'OPENING_RECEIVABLE' && charge.month <= month)))
    .map((charge) => charge.unitId));

  return ledger.units.filter((unit) => billedIds.has(unit.id));
}

/** 조회월 실제 부과 세대에 한해 이월·충당·미수를 계산하며 과거 원장 자체는 보존합니다. */
export function getMonthlyPreviewRows(ledger: PreviewLedger, month: string): MonthlyPreviewRow[] {
  getPreviewDueDate(month);
  const start = `${month}-01`;
  const end = getPreviewDueDate(month);
  const validCharges = ledger.charges.filter(canPreviewAllocate);

  return getPreviewBilledUnits(ledger, month).map((unit) => {
    const charges = validCharges.filter((charge) => charge.unitId === unit.id);
    const oldCharges = charges.filter((charge) => charge.month < month || (charge.chargeType === 'OPENING_RECEIVABLE' && charge.month <= month))
      .reduce((sum, charge) => sum + BigInt(charge.amount), BigInt(0));
    const billed = charges.filter((charge) => charge.month === month && charge.chargeType !== 'OPENING_RECEIVABLE').reduce((sum, charge) => sum + BigInt(charge.amount), BigInt(0));
    const payments = ledger.payments.filter((payment) => payment.status === 'CONFIRMED' && payment.receiptType !== 'OTHER' && payment.unitId === unit.id && payment.date <= end);
    // 인계 선납은 잔액 계산에만 포함하고 실제 입금 목록·월별 현금 합계에는 넣지 않습니다.
    const openingCredit = (ledger.openingCredits ?? []).filter((credit) => credit.unitId === unit.id && credit.date <= end)
      .reduce((sum, credit) => sum + BigInt(credit.amount), BigInt(0));
    const previousReceived = payments.filter((payment) => payment.date < start).reduce((sum, payment) => sum + BigInt(payment.amount), openingCredit);
    const received = payments.reduce((sum, payment) => sum + BigInt(payment.amount), openingCredit);
    const carry = oldCharges > previousReceived ? oldCharges - previousReceived : BigInt(0);
    const balance = oldCharges + billed > received ? oldCharges + billed - received : BigInt(0);
    const applied = carry + billed - balance;
    const settlementCharges = ledger.charges.filter((charge) => charge.unitId === unit.id && charge.month === month && charge.status === 'ISSUED' && BigInt(charge.amount) <= BigInt(0));
    const settlementAmount = settlementCharges.length ? settlementCharges.reduce((sum, charge) => sum + BigInt(charge.amount), BigInt(0)) : null;
    const settlementPending = ledger.charges.some((charge) => charge.unitId === unit.id && charge.month <= month && charge.status === 'ISSUED' && BigInt(charge.amount) <= BigInt(0));
    const prepaid = received > oldCharges + billed ? received - oldCharges - billed : BigInt(0);
    let status: MonthlyPreviewRow['status'] = '미납';
    if (balance === BigInt(0)) status = '납부완료';
    else if (applied > BigInt(0)) status = '일부납부';
    if (settlementPending) status = '정산 확인 필요';

    return {
      unitId: unit.id,
      unitLabel: unit.label,
      buildingName: getPreviewBuildingName(unit),
      representativeName: unit.representativeName ?? '—',
      latestPayer: [...payments].sort((left, right) => right.date.localeCompare(left.date)).at(0)?.payer ?? '—',
      carry,
      billed,
      applied,
      balance,
      status,
      prepaid,
      settlementAmount,
      settlementPending,
      latestDate: payments.map((payment) => payment.date).sort().at(-1) ?? '—'
    };
  });
}

/** 선택월의 실제 확정 입금을 종류별로 합산하며 일부납부·선입금도 입금 전액을 포함합니다. 청구 충당액과 구분합니다. */
export function getMonthlyPreviewIncome(ledger: PreviewLedger, month: string) {
  getPreviewDueDate(month);
  let household = BigInt(0), other = BigInt(0), otherCount = 0;
  for (const payment of ledger.payments) {
    if (payment.status !== 'CONFIRMED' || !payment.date.startsWith(month) || payment.date > ledger.asOf) continue;
    if (payment.receiptType === 'OTHER') {
      other += BigInt(payment.amount);otherCount++;
    } else household += BigInt(payment.amount);
  }
  return {
    household,
    other,
    total: household + other,
    otherCount
  };
}

/** 확정 수납 전액을 누적해 같은 달 추가 입금과 미배분 선입금도 세대 잔액에 포함합니다. */
export function getCumulativePreviewBalance(ledger: PreviewLedger, unitId: string, extraAmount = '0') {
  const billed = ledger.charges.filter((charge) => charge.unitId === unitId && canPreviewAllocate(charge) && charge.month <= ledger.asOf.slice(0, 7))
    .reduce((sum, charge) => sum + BigInt(charge.amount), BigInt(0));
  const received = ledger.payments.filter((payment) => payment.unitId === unitId && payment.status === 'CONFIRMED' && payment.receiptType !== 'OTHER' && payment.date <= ledger.asOf)
    .reduce((sum, payment) => sum + BigInt(payment.amount), BigInt(0));
  const openingCredit = (ledger.openingCredits ?? []).filter((credit) => credit.unitId === unitId && credit.date <= ledger.asOf)
    .reduce((sum, credit) => sum + BigInt(credit.amount), BigInt(0));
  const after = received + openingCredit + BigInt(extraAmount);

  return {
    billed,
    received,
    openingCredit,
    balance: billed > after ? billed - after : BigInt(0),
    prepaid: after > billed ? after - billed : BigInt(0)
  };
}

/** 테스트 원장의 수납 확정도 세대 지정만으로 전액 누적하며 미납이 없어도 선입금을 저장합니다. */
export function confirmCumulativePreviewPayment(ledger: PreviewLedger, id: string, draft: CumulativePaymentDraft): PreviewLedger {
  const payment = requirePreviewPayment(ledger, id);
  return confirmPreviewPayment(ledger, id, {
    ...recommendPreviewAllocation(ledger, payment, draft.unitId),
    separateReason: draft.separateReason
  });
}

const MAX_PAYMENT_AMOUNT = BigInt('999999999999999');

/** 잘못된 날짜를 다음 달로 보정하지 않고 실제 달력 날짜만 허용합니다. */
export function isPreviewDate(value: string): boolean {
  if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)) return false;

  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** 모든 청구월의 실제 월말을 사용해 윤년·2월·30일인 달에도 같은 정책을 적용합니다. */
export function getPreviewDueDate(month: string): string {
  if (!/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('청구월을 확인해주세요.');
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();

  return `${month}-${last}`;
}

/** 확정된 양수 청구만 배분하며 취소·공실 제외와 미정인 0원·음수 정산을 분리합니다. */
export function canPreviewAllocate(charge: PreviewCharge): boolean {
  return charge.status === 'ISSUED' && BigInt(charge.amount) > BigInt(0);
}

/** 수납 취소 시 배분 이력은 보존하고 유효 합계에서만 제외합니다. */
export function getPreviewPaid(ledger: PreviewLedger, chargeId: string): bigint {
  const credits = (ledger.openingCredits ?? []).flatMap((credit) => credit.allocations)
    .filter((allocation) => allocation.chargeId === chargeId).reduce((sum, allocation) => sum + BigInt(allocation.amount), BigInt(0));

  return ledger.payments.filter((payment) => payment.status === 'CONFIRMED' && payment.receiptType !== 'OTHER')
    .flatMap((payment) => payment.allocations)
    .filter((allocation) => allocation.chargeId === chargeId)
    .reduce((sum, allocation) => sum + BigInt(allocation.amount), credits);
}

export function getPreviewOutstanding(ledger: PreviewLedger, charge: PreviewCharge): bigint {
  if (!canPreviewAllocate(charge)) return BigInt(0);

  return BigInt(charge.amount) - getPreviewPaid(ledger, charge.id);
}

/** 현재 공실이어도 과거의 유효한 청구는 남기고 청구 자체의 제외 상태를 기준으로 판단합니다. */
export function getPreviewReceivables(ledger: PreviewLedger, unitId: string): PreviewCharge[] {
  return ledger.charges.filter((charge) => charge.unitId === unitId && canPreviewAllocate(charge)
    && getPreviewOutstanding(ledger, charge) > BigInt(0)).sort((left, right) => left.month.localeCompare(right.month));
}

export function getPreviewChargeLabel(ledger: PreviewLedger, charge: PreviewCharge): string {
  if (charge.status === 'CANCELED') return '청구 취소';
  if (charge.status === 'EXCLUDED_VACANT') return '공실 제외';
  if (BigInt(charge.amount) <= BigInt(0)) return '정산 정책 확인 필요';
  const paid = getPreviewPaid(ledger, charge.id);
  if (paid === BigInt(charge.amount)) return '납부완료';
  if (paid > BigInt(0)) return '일부납부';

  return '미납';
}

/** 추천값만 계산하고 확정 전에는 원장과 납부 상태를 변경하지 않습니다. */
export function recommendPreviewAllocation(ledger: PreviewLedger, payment: PreviewPayment, unitId: string): PreviewDraft {
  let remaining = BigInt(payment.amount);
  const allocations = getPreviewReceivables(ledger, unitId).map((charge) => {
    const outstanding = getPreviewOutstanding(ledger, charge);
    const amount = remaining < outstanding ? remaining : outstanding;
    remaining -= amount;

    return {
      chargeId: charge.id,
      amount: amount.toString()
    };
  });

  return {
    unitId,
    allocations
  };
}

/** 후보 추천은 금액·계좌·날짜를 우선 대조하며 실제 연결은 별도의 명시적 선택으로 수행합니다. */
export function getPreviewDuplicateCandidates(ledger: PreviewLedger, bank: PreviewPayment): PreviewPayment[] {
  if (bank.source !== 'BANK_IMPORT' || bank.status !== 'PENDING') return [];

  return ledger.payments.filter((manual) => manual.source === 'MANUAL' && manual.status === 'CONFIRMED'
    && !manual.bankTransactionId && manual.amount === bank.amount && manual.accountId === bank.accountId
    && manual.date === bank.date && (manual.payer === bank.payer || Boolean(bank.unitId && manual.unitId === bank.unitId)));
}

function requirePreviewPayment(ledger: PreviewLedger, id: string): PreviewPayment {
  const payment = ledger.payments.find((item) => item.id === id);
  if (!payment) throw new Error('입금 내역을 찾을 수 없어요.');

  return payment;
}

function positivePreviewAmount(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) throw new Error('금액을 정수 원 단위로 입력해주세요.');
  const amount = BigInt(value);
  if (amount <= BigInt(0) || amount > MAX_PAYMENT_AMOUNT) throw new Error('입금액은 1~999,999,999,999,999원으로 입력해주세요.');

  return amount;
}

/** 초안을 새 항목으로 추가하며 같은 ID의 중복 생성과 잘못된 계좌·세대·날짜를 거부합니다. */
export function addPreviewManual(ledger: PreviewLedger, input: {
  id: string; accountId: string; unitId: string; date: string; payer: string; amount: string;
}): PreviewLedger {
  if (ledger.payments.some((payment) => payment.id === input.id)) throw new Error('이미 등록한 입금이에요.');
  if (!ledger.accounts.some((account) => account.id === input.accountId)) throw new Error('관리계좌를 선택해주세요.');
  if (!ledger.units.some((unit) => unit.id === input.unitId)) throw new Error('세대를 선택해주세요.');
  if (!isPreviewDate(input.date)) throw new Error('입금일을 확인해주세요.');
  if (!input.payer.trim() || input.payer.trim().length > 100) throw new Error('입금자명은 1~100자로 입력해주세요.');
  const amount = positivePreviewAmount(input.amount).toString();
  const payment: PreviewPayment = {
    ...input,
    amount,
    payer: input.payer.trim(),
    source: 'MANUAL',
    status: 'PENDING',
    reason: '수동 입력 · 은행 거래 미연결',
    allocations: []
  };

  return {
    ...ledger,
    payments: [payment, ...ledger.payments]
  };
}

/** 최신 잔액·상태·중복 후보를 다시 검증해 시안에서도 과배분과 중복 확정을 막습니다. */
export function confirmPreviewPayment(ledger: PreviewLedger, id: string, draft: PreviewDraft): PreviewLedger {
  const payment = requirePreviewPayment(ledger, id);
  if (payment.status !== 'PENDING') throw new Error('확인 필요 상태의 입금만 확정할 수 있어요.');
  if (!ledger.units.some((unit) => unit.id === draft.unitId)) throw new Error('세대를 선택해주세요.');
  if (getPreviewDuplicateCandidates(ledger, payment).length && !draft.separateReason?.trim()) {
    throw new Error('기존 수동 수납을 먼저 확인해주세요. 별도 입금이면 사유를 입력해주세요.');
  }
  let total = BigInt(0);
  const seen = new Set<string>();
  const allocations: PreviewAllocation[] = [];
  for (const allocation of draft.allocations) {
    if (seen.has(allocation.chargeId)) throw new Error('같은 청구월을 중복 지정할 수 없어요.');
    seen.add(allocation.chargeId);
    const charge = ledger.charges.find((item) => item.id === allocation.chargeId);
    if (!charge || charge.unitId !== draft.unitId || !canPreviewAllocate(charge)) throw new Error('반영할 수 없는 청구가 포함되어 있어요.');
    if (!/^[0-9]+$/.test(allocation.amount)) throw new Error('반영액을 0원 이상의 정수로 입력해주세요.');
    const amount = BigInt(allocation.amount);
    if (amount > getPreviewOutstanding(ledger, charge)) throw new Error('반영액이 남은 청구액을 초과했어요. 다시 확인해주세요.');
    total += amount;
    if (amount > BigInt(0)) allocations.push({
      ...allocation,
      amount: amount.toString()
    });
  }
  if (total > positivePreviewAmount(payment.amount)) throw new Error('반영액 합계가 입금액을 초과했어요.');
  const updated: PreviewPayment = {
    ...payment,
    status: 'CONFIRMED',
    unitId: draft.unitId,
    allocations,
    separateReason: draft.separateReason?.trim(),
    bankTransactionId: payment.source === 'BANK_IMPORT' ? payment.id : undefined
  };

  return {
    ...ledger,
    payments: ledger.payments.map((item) => item.id === id ? updated : item),
    history: [...ledger.history, {
      paymentId: id,
      action: 'CONFIRMED',
      reason: draft.separateReason?.trim() ?? ''
    }]
  };
}

/** 원본은 연결 표시만 바꾸고 기존 수납 금액·배분·생성 출처를 보존해 두 번 합산하지 않습니다. */
export function linkPreviewPayment(ledger: PreviewLedger, bankId: string, manualId: string): PreviewLedger {
  const bank = requirePreviewPayment(ledger, bankId);
  const manual = requirePreviewPayment(ledger, manualId);
  if (bank.source !== 'BANK_IMPORT' || bank.status !== 'PENDING'
    || manual.source !== 'MANUAL' || manual.status !== 'CONFIRMED' || manual.bankTransactionId) {
    throw new Error('연결할 수 없는 상태예요. 최신 내역을 확인해주세요.');
  }
  if (bank.accountId !== manual.accountId || bank.amount !== manual.amount || bank.date !== manual.date
    || (bank.unitId && bank.unitId !== manual.unitId)) throw new Error('계좌·금액·입금일·세대가 일치하는지 확인해주세요.');

  return {
    ...ledger,
    payments: ledger.payments.map((item) => {
      if (item.id === bankId) return {
        ...item,
        status: 'LINKED',
        linkedPaymentId: manualId
      };
      if (item.id === manualId) return {
        ...item,
        bankTransactionId: bankId
      };

      return item;
    }),
    history: [...ledger.history, {
      paymentId: manualId,
      action: 'BANK_LINKED',
      reason: bankId
    }]
  };
}

/** 최초 취소 사유와 배분 이력을 남기며 재시도해도 잔액이 두 번 복원되지 않게 합니다. */
export function cancelPreviewPayment(ledger: PreviewLedger, id: string, reason: string): PreviewLedger {
  const payment = requirePreviewPayment(ledger, id);
  if (payment.status === 'CANCELED') return ledger;
  if (payment.status !== 'CONFIRMED') throw new Error('확정된 수납만 취소할 수 있어요.');
  if (!reason.trim()) throw new Error('취소 사유를 입력해주세요.');

  return {
    ...ledger,
    payments: ledger.payments.map((item) => {
      if (item.id === id) return {
        ...item,
        status: 'CANCELED',
        cancelReason: reason.trim(),
        bankTransactionId: undefined
      };
      if (item.linkedPaymentId === id) return {
        ...item,
        status: 'PENDING',
        linkedPaymentId: undefined
      };

      return item;
    }),
    history: [...ledger.history, {
      paymentId: id,
      action: 'CANCELED',
      reason: reason.trim()
    }]
  };
}

/** 보류는 납부 상태에 영향을 주지 않으며 은행 원본 검토 항목에서만 사용합니다. */
export function holdPreviewPayment(ledger: PreviewLedger, id: string, reason: string): PreviewLedger {
  const payment = requirePreviewPayment(ledger, id);
  if (payment.source !== 'BANK_IMPORT' || payment.status !== 'PENDING') throw new Error('확인 필요 은행 입금만 보류할 수 있어요.');
  if (!reason.trim()) throw new Error('보류 사유를 입력해주세요.');

  return {
    ...ledger,
    payments: ledger.payments.map((item) => item.id === id ? {
      ...item,
      status: 'ON_HOLD',
      holdReason: reason.trim()
    } : item)
  };
}

export function resumePreviewPayment(ledger: PreviewLedger, id: string): PreviewLedger {
  const payment = requirePreviewPayment(ledger, id);
  if (payment.status !== 'ON_HOLD') throw new Error('보류 중인 입금만 다시 검토할 수 있어요.');

  return {
    ...ledger,
    payments: ledger.payments.map((item) => item.id === id ? {
      ...item,
      status: 'PENDING'
    } : item)
  };
}

/** 샘플 가져오기도 같은 원본 ID를 재사용해 반복 실행 시 원본·수납을 추가하지 않습니다. */
export function importPreviewPayments(ledger: PreviewLedger, payments: PreviewPayment[]): PreviewLedger {
  const existing = new Set(ledger.payments.filter((payment) => payment.source === 'BANK_IMPORT').map((payment) => payment.id));
  const incoming = payments.filter((payment) => {
    if (existing.has(payment.id)) return false;
    existing.add(payment.id);

    return true;
  });

  return {
    ...ledger,
    payments: [...incoming, ...ledger.payments]
  };
}
