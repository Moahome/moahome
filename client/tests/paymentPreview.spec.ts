import {
  expect,
  test
} from '@playwright/test';
import {
  addPreviewManual,
  cancelPreviewPayment,
  confirmPreviewPayment,
  getPreviewChargeLabel,
  getPreviewDueDate,
  getMonthlyPreviewRows,
  getPreviewBilledUnits,
  getPreviewOutstanding,
  getPreviewReceivables,
  importPreviewPayments,
  isPreviewDate,
  linkPreviewPayment,
  recommendPreviewAllocation
} from '../src/widgets/payment-workspace/model/paymentPreview';
import {
  createPaymentSample,
  getImportSample
} from '../src/widgets/payment-workspace/model/paymentSample';
import {
  parseBankPreviewCsv,
  readBankPreviewFile
} from '../src/widgets/payment-workspace/model/bankImportPreview';

test('납부기한은 실제 월말이며 잘못된 날짜는 보정하지 않음', () => {
  for (const [month, date] of [['2026-10', '31'], ['2026-11', '30'], ['2026-02', '28'], ['2028-02', '29']]) {
    expect(getPreviewDueDate(month)).toBe(`${month}-${date}`);
  }
  expect(isPreviewDate('2026-02-29')).toBe(false);
  expect(isPreviewDate('2028-02-29')).toBe(true);
  expect(() => getPreviewDueDate('2026-13')).toThrow();
});

test('추천은 원장을 변경하지 않고 여러 달에 반영한 확정 결과만 납부 합계에 포함', () => {
  const ledger = createPaymentSample();
  const bank = ledger.payments.find((payment) => payment.id === 'b1')!;
  const draft = recommendPreviewAllocation(ledger, bank, '101');
  expect(draft.allocations).toEqual([{
    chargeId: 'c10109',
    amount: '30000'
  }, {
    chargeId: 'c10110',
    amount: '50000'
  }]);
  expect(getPreviewReceivables(ledger, '101')).toHaveLength(2);
  const confirmed = confirmPreviewPayment(ledger, bank.id, draft);
  expect(getPreviewReceivables(confirmed, '101')).toEqual([]);
  expect(ledger.payments.find((payment) => payment.id === 'b1')?.status).toBe('PENDING');
  expect(() => confirmPreviewPayment(confirmed, bank.id, draft)).toThrow('확인 필요');
});

test('취소·공실 제외·0원·음수 청구를 배분하지 않고 현재 공실의 과거 유효 청구는 보존', () => {
  const ledger = createPaymentSample();
  ledger.charges.push(
    {
      id: 'zero',
      unitId: '101',
      month: '2026-08',
      amount: '0',
      status: 'ISSUED'
    },
    {
      id: 'negative',
      unitId: '101',
      month: '2026-07',
      amount: '-10000',
      status: 'ISSUED'
    },
    {
      id: 'old-vacant',
      unitId: '401',
      month: '2026-09',
      amount: '20000',
      status: 'ISSUED'
    }
  );
  expect(getPreviewReceivables(ledger, '101').map((charge) => charge.id)).toEqual(['c10109', 'c10110']);
  expect(getPreviewReceivables(ledger, '401').map((charge) => charge.id)).toEqual(['old-vacant']);
  expect(getPreviewReceivables(ledger, '501')).toEqual([]);
  expect(getPreviewChargeLabel(ledger, ledger.charges.find((charge) => charge.id === 'zero')!)).toBe('정산 정책 확인 필요');
  for (const [unitId, chargeId] of [['401', 'c40110'], ['501', 'c50110'], ['101', 'zero'], ['101', 'negative']]) {
    expect(() => confirmPreviewPayment(ledger, 'b3', {
      unitId,
      allocations: [{
        chargeId,
        amount: '1'
      }]
    })).toThrow('반영할 수 없는');
  }
});

test('최신 청구 잔액·세대·입금 한도를 검증하고 미배분액은 청구에 억지로 반영하지 않음', () => {
  const ledger = createPaymentSample();
  expect(() => confirmPreviewPayment(ledger, 'b1', {
    unitId: '101',
    allocations: [{
      chargeId: 'c10109',
      amount: '30001'
    }]
  })).toThrow('청구액');
  expect(() => confirmPreviewPayment(ledger, 'b1', {
    unitId: '202',
    allocations: [{
      chargeId: 'c10109',
      amount: '1'
    }]
  })).toThrow('반영할 수 없는');
  expect(() => confirmPreviewPayment(ledger, 'b1', {
    unitId: '202',
    allocations: [{
      chargeId: 'c20209',
      amount: '40000'
    }, {
      chargeId: 'c20210',
      amount: '50000'
    }]
  })).toThrow('입금액');
  const next = confirmPreviewPayment(ledger, 'b1', {
    unitId: '101',
    allocations: [{
      chargeId: 'c10110',
      amount: '50000'
    }]
  });
  expect(next.payments.find((payment) => payment.id === 'b1')?.amount).toBe('80000');
  expect(getPreviewOutstanding(next, next.charges.find((charge) => charge.id === 'c10109')!)).toBe(BigInt(30000));
});

