import type { MonthlySettlementSnapshot } from '../../src/screens/monthly-settlement/api/monthlySettlementApiTypes';
import type { BankingTransaction } from '../../src/widgets/banking-workspace/api/bankingApiTypes';

export const settlementId = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const SETTLEMENT_PROPERTY = settlementId(1);
export const SETTLEMENT_ACCOUNT = settlementId(2);

export function settlementFixture(): MonthlySettlementSnapshot {
  const id = settlementId;
  const propertyId = SETTLEMENT_PROPERTY;
  const accountId = SETTLEMENT_ACCOUNT;
  const bankRow = (key: number, direction: BankingTransaction['direction'], amount: string): BankingTransaction => ({
    id: id(key),
    accountId,
    date: '2026-10-15',
    time: null,
    payer: '거래 내용',
    memo: null,
    amount,
    balance: '120000',
    direction,
    ruleKey: '',
    paymentId: null,
    status: 'CONFIRMED',
    unitId: '',
    unitLabel: '',
    expense: null
  });
  const income = bankRow(10, 'INCOME', '30000');
  const expense = bankRow(11, 'EXPENSE', '20000');
  const transferIn = {
    ...bankRow(12, 'INCOME', '7000'),
    status: 'TRANSFER',
    transferId: id(99)
  };
  const transferOut = {
    ...bankRow(13, 'EXPENSE', '7000'),
    status: 'TRANSFER',
    transferId: id(99)
  };
  expense.expense = {
    id: id(40),
    category: '전기요금',
    mode: 'AMOUNT',
    note: '',
    saveAsRule: false,
    allocations: [
      {
        buildingId: id(3),
        label: '102동',
        amount: '12000',
        percentage: null
      },
      {
        buildingId: null,
        label: '외부',
        amount: '8000',
        percentage: null
      }
    ]
  };
  return {
    propertyId,
    month: '2026-10',
    generatedAt: '2026-10-31T14:30:00Z',
    banking: {
      accounts: [{
        id: accountId,
        bankName: '하나은행',
        last4: '1234',
        alias: null,
        isPrimary: true,
        status: 'ACTIVE',
        availableFrom: '2026-09-01',
        closedOn: null,
        hasHistory: true
      }],
      propertyId,
      asOf: '2026-10-31',
      buildings: [{
        id: id(3),
        label: '102동'
      }],
      units: [{
        id: id(4),
        label: '102동 101호'
      }],
      rows: [income, expense, transferIn, transferOut],
      rules: []
    },
    balances: {
      propertyId,
      month: '2026-10',
      cutoffDate: '2026-09-30',
      bankBalance: '120000',
      bankAsOf: '2026-10-31 마감 잔액',
      accounts: [{
        id: accountId,
        label: '하나은행 ····1234',
        status: 'ACTIVE',
        balance: '120000',
        asOf: '2026-10-31 마감 잔액',
        calculatedBalance: '120000',
        calculationBasisDate: '2026-09-30',
        confirmation: {
          source: 'HANDOVER',
          sourceId: id(90),
          date: '2026-10-31',
          time: null,
          precision: 'DAY_END',
          status: 'READY'
        }
      }],
      buildings: [{
        id: id(3),
        label: '102동',
        active: true,
        startBalance: '100000',
        income: '40000',
        expense: '12000',
        balance: '128000',
        status: 'READY',
        accountBalances: [{
          accountId,
          startBalance: '100000',
          balance: '128000'
        }]
      }],
      entries: [
        {
          id: id(91),
          buildingId: id(3),
          accountId,
          date: '2026-10-15',
          time: '09:00:00',
          label: '102동 101호 관리비',
          income: '30000',
          expense: '0'
        },
        {
          id: id(92),
          buildingId: id(3),
          accountId,
          date: '2026-10-16',
          time: null,
          label: '동별 기타 입금',
          income: '10000',
          expense: '0'
        },
        {
          id: id(93),
          buildingId: id(3),
          accountId,
          date: '2026-10-15',
          time: '12:00:00',
          label: '전기요금 부담',
          income: '0',
          expense: '12000'
        }
      ],
      incomes: [],
      pending: [],
      externals: [
        {
          id: id(50),
          label: '외부 A',
          expenseName: '전기요금',
          date: '2026-10-15',
          amount: '8000',
          received: '2000',
          remaining: '6000',
          recoveries: []
        },
        {
          id: id(51),
          label: '외부 B',
          expenseName: '통과 자금',
          date: '2026-09-15',
          amount: '5000',
          received: '0',
          remaining: '5000',
          excluded: true,
          recoveries: []
        }
      ]
    },
    payments: {
      propertyId,
      asOf: '2026-10-31',
      accounts: [{
        id: accountId,
        label: '하나은행 ····1234'
      }],
      units: [{
        id: id(4),
        label: '102동 101호',
        status: 'ACTIVE',
        representativeName: '주민',
        buildingName: '102동'
      }],
      charges: [
        {
          id: id(60),
          unitId: id(4),
          month: '2026-09',
          amount: '40000',
          status: 'ISSUED'
        },
        {
          id: id(61),
          unitId: id(4),
          month: '2026-10',
          amount: '50000',
          status: 'ISSUED'
        }
      ],
      payments: [
        {
          id: id(70),
          source: 'BANK_IMPORT',
          status: 'CONFIRMED',
          accountId,
          date: '2026-09-20',
          payer: '주민',
          amount: '10000',
          unitId: id(4),
          reason: '',
          allocations: []
        },
        {
          id: id(71),
          source: 'BANK_IMPORT',
          status: 'CONFIRMED',
          accountId,
          date: '2026-10-15',
          payer: '주민',
          amount: '30000',
          unitId: id(4),
          bankTransactionId: id(10),
          reason: '',
          allocations: []
        },
        {
          id: id(72),
          source: 'MANUAL',
          status: 'CONFIRMED',
          accountId,
          date: '2026-10-16',
          payer: '주민',
          amount: '10000',
          unitId: id(4),
          reason: '',
          allocations: []
        },
        {
          id: id(73),
          source: 'MANUAL',
          status: 'CANCELED',
          accountId,
          date: '2026-10-16',
          payer: '취소 입금',
          amount: '9999',
          unitId: id(4),
          reason: '',
          allocations: []
        },
        {
          id: id(74),
          source: 'MANUAL',
          status: 'LINKED',
          accountId,
          date: '2026-10-15',
          payer: '연결 입금',
          amount: '30000',
          unitId: id(4),
          linkedPaymentId: id(71),
          reason: '',
          allocations: []
        }
      ],
      history: []
    }
  };
}

