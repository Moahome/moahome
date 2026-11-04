import type {
  IncomeGroup,
  IncomeRecord,
  IncomeStatementSource
} from '../../src/screens/accounting/income-statement/model/incomeStatementTypes';

const EXAMPLE_ACCOUNTS: readonly { id: string; name: string; group: IncomeGroup; amounts: readonly number[] }[] = [
  {
    id: 'management-revenue',
    name: '관리비수익',
    group: 'operatingRevenue',
    amounts: [1180000, 1200000, 1150000, 1230000]
  },
  {
    id: 'cleaning',
    name: '청소비',
    group: 'operatingExpense',
    amounts: [180000, 180000, 180000, 180000]
  },
  {
    id: 'electricity',
    name: '공용전기료',
    group: 'operatingExpense',
    amounts: [155000, 160000, 150000, 155000]
  },
  {
    id: 'elevator',
    name: '승강기 유지보수비',
    group: 'operatingExpense',
    amounts: [275000, 275000, 275000, 275000]
  },
  {
    id: 'septic',
    name: '정화조 청소비',
    group: 'operatingExpense',
    amounts: [75000, 75000, 75000, 75000]
  },
  {
    id: 'repairs',
    name: '수선유지비',
    group: 'operatingExpense',
    amounts: [255000, 270000, 260000, 235000]
  }
];

/** 시안 확인용 가상 자료이며 실제 관리대상·청구·수납·통장 자료와 연결하지 않습니다. */
export function createIncomeStatementExample(): IncomeStatementSource {
  const buildings = [{
    id: 'example-a',
    name: '예시 A동'
  }, {
    id: 'example-b',
    name: '예시 B동'
  }];
  const records: IncomeRecord[] = EXAMPLE_ACCOUNTS.flatMap((account) => account.amounts.flatMap((amount, index) => {
    const month = `2026-${String(index + 7).padStart(2, '0')}`;
    // 두 예시 동의 합계가 항상 전체와 일치하도록 같은 과목·월 금액을 60:40으로 나눕니다.
    return buildings.map((building, buildingIndex) => ({
      id: `${account.id}:${month}:${building.id}`,
      accountId: account.id,
      accountName: account.name,
      group: account.group,
      month,
      buildingId: building.id,
      amount: String(amount * (buildingIndex === 0 ? 3 : 2) / 5)
    }));
  }));
  return {
    isExample: true,
    propertyName: '예시 관리대상',
    availableRange: {
      startMonth: '2026-07',
      endMonth: '2026-10'
    },
    buildings,
    records
  };
}
