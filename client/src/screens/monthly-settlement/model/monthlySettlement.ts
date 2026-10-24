import {
  getMonthlyPreviewRows,
  getMonthlyPreviewIncome,
  getPreviewDueDate
} from '@/widgets/payment-workspace';
import type { MonthlySettlementSnapshot } from '../api/monthlySettlementApiTypes';
import type {
  SettlementAccount,
  SettlementCashRow,
  SettlementCheck,
  SettlementExternal,
  SettlementRecoveryStatus
} from './monthlySettlementTypes';

const SOURCE_LABELS: Record<string, string> = {
  DIRECT_CHECK: '직접 확인',
  BANK_TRANSACTION: '은행 거래',
  BANK_IMPORT: '은행 거래',
  OPENING: '시작 잔액',
  ACCOUNT_OPENING: '시작 잔액',
  HANDOVER: '잔액 인계'
};

/** 실제 입출금과 청구 충당을 분리하고 취소·연결된 수동 입금은 은행 원본과 중복 합산하지 않습니다. */
export function getSettlementReport(data: MonthlySettlementSnapshot) {
  const month = data.month;
  const bankRows = data.banking.rows.filter((row) => row.date.startsWith(month));
  const cash: SettlementCashRow[] = bankRows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    label: row.expense?.category || row.payer,
    amount: BigInt(row.amount),
    direction: row.direction,
    source: row.sourceType === 'MANUAL' ? '수동 지출' : '은행 원본',
    transfer: row.transferId != null
  }));
  const manual = data.payments.payments.filter((row) => row.source === 'MANUAL' && row.status === 'CONFIRMED'
    && !row.bankTransactionId && !row.linkedPaymentId && row.date.startsWith(month));
  for (const row of manual) cash.push({
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    label: row.payer,
    amount: BigInt(row.amount),
    direction: 'INCOME',
    source: '수동 입금',
    transfer: false
  });
  cash.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  // 기존 월별 수납 표의 이월·선입금 충당과 정산 확인 상태를 그대로 사용합니다.
  const collections = getMonthlyPreviewRows(data.payments, month);
  const sumCollections = (key: 'carry' | 'billed' | 'applied' | 'balance') => collections.reduce((sum, row) => sum + row[key], BigInt(0));
  const bankIncome = cash.filter((row) => row.direction === 'INCOME').reduce((sum, row) => sum + row.amount, BigInt(0));
  const bankExpense = cash.filter((row) => row.direction === 'EXPENSE').reduce((sum, row) => sum + row.amount, BigInt(0));
  const householdIncome = getMonthlyPreviewIncome(data.payments, month).household;
  // 동 이름의 숫자를 비교해 2동·10동과 102동·103동 모두 자연스러운 오름차순으로 표시합니다.
  const buildings = [...data.balances.buildings].sort((a, b) => a.label.localeCompare(b.label, 'ko', {
    numeric: true
  }) || a.id.localeCompare(b.id));
  const buildingBalance = buildings.length && buildings.every((row) => row.balance !== null)
    ? buildings.reduce((sum, row) => sum + BigInt(row.balance!), BigInt(0)) : null;
  // 원천 응답을 변경하지 않고 지출일 최신순을 화면·Excel에 함께 적용합니다.
  const externalRows: SettlementExternal[] = data.balances.externals.map((row) => ({
    ...row,
    recoveryStatus: getExternalRecoveryStatus(row)
  })).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const external = externalRows.filter((row) => !row.excluded);
  const outstanding = external.reduce((sum, row) => sum + BigInt(row.remaining), BigInt(0));
  const end = getPreviewDueDate(month);
  const accounts: SettlementAccount[] = (data.balances.accounts ?? []).map((row) => {
    // 월말 계산값과 시점이 같은 일 마감 확인값만 차액을 산출합니다. 0원 차액도 대사 확정은 아닙니다.
    const comparable = row.balance !== null && row.calculatedBalance != null && row.confirmation?.status === 'READY'
      && row.confirmation.date === end && row.confirmation.precision === 'DAY_END';
    const difference = comparable ? BigInt(row.balance!) - BigInt(row.calculatedBalance!) : null;
    let comparison = '비교 시점 확인 필요';
    if (row.balance === null) comparison = '은행 확인 자료 필요';
    else if (row.calculatedBalance == null) comparison = '계산 기준 자료 필요';
    else if (difference !== null) comparison = difference === BigInt(0) ? '동일 시점 차액 없음' : '차액 확인 필요';
    return {
      id: row.id,
      label: row.label,
      confirmed: row.balance,
      asOf: row.asOf,
      source: SOURCE_LABELS[row.confirmation?.source ?? ''] ?? row.confirmation?.source ?? '—',
      calculated: row.calculatedBalance ?? null,
      basis: row.calculationBasisDate ?? null,
      difference,
      comparison
    };
  });
  const unclassified = bankRows.filter((row) => !['CONFIRMED', 'TRANSFER'].includes(row.status));
  const unresolvedCharges = collections.filter((row) => row.settlementPending);
  // 은행 원본의 비교 키를 먼저 모아 많은 거래에서도 중복 후보를 반복 전수 탐색하지 않습니다.
  const bankKeys = new Set(bankRows.filter((row) => row.sourceType !== 'MANUAL')
    .map((row) => `${row.accountId}:${row.date}:${row.direction}:${BigInt(row.amount)}`));
  const potentialManualDuplicates = cash.filter((row) => row.source.startsWith('수동')
    && bankKeys.has(`${row.accountId}:${row.date}:${row.direction}:${row.amount}`));
  const checks: SettlementCheck[] = [
    {
      id: 'classification',
      title: '거래 분류 확인',
      description: '선택 월의 미분류·보류·취소·이체 연결 대기 거래입니다.',
      count: unclassified.length,
      path: 'banking/transactions'
    },
    {
      id: 'accounts',
      title: '통장 잔액 확인',
      description: '확인·계산 자료가 부족하거나 비교 시점·차액을 확인할 통장입니다.',
      count: accounts.filter((row) => row.difference !== BigInt(0)).length,
      path: 'banking/balances'
    },
    {
      id: 'buildings',
      title: '동별 시작 보유금 확인',
      description: '기초 또는 기말 보유금이 미설정인 동입니다.',
      count: buildings.filter((row) => row.startBalance === null || row.balance === null).length,
      path: 'banking/balances'
    },
    {
      id: 'charges',
      title: '청구 정산 기준 확인',
      description: '0원·음수 청구 등 기존 수납 화면에서 정산 확인이 필요한 세대입니다.',
      count: unresolvedCharges.length,
      path: 'banking/monthly'
    },
    {
      id: 'manual',
      title: '수동 등록 중복 확인',
      description: '같은 통장·날짜·방향·금액의 은행 원본이 있습니다. 자동으로 제외하지 않습니다.',
      count: potentialManualDuplicates.length,
      path: 'banking/transactions'
    },
    {
      id: 'external',
      title: '외부 부담금 미회수 내역',
      description: '정산 제외분을 뺀 조회 월말까지의 미회수 내역입니다. 오류나 마감 차단을 뜻하지 않습니다.',
      count: external.filter((row) => BigInt(row.remaining) > BigInt(0)).length,
      path: 'banking/balances'
    }
  ];
  return {
    cash,
    collections,
    accounts,
    buildings,
    external: externalRows,
    checks,
    bankIncome,
    bankExpense,
    householdIncome,
    buildingBalance,
    outstanding,
    billed: sumCollections('billed') + collections.reduce((sum, row) => sum + (row.settlementAmount ?? BigInt(0)), BigInt(0)),
    applied: sumCollections('applied'),
    receivable: unresolvedCharges.length ? null : sumCollections('balance'),
    checkCount: checks.reduce((sum, row) => sum + row.count, 0)
  };
}

