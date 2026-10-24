import { getAccountsForMonth } from '@/widgets/banking-workspace';
import type { ReportDefinition } from '@/shared/lib/excel-report';
import type { MonthlySettlementSnapshot } from '../api/monthlySettlementApiTypes';

/** 조회 가능한 동과 기존 귀속 원장의 동을 함께 제공해 선택하지 못한 내역이 조용히 빠지지 않게 합니다. */
export function getSettlementBuildingOptions(data: MonthlySettlementSnapshot) {
  const groups = [...data.balances.buildings].sort((a, b) => a.label.localeCompare(b.label, 'ko', {
    numeric: true
  }) || a.id.localeCompare(b.id))
    .map((building) => ({
      id: building.id,
      label: building.label
    }));
  for (const entry of data.balances.entries) {
    if (!entry.date.startsWith(data.month) || (BigInt(entry.income) === BigInt(0) && BigInt(entry.expense) === BigInt(0))) continue;
    if (!groups.some((group) => group.id === entry.buildingId)) groups.push({
      id: entry.buildingId,
      label: '동 확인 필요'
    });
  }
  return groups;
}

/** 기존 통장 거래와 같은 시작·종료 월·입출금 이력 규칙으로 필터를 구성하며 과거 수납 목록으로 계좌를 복원하지 않습니다. */
export function getSettlementAccountOptions(data: MonthlySettlementSnapshot) {
  return getAccountsForMonth(data.banking.accounts ?? [], data.month).map((account) => ({
    id: account.id,
    label: data.balances.accounts?.find((row) => row.id === account.id)?.label
      ?? `${account.bankName} ····${account.last4}${account.alias ? ` · ${account.alias}` : ''}`
  })).sort((a, b) => a.label.localeCompare(b.label, 'ko', {
    numeric: true
  }) || a.id.localeCompare(b.id));
}

/** 조회시각의 한국시간 월과 비교해 지난 월은 월 마감, 현재 월은 집계 중으로 표시합니다. */
export function getSettlementPeriodLabel(data: MonthlySettlementSnapshot): string {
  const currentMonth = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date(data.generatedAt));
  if (data.month < currentMonth) return `${Number(data.month.slice(5))}월 마감`;
  return data.month === currentMonth ? '집계 중' : '집계 예정';
}

