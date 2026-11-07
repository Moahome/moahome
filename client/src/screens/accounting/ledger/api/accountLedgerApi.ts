import { authenticatedAPI } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { ApiError } from '@/shared/api';
import {
  isValidMonth,
  isValidMonthRange
} from '@/shared/lib/month-range';
import type {
  AccountLedgerQuery,
  AccountLedgerWorkspace
} from './accountLedgerApiTypes';

/** 화면과 다운로드가 다른 대상·과목·누계 또는 잘못된 원화 응답을 사용하지 않게 대조합니다. */
export async function getAccountLedger(query: AccountLedgerQuery): Promise<AccountLedgerWorkspace> {
  const { propertyId, startMonth, endMonth, buildingId, accountId, signal } = query;
  const selectedIds = [...new Set(query.accountIds ?? (accountId ? [accountId] : []))].sort();
  const value = await authenticatedAPI<AccountLedgerWorkspace>({
    url: `/api/properties/${propertyId}/accounting/ledger`,
    data: {
      startMonth,
      endMonth,
      buildingId: buildingId || undefined,
      bankAccountId: query.bankAccountId || undefined,
      accountId: query.accountIds ? undefined : accountId || undefined,
      accountIds: query.accountIds?.length ? selectedIds.join(',') : undefined
    },
    signal
  });
  const invalid = () => { throw new ApiError(200, 'INVALID_RESPONSE', '원장 자료를 확인할 수 없습니다.'); };
  const id = (input: unknown) => typeof input === 'string' && isPropertyId(input);
  const amount = (input: unknown) => typeof input === 'string' && /^\d{1,30}$/.test(input);
  const signedAmount = (input: unknown) => typeof input === 'string' && /^-?\d{1,30}$/.test(input);
  const date = (input: unknown) => typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
    && Number.isFinite(Date.parse(`${input}T00:00:00Z`)) && new Date(`${input}T00:00:00Z`).toISOString().slice(0, 10) === input;
  if (!value || value.propertyId !== propertyId || typeof value.propertyName !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt)) || !value.range || !isValidMonthRange(value.range)
    || (startMonth !== undefined && (value.range.startMonth !== startMonth || value.range.endMonth !== endMonth))
    || value.accountId !== (selectedIds.length === 1 ? selectedIds[0] : null)
    || !Array.isArray(value.accountIds) || [...value.accountIds].sort().join(',') !== selectedIds.join(',') || value.buildingId !== (buildingId || null) || value.bankAccountId !== (query.bankAccountId || null)
    || typeof value.supported !== 'boolean' || typeof value.canManage !== 'boolean'
    || !['SETUP_REQUIRED', 'NO_BILLING', 'BEFORE_START', 'READY', 'REVIEW_REQUIRED'].includes(value.completeness)
    || !Array.isArray(value.buildings) || !Array.isArray(value.accounts) || !Array.isArray(value.rows)
    || !Array.isArray(value.bankBalances) || !Array.isArray(value.issues) || !amount(value.revenue) || !amount(value.expense)) invalid();
  if (value.configuration === undefined || (value.configuration !== null && (!isValidMonth(value.configuration.startMonth)
    || !Number.isInteger(value.configuration.fiscalYearStartMonth) || value.configuration.fiscalYearStartMonth < 1
    || value.configuration.fiscalYearStartMonth > 12))) invalid();
  if (!['SETUP_REQUIRED', 'NO_BILLING'].includes(value.completeness) && value.configuration === null) invalid();
  if (value.buildings.some((row) => !row || !id(row.id) || typeof row.name !== 'string' || typeof row.deleted !== 'boolean')
    || value.accounts.some((row) => !row || !id(row.id) || !/^[12489]\d{2}$/.test(row.code)
      || typeof row.name !== 'string' || !['asset', 'liability', 'operatingRevenue', 'operatingExpense', 'otherRevenue', 'otherExpense'].includes(row.group))
    || new Set(value.accounts.map((row) => row.id)).size !== value.accounts.length
    || new Set(value.rows.map((row) => row?.entry?.id)).size !== value.rows.length) invalid();
  const selected = selectedIds.every((selectedId) => value.accounts.some((row) => row.id === selectedId));
  if ((!selected) || (buildingId && !value.buildings.some((row) => row.id === buildingId))
    || value.supported !== true) invalid();
  if ((!value.supported || ['SETUP_REQUIRED', 'NO_BILLING', 'BEFORE_START'].includes(value.completeness)) && value.rows.length) invalid();
  if (value.bankBalances.some((row) => !row || !id(row.accountId) || typeof row.name !== 'string'
    || !amount(row.income) || !amount(row.expense) || (row.openingBalance !== null && !signedAmount(row.openingBalance))
    || (row.closingBalance !== null && !signedAmount(row.closingBalance))
    || (row.openingBalance !== null && row.closingBalance !== null
      && BigInt(row.openingBalance) + BigInt(row.income) - BigInt(row.expense) !== BigInt(row.closingBalance)))
    || new Set(value.bankBalances.map((row) => row.accountId)).size !== value.bankBalances.length) invalid();
  let revenue = BigInt(0);
  let expense = BigInt(0);
  const cumulative = new Map<string, bigint>();
  // 서버의 최신순 표를 역순으로 대조해 페이지를 넘겨도 과목별 누계가 바뀌지 않음을 확인합니다.
  for (const row of [...value.rows].reverse()) {
    const entry = row?.entry;
    const source = entry?.source;
    if (!entry || typeof entry.id !== 'string' || !signedAmount(entry.amount) || !signedAmount(row.cumulativeAmount)
      || !isValidMonth(entry.month) || entry.month < value.range.startMonth || entry.month > value.range.endMonth
      || !value.accounts.some((account) => account.id === entry.accountId && account.name === entry.accountName && account.group === entry.group)
      || (!['asset', 'liability'].includes(entry.group) && !amount(entry.amount)) || (selectedIds.length > 0 && !selectedIds.includes(entry.accountId))
      || (entry.buildingId !== null && !value.buildings.some((building) => building.id === entry.buildingId))
      || (buildingId && entry.buildingId !== buildingId) || !source
      || (source.kind === 'BILLING' ? source.id !== null : !id(source.id))
      || !['CHARGE', 'BILLING', 'EXPENSE', 'OTHER_INCOME', 'BANK', 'TRANSFER', 'RECEIVABLE', 'RECEIPT', 'OPENING_CREDIT', 'EXTERNAL', 'PAYABLE'].includes(source.kind) || typeof source.name !== 'string'
      || typeof source.context !== 'string' || typeof source.path !== 'string'
      || (source.date !== null && !date(source.date))
      || (source.time !== null && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(source.time))
      || (['CHARGE', 'BILLING'].includes(source.kind) && source.time !== null)
      || (source.kind !== 'CHARGE' && source.date === null)) invalid();
    if (source.kind === 'PAYABLE' && source.path !== `/accounting/payables/${source.id}`) invalid();
    if (source.kind === 'BILLING') {
      if (source.path !== `/billing/monthly/history/${entry.month}` || source.date?.slice(0, 7) !== entry.month || !Array.isArray(row.sourceIds)
        || row.sourceIds.length === 0 || new Set(row.sourceIds).size !== row.sourceIds.length
        || row.sourceIds.some((value) => !value.startsWith('charge:') || !id(value.slice(7)))) invalid();
    }
    // 원본 종류에 맞는 기존 상세만 허용해 입금을 출금 상세로 보내거나 귀속 월을 바꾸지 않습니다.
    if (source.kind === 'CHARGE' || source.kind === 'RECEIVABLE') {
      const path = source.path.match(/^\/banking\/monthly\/(\d{4}-\d{2})\/([0-9a-f-]{36})\?month=(\d{4}-\d{2})$/i);
      if (!path || !id(path[2]) || path[1] !== entry.month || path[3] !== entry.month) invalid();
    }
    if (source.kind === 'EXPENSE') {
      const path = source.path.match(/^\/banking\/transactions\/([0-9a-f-]{36})$/i);
      if (!path || !id(path[1])) invalid();
    }
    if (['OTHER_INCOME', 'RECEIPT'].includes(source.kind) && source.path !== `/banking/receipts/${source.id}`) invalid();
    if (source.kind === 'RECEIPT' && !['asset', 'liability'].includes(entry.group)) invalid();
    if (source.kind === 'OPENING_CREDIT' && source.path !== '/billing/monthly/initial-correction') invalid();
    if (['BANK', 'TRANSFER', 'EXTERNAL'].includes(source.kind)
      && !/^\/banking\/(transactions|balances)(\/[0-9a-f-]{36})?\?[a-zA-Z0-9=&-]+$/.test(source.path)) invalid();
    if (['BANK', 'TRANSFER', 'RECEIVABLE', 'EXTERNAL'].includes(source.kind) && entry.group !== 'asset') invalid();
    if (source.kind === 'OPENING_CREDIT' && !['asset', 'liability'].includes(entry.group)) invalid();
    if (row.cashBalance) {
      const cash = row.cashBalance;
      if ((query.bankAccountId && cash.bankAccountId !== query.bankAccountId) || !id(cash.bankAccountId) || typeof cash.bankAccountName !== 'string'
        || value.accounts.find((account) => account.id === entry.accountId)?.systemKey !== 'BANK'
        || !value.bankBalances.some((bank) => bank.accountId === cash.bankAccountId && bank.name === cash.bankAccountName)
        || (cash.ledgerBalance !== null && !signedAmount(cash.ledgerBalance))
        || (cash.reportedBalance !== null && !signedAmount(cash.reportedBalance))) invalid();
    }
    const total = (cumulative.get(entry.accountId) ?? BigInt(0)) + BigInt(entry.amount);
    if (BigInt(row.cumulativeAmount) !== total) invalid();
    cumulative.set(entry.accountId, total);
    if (entry.group.endsWith('Revenue')) revenue += BigInt(entry.amount);
    else if (entry.group.endsWith('Expense')) expense += BigInt(entry.amount);
  }
  if (revenue !== BigInt(value.revenue) || expense !== BigInt(value.expense)
    || (value.completeness === 'READY' && value.issues.length > 0)
    || (value.completeness === 'REVIEW_REQUIRED' && !value.issues.length)) invalid();
  if (value.issues.some((issue) => !issue || typeof issue.id !== 'string' || typeof issue.label !== 'string'
    || typeof issue.sourceName !== 'string' || typeof issue.sourceContext !== 'string'
    || !/^-?\d{1,30}$/.test(issue.amount) || typeof issue.path !== 'string'
    || !/^\/(banking|billing)\/[a-zA-Z0-9/?=&-]+$/.test(issue.path))) invalid();
  return value;
}