test('중복 의심 입금은 연결 또는 명시적인 별도 거래 사유가 필요하고 잘못된 계좌·날짜 연결은 거부', () => {
  const ledger = createPaymentSample();
  expect(() => confirmPreviewPayment(ledger, 'b5', {
    unitId: '302',
    allocations: []
  })).toThrow('기존 수동 수납');
  const linked = linkPreviewPayment(ledger, 'b5', 'm1');
  expect(linked.payments.find((payment) => payment.id === 'm1')?.source).toBe('MANUAL');
  expect(linked.payments.filter((payment) => payment.status === 'CONFIRMED')).toHaveLength(4);
  expect(getPreviewReceivables(linked, '302')).toEqual([]);
  for (const patch of [{
    accountId: 'a2'
  }, {
    date: '2026-10-11'
  }, {
    unitId: '101'
  }, {
    amount: '60001'
  }]) {
    const wrong = {
      ...ledger,
      payments: ledger.payments.map((payment) => payment.id === 'b5' ? {
        ...payment,
        ...patch
      } : payment)
    };
    expect(() => linkPreviewPayment(wrong, 'b5', 'm1')).toThrow('일치');
  }
});

test('반복 취소는 최초 이력을 보존하고 연결했던 은행 원본을 다시 검토하게 함', () => {
  const ledger = linkPreviewPayment(createPaymentSample(), 'b5', 'm1');
  const canceled = cancelPreviewPayment(ledger, 'm1', '세대 오매칭');
  const twice = cancelPreviewPayment(canceled, 'm1', '재시도');
  expect(twice).toBe(canceled);
  expect(getPreviewOutstanding(twice, twice.charges.find((charge) => charge.id === 'c30210')!)).toBe(BigInt(60000));
  expect(twice.payments.find((payment) => payment.id === 'm1')?.allocations).toHaveLength(1);
  expect(twice.payments.find((payment) => payment.id === 'b5')?.status).toBe('PENDING');
});

test('수동 입력의 계좌·날짜·정수 범위를 검증하고 샘플 재업로드는 중복 생성하지 않음', () => {
  const ledger = createPaymentSample();
  const input = {
    id: 'new',
    accountId: 'a1',
    unitId: '101',
    date: '2026-10-15',
    payer: '확인자',
    amount: '30000'
  };
  for (const patch of [{
    accountId: ''
  }, {
    date: '2026-02-30'
  }, {
    amount: '1.5'
  }, {
    amount: '1e3'
  }, {
    amount: '0'
  }, {
    amount: '1000000000000000'
  }]) {
    expect(() => addPreviewManual(ledger, {
      ...input,
      ...patch
    })).toThrow();
  }
  const next = importPreviewPayments(importPreviewPayments(ledger, getImportSample()), getImportSample());
  expect(next.payments.filter((payment) => payment.id === 'b6')).toHaveLength(1);
});

test('월별 미수는 이월·발생·충당으로 계산하고 미배분 제외·취소 후 다음 달 이월을 반영', () => {
  const ledger = createPaymentSample();
  ledger.charges.push({
    id: 'c10111',
    unitId: '101',
    month: '2026-11',
    amount: '50000',
    status: 'ISSUED'
  });
  const draft = {
    unitId: '101',
    allocations: [{
      chargeId: 'c10110',
      amount: '50000'
    }]
  };
  const next = confirmPreviewPayment(ledger, 'b1', draft);
  const october = getMonthlyPreviewRows(next, '2026-10').find((row) => row.unitId === '101')!;
  expect(october.carry).toBe(BigInt(30000));
  expect(october.billed).toBe(BigInt(50000));
  expect(october.applied).toBe(BigInt(50000));
  expect(october.balance).toBe(BigInt(30000));
  expect(getMonthlyPreviewRows(next, '2026-11').find((row) => row.unitId === '101')?.carry).toBe(october.balance);
  const canceled = cancelPreviewPayment(next, 'b1', '확인 정정');
  expect(getMonthlyPreviewRows(canceled, '2026-11').find((row) => row.unitId === '101')?.carry).toBe(BigInt(80000));
});