/** 동·계좌 선택을 거래·소계·전체 합계에 먼저 적용하고 한 문서의 실제 입금·부담 지출만 구성합니다. */
export function getSettlementDocument(data: MonthlySettlementSnapshot, buildingId = '', accountId = ''): ReportDefinition {
  const groups = getSettlementBuildingOptions(data);
  const selected = groups.find((group) => group.id === buildingId);
  // 잘못된 선택을 전체 동으로 넓혀 다른 동의 내역을 파일에 넣지 않습니다.
  if (buildingId && !selected) throw new Error('INVALID_SETTLEMENT_BUILDING');
  const selectedAccount = getSettlementAccountOptions(data).find((account) => account.id === accountId);
  if (accountId && !selectedAccount) throw new Error('INVALID_SETTLEMENT_ACCOUNT');
  const scope = selected?.label ?? '전체 동';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(data.generatedAt)).map((part) => [part.type, part.value]));
  const generatedAt = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} (한국시간)`;
  const entries = data.balances.entries.filter((row) => row.date.startsWith(data.month)
    && (!buildingId || row.buildingId === buildingId)
    && (!accountId || row.accountId === accountId)
    && (BigInt(row.income) !== BigInt(0) || BigInt(row.expense) !== BigInt(0)));
  const rows: (string | bigint)[][] = [];
  let totalIncome = BigInt(0);
  let totalExpense = BigInt(0);
  let totalStart: bigint | null = BigInt(0);
  let totalEnd: bigint | null = BigInt(0);
  for (const group of selected ? [selected] : groups) {
    const movements = entries.filter((row) => row.buildingId === group.id)
      .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`) || a.id.localeCompare(b.id));
    const building = data.balances.buildings.find((row) => row.id === group.id);
    const accountBalance = building?.accountBalances?.find((row) => row.accountId === accountId);
    const scopedBalance = !accountId || data.balances.accountId === accountId;
    const start = scopedBalance ? building?.startBalance : accountBalance?.startBalance;
    const end = scopedBalance ? building?.balance : accountBalance?.balance;
    let running = start == null ? null : BigInt(start);
    totalStart = totalStart === null || start == null ? null : totalStart + BigInt(start);
    totalEnd = totalEnd === null || end == null ? null : totalEnd + BigInt(end);
    let income = BigInt(0);
    let expense = BigInt(0);
    for (const entry of movements) {
      const received = BigInt(entry.income);
      const paid = BigInt(entry.expense);
      income += received;
      expense += paid;
      // 월초 보유금에서 날짜순으로 누적하며 기준 잔액이 미설정이면 가짜 0원 잔액을 만들지 않습니다.
      if (running !== null) running += received - paid;
      const account = data.balances.accounts?.find((item) => item.id === entry.accountId)
        ?? data.payments.accounts.find((item) => item.id === entry.accountId);
      let direction = '지출';
      if (received !== BigInt(0)) direction = paid !== BigInt(0) ? '입금·지출' : '입금';
      rows.push([group.label, `${entry.date}${entry.time ? ` ${entry.time}` : ''}`, account?.label ?? '통장 미확인',
        direction, entry.label, received, paid, running ?? '설정 필요']);
    }
    if (!movements.length) rows.push([group.label, '', '', '내역 없음', '조회 월의 입금·지출 내역이 없습니다.', '', '', start == null ? '설정 필요' : BigInt(start)]);
    rows.push([group.label, '기초 잔액', start == null ? '설정 필요' : BigInt(start), '동별 합계', '', income, expense, end == null ? '설정 필요' : BigInt(end)]);
    totalIncome += income;
    totalExpense += expense;
  }
  return {
    title: selected ? `모아홈 ${selected.label} 입출금 내역` : '모아홈 동별 입출금 내역',
    sheet: '동별 입출금 내역',
    description: `${data.month} ${scope} 입금·지출 내역입니다. 지출액은 각 동의 실제 부담액입니다.`,
    columns: [
      {
        label: '동',
        width: 18
      }, {
        label: '거래일시',
        width: 28
      }, {
        label: '통장',
        width: 28
      },
      {
        label: '구분',
        width: 18
      }, {
        label: '입금자·지출명',
        width: 40
      },
      {
        label: '입금액',
        width: 24,
        align: 'right'
      }, {
        label: '지출액',
        width: 24,
        align: 'right'
      }, {
        label: '잔액',
        width: 24,
        align: 'right'
      }
    ],
    rows,
    total: [selected || selectedAccount ? '선택 범위 합계' : '전체 합계', '', '', '', '', totalIncome, totalExpense, totalEnd ?? '설정 필요'],
    summary: [{
      label: '조회 월',
      value: data.month
    }, {
      label: '조회 동',
      value: scope
    }, {
      label: '조회 계좌',
      value: selectedAccount?.label ?? '전체 계좌'
    }, {
      label: '조회시각',
      value: generatedAt
    }, {
      label: '기간 상태',
      value: getSettlementPeriodLabel(data)
    }, {
      label: '기초 잔액',
      value: totalStart ?? '설정 필요'
    }, {
      label: '월말 잔액',
      value: totalEnd ?? '설정 필요'
    }, {
      label: '입출금 내역',
      value: `${entries.length}건`
    }],
    note: '기초 잔액 + 입금액 - 지출액 = 월말 잔액입니다. 동별 귀속이 확정된 자금을 기준으로 표시합니다.'
  };
}

/** Excel과 PDF에서 같은 동별 소계·기초/월말 잔액·거래 행을 재사용합니다. */
export function getSettlementSections(document: ReportDefinition) {
  return [...new Set(document.rows.map((row) => String(row[0])))].map((label) => {
    const own = document.rows.filter((row) => row[0] === label);
    const subtotal = own.find((row) => row[3] === '동별 합계');
    return {
      label,
      start: typeof subtotal?.[2] === 'bigint' ? subtotal[2] : null,
      end: typeof subtotal?.[7] === 'bigint' ? subtotal[7] : null,
      rows: own.filter((row) => row[3] !== '동별 합계' && row[3] !== '내역 없음'),
      income: BigInt(subtotal?.[5] ?? 0),
      expense: BigInt(subtotal?.[6] ?? 0)
    };
  });
}

/** 선택한 동·계좌의 월 전체 입출금을 미리보기와 같은 한 시트로 저장합니다. */
export async function createSettlementWorkbook(data: MonthlySettlementSnapshot, buildingId = '', accountId = ''): Promise<Blob> {
  const { createSettlementStyledWorkbook } = await import('./settlementWorkbook');
  return createSettlementStyledWorkbook(getSettlementDocument(data, buildingId, accountId));
}