/** 제외 내역은 회수 완료로 바꾸지 않고 유효 회수액과 잔여액으로 회수 진행 상태를 표시합니다. */
function getExternalRecoveryStatus(row: MonthlySettlementSnapshot['balances']['externals'][number]): SettlementRecoveryStatus {
  if (row.excluded) return '정산 제외';
  if (BigInt(row.remaining) === BigInt(0)) return '회수 완료';
  if (BigInt(row.received) > BigInt(0)) return '일부 회수';
  return '회수 필요';
}

/** 검색은 표시명에만 적용하고 월 전체 집계와 내려받을 원천 자료는 바꾸지 않습니다. */
function matchesSettlementQuery(query: string, ...values: string[]) {
  const keyword = query.trim().toLocaleLowerCase('ko-KR');
  return values.join(' ').toLocaleLowerCase('ko-KR').includes(keyword);
}

/** 통장명 검색과 동일 시점 비교 가능 여부·차액 필터를 페이지를 나누기 전에 적용합니다. */
export function filterSettlementAccounts(rows: SettlementAccount[], query: string, status: string) {
  return rows.filter((row) => {
    if (!matchesSettlementQuery(query, row.label)) return false;
    if (status === '차액 없음') return row.difference === BigInt(0);
    if (status === '차액 있음') return row.difference !== null && row.difference !== BigInt(0);
    if (status === '비교 자료 필요') return row.difference === null;
    return true;
  });
}

/** 동 검색과 보유금 설정 여부로 좁히되 미설정 금액을 0원으로 취급하지 않습니다. */
export function filterSettlementBuildings(rows: MonthlySettlementSnapshot['balances']['buildings'], query: string, status: string) {
  return rows.filter((row) => {
    if (!matchesSettlementQuery(query, row.label)) return false;
    const configured = row.startBalance !== null && row.balance !== null;
    if (status === '설정됨') return configured;
    if (status === '설정 필요') return !configured;
    return true;
  });
}

/** 미회수 전체에는 회수 필요·일부 회수만 포함하며 정산 제외 이력을 섞지 않습니다. */
export function filterSettlementExternal(rows: SettlementExternal[], query: string, status: string) {
  return rows.filter((row) => {
    if (!matchesSettlementQuery(query, row.label, row.expenseName)) return false;
    if (status === '미회수 전체') return row.recoveryStatus === '회수 필요' || row.recoveryStatus === '일부 회수';
    return status === '전체' || row.recoveryStatus === status;
  });
}