test('CSV는 따옴표 안의 쉼표·줄바꿈을 보존하고 미완성 따옴표는 거부', () => {
  expect(parseBankPreviewCsv('\uFEFF입금일,입금액,입금자명\r\n2026-10-15,"30,000","101호\n관리비"'))
    .toEqual([['입금일', '입금액', '입금자명'], ['2026-10-15', '30,000', '101호\n관리비']]);
  expect(() => parseBankPreviewCsv('입금일,입금액\n"2026-10-15,30000')).toThrow('따옴표');
});

test('거래 파일은 확정 전 원장을 바꾸지 않고 재업로드에 같은 거래 키를 사용', async () => {
  const ledger = createPaymentSample();
  const file = new File(['입금일,입금액,입금자명\n2026-10-15,"30,000",101호관리비'], 'transactions.csv');
  const first = await readBankPreviewFile(file, ledger);
  const second = await readBankPreviewFile(file, ledger);
  expect(first[0].id).toBe(second[0].id);
  expect(first[0].amount).toBe('30000');
  expect(first[0].status).toBe('PENDING');
  expect(ledger.payments.some((payment) => payment.id === first[0].id)).toBe(false);
  await expect(readBankPreviewFile(new File(['입금일,입금액,입금자명\n2026-02-30,50000,101호'], 'invalid.csv'), ledger)).rejects.toThrow('입금일');
});


test('초과 납부는 미수금을 음수로 만들지 않고 선입금 잔액으로 남기며 음수 부과액과 구분', () => {
  const sample=createPaymentSample();
  const ledger={
    ...sample,
    charges:sample.charges.filter((charge)=>charge.id!=='c10109')
  };
  const receipt=confirmPreviewPayment(ledger,'b1',{
    unitId:'101',
    allocations:[{
      chargeId:'c10110',
      amount:'50000'
    }]
  });
  const row=getMonthlyPreviewRows(receipt,'2026-10').find((item)=>item.unitId==='101')!;
  expect(row.balance).toBe(BigInt(0));expect(row.prepaid).toBe(BigInt(30000));
  const adjusted={
    ...receipt,
    charges:[...receipt.charges,{
      id: 'c10111',
      unitId: '101',
      month: '2026-11',
      amount: '50000',
      status: 'ISSUED' as const
    },{
      id:'negative',
      unitId:'101',
      month:'2026-10',
      amount:'-1000',
      status:'ISSUED' as const
    }]
  };
  const pending=getMonthlyPreviewRows(adjusted,'2026-10').find((item)=>item.unitId==='101')!;
  expect(pending.settlementAmount).toBe(-BigInt(1000));expect(pending.status).toBe('정산 확인 필요');expect(pending.prepaid).toBe(BigInt(30000));
  expect(getMonthlyPreviewRows(adjusted,'2026-11').find((item)=>item.unitId==='101')!.settlementPending).toBe(true);
});


test('세대 명부가 더 많아도 해당 월의 실제 부과 대상 20세대만 조회하고 취소·공실 제외·과거 세대는 제외', () => {
  const sample = createPaymentSample();
  const ledger = {
    ...sample,
    units: Array.from({
      length: 25
    }, (_, index) => ({
      id: `unit-${index}`,
      label: `${index + 101}호`,
      status: 'ACTIVE' as const
    })),
    charges: Array.from({
      length: 24
    }, (_, index) => ({
      id: `charge-${index}`,
      unitId: `unit-${index}`,
      month: index === 23 ? '2026-09' : '2026-10',
      amount: '50000',
      status: index < 20 || index === 23 ? 'ISSUED' as const : index === 20 ? 'CANCELED' as const : 'EXCLUDED_VACANT' as const
    })),
    payments: []
  };
  expect(getPreviewBilledUnits(ledger, '2026-10').map((unit) => unit.id)).toEqual(ledger.units.slice(0, 20).map((unit) => unit.id));
  expect(getMonthlyPreviewRows(ledger, '2026-10')).toHaveLength(20);
  expect(getMonthlyPreviewRows(ledger, '2026-11')).toEqual([]);
  expect(getMonthlyPreviewRows(ledger, '2026-09').map((row) => row.unitId)).toEqual(['unit-23']);
  // 부과 금액 자체가 0원·음수인 유효 청구는 공실 제외와 다르므로 정산 확인 대상으로 보존합니다.
  ledger.charges[0].amount = '0';
  ledger.charges[1].amount = '-1000';
  const rows = getMonthlyPreviewRows(ledger, '2026-10');
  expect(rows).toHaveLength(20);
  expect(rows.slice(0, 2).every((row) => row.status === '정산 확인 필요')).toBe(true);
});