/** 응답 순서와 무관한 정렬·회수 단계·자료 부족 필터를 함께 검증할 상세 자료입니다. */
export function settlementDetailFixture(): MonthlySettlementSnapshot {
  const data = settlementFixture();
  const account = data.balances.accounts![0];
  data.banking.accounts!.push({
    ...data.banking.accounts![0],
    id: settlementId(201),
    bankName: '카카오뱅크',
    last4: '1004',
    isPrimary: false
  }, {
    ...data.banking.accounts![0],
    id: settlementId(202),
    bankName: '국민은행',
    last4: '2004',
    isPrimary: false
  });
  data.balances.accounts!.push({
    ...account,
    id: settlementId(201),
    label: '카카오뱅크 ····1004',
    balance: '120500'
  },
  {
    ...account,
    id: settlementId(202),
    label: '국민은행 ····2004',
    balance: null
  });
  const building = data.balances.buildings[0];
  data.balances.buildings = [
    {
      ...building,
      id: settlementId(203),
      label: '103동',
      startBalance: null,
      balance: null,
      status: 'OPENING_REQUIRED'
    },
    {
      ...building,
      id: settlementId(204),
      label: '2동'
    },
    building,
    {
      ...building,
      id: settlementId(205),
      label: '10동'
    }
  ];
  const external = data.balances.externals[0];
  data.balances.externals.push(
    {
      ...external,
      id: settlementId(206),
      label: '외부 C',
      date: '2026-10-20',
      received: '8000',
      remaining: '0'
    },
    {
      ...external,
      id: settlementId(207),
      label: '외부 D',
      date: '2026-10-16',
      expenseName: '수도요금',
      received: '0',
      remaining: '8000'
    }
  );
  return data;
}
