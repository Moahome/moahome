import type {
  PreviewLedger,
  PreviewPayment
} from './paymentPreviewTypes';

/** 은행 연동·실제 거래를 가장하지 않는 고정 예시입니다. 실제 업무 데이터와 섞어 사용하지 않습니다. */
export function createPaymentSample(): PreviewLedger {
  return {
    asOf: '2026-10-15',
    accounts: [{
      id: 'a1',
      label: '하나은행 ····1234'
    }, {
      id: 'a2',
      label: '국민은행 ····9421'
    }],
    units: [
      {
        id: '101',
        label: '101호',
        status: 'ACTIVE'
      },
      {
        id: '202',
        label: '202호',
        status: 'ACTIVE'
      },
      {
        id: '302',
        label: '302호',
        status: 'ACTIVE'
      },
      {
        id: '401',
        label: '401호 · 공실',
        status: 'VACANT'
      },
      {
        id: '501',
        label: '501호',
        status: 'ACTIVE'
      }
    ],
    charges: [
      {
        id: 'c10109',
        unitId: '101',
        month: '2026-09',
        amount: '50000',
        status: 'ISSUED'
      },
      {
        id: 'c10110',
        unitId: '101',
        month: '2026-10',
        amount: '50000',
        status: 'ISSUED'
      },
      {
        id: 'c20209',
        unitId: '202',
        month: '2026-09',
        amount: '50000',
        status: 'ISSUED'
      },
      {
        id: 'c20210',
        unitId: '202',
        month: '2026-10',
        amount: '60000',
        status: 'ISSUED'
      },
      {
        id: 'c30209',
        unitId: '302',
        month: '2026-09',
        amount: '60000',
        status: 'ISSUED'
      },
      {
        id: 'c30210',
        unitId: '302',
        month: '2026-10',
        amount: '60000',
        status: 'ISSUED'
      },
      {
        id: 'c40110',
        unitId: '401',
        month: '2026-10',
        amount: '50000',
        status: 'EXCLUDED_VACANT'
      },
      {
        id: 'c50110',
        unitId: '501',
        month: '2026-10',
        amount: '50000',
        status: 'CANCELED'
      }
    ],
    payments: [
      {
        id: 'b1',
        source: 'BANK_IMPORT',
        date: '2026-10-15',
        payer: '김모아',
        amount: '80000',
        unitId: '101',
        reason: '과거 입금자명 일치',
        accountId: 'a1',
        status: 'PENDING',
        allocations: []
      },
      {
        id: 'b2',
        source: 'BANK_IMPORT',
        date: '2026-10-15',
        payer: '202호관리비',
        amount: '100000',
        unitId: '202',
        reason: '적요에 202호 표기',
        accountId: 'a1',
        status: 'PENDING',
        allocations: []
      },
      {
        id: 'b3',
        source: 'BANK_IMPORT',
        date: '2026-10-14',
        payer: '이홈',
        amount: '70000',
        unitId: '',
        reason: '세대 직접 확인 필요',
        accountId: 'a2',
        status: 'PENDING',
        allocations: []
      },
      {
        id: 'b4',
        source: 'BANK_IMPORT',
        date: '2026-10-13',
        payer: '미확인입금',
        amount: '30000',
        unitId: '',
        reason: '추가 확인 필요',
        accountId: 'a1',
        status: 'ON_HOLD',
        allocations: [],
        holdReason: '입금자 및 세대 확인 필요'
      },
      {
        id: 'b5',
        source: 'BANK_IMPORT',
        date: '2026-10-12',
        payer: '박하나',
        amount: '60000',
        unitId: '302',
        reason: '기존 수동 수납 확인 필요',
        accountId: 'a1',
        status: 'PENDING',
        allocations: []
      },
      {
        id: 'm1',
        source: 'MANUAL',
        date: '2026-10-12',
        payer: '박하나',
        amount: '60000',
        unitId: '302',
        reason: '수동 확인',
        accountId: 'a1',
        status: 'CONFIRMED',
        allocations: [{
          chargeId: 'c30210',
          amount: '60000'
        }]
      },
      {
        id: 'p1',
        source: 'MANUAL',
        date: '2026-09-20',
        payer: '김모아',
        amount: '20000',
        unitId: '101',
        reason: '지난달 수납 예시',
        accountId: 'a1',
        status: 'CONFIRMED',
        allocations: [{
          chargeId: 'c10109',
          amount: '20000'
        }]
      },
      {
        id: 'p2',
        source: 'MANUAL',
        date: '2026-09-20',
        payer: '202호관리비',
        amount: '10000',
        unitId: '202',
        reason: '지난달 수납 예시',
        accountId: 'a1',
        status: 'CONFIRMED',
        allocations: [{
          chargeId: 'c20209',
          amount: '10000'
        }]
      },
      {
        id: 'p3',
        source: 'MANUAL',
        date: '2026-09-20',
        payer: '박하나',
        amount: '60000',
        unitId: '302',
        reason: '지난달 수납 예시',
        accountId: 'a1',
        status: 'CONFIRMED',
        allocations: [{
          chargeId: 'c30209',
          amount: '60000'
        }]
      }
    ],
    history: []
  };
}

export function getImportSample(): PreviewPayment[] {
  return [{
    id: 'b6',
    source: 'BANK_IMPORT',
    date: '2026-10-15',
    payer: '김모아',
    amount: '30000',
    unitId: '101',
    reason: '과거 입금자명 일치 · 샘플 가져오기',
    accountId: 'a1',
    status: 'PENDING',
    allocations: []
  }];
}
