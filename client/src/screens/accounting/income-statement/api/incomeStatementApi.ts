import { authenticatedAPI } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { ApiError } from '@/shared/api';
import {
  isValidMonth,
  isValidMonthRange
} from '@/shared/lib/month-range';
import type {
  ConfigureAccountingRequest,
  CreateAccountingAccountRequest,
  CreateAccountingAccountResponse,
  IncomeStatementQuery,
  IncomeStatementWorkspace,
  ReviewAccountingExpenseRequest,
  ReviewAccountingRevenueRequest
} from './incomeStatementApiTypes';

/** 응답 장애·다른 대상·잘못된 원화나 범위를 예시·0원 자료로 대체하지 않습니다. */
export async function getIncomeStatementWorkspace({ propertyId, startMonth, endMonth, buildingId, signal }: IncomeStatementQuery): Promise<IncomeStatementWorkspace> {
  const value = await authenticatedAPI<IncomeStatementWorkspace>({
    url: `/api/properties/${propertyId}/accounting/income-statement`,
    data: {
      startMonth,
      endMonth,
      buildingId: buildingId || undefined
    },
    signal
  });
  const invalid = () => { throw new ApiError(200, 'INVALID_RESPONSE', '손익 자료를 확인할 수 없습니다.'); };
  const amount = (value: unknown) => typeof value === 'string' && /^-?\d{1,30}$/.test(value);
  const id = (value: unknown) => typeof value === 'string' && isPropertyId(value);
  const group = (value: unknown) => ['operatingRevenue', 'operatingExpense', 'otherRevenue', 'otherExpense'].includes(String(value));
  if (!value || value.propertyId !== propertyId || typeof value.propertyName !== 'string'
    || !Number.isFinite(Date.parse(value.generatedAt)) || !value.range || !isValidMonthRange(value.range)
    || (startMonth !== undefined && (value.range.startMonth !== startMonth || value.range.endMonth !== endMonth))
    || typeof value.canManage !== 'boolean'
    || !['SETUP_REQUIRED', 'BEFORE_START', 'READY', 'REVIEW_REQUIRED'].includes(value.completeness)
    || !Array.isArray(value.buildings) || !Array.isArray(value.accounts) || !Array.isArray(value.records)
    || !Array.isArray(value.issues) || !Array.isArray(value.expenses) || !Array.isArray(value.revenueItems)) invalid();
  if (value.completeness !== 'SETUP_REQUIRED' && (!value.configuration || !isValidMonth(value.configuration.startMonth)
    || !Number.isInteger(value.configuration.fiscalYearStartMonth) || value.configuration.fiscalYearStartMonth < 1
    || value.configuration.fiscalYearStartMonth > 12)) invalid();
  if (value.buildings.some((row) => !row || !id(row.id) || typeof row.name !== 'string')
    || value.accounts.some((row) => !row || !id(row.id) || typeof row.name !== 'string' || !group(row.group))
    || value.records.some((row) => !row || typeof row.id !== 'string' || !id(row.accountId)
      || !group(row.group) || !amount(row.amount) || !isValidMonth(row.month)
      || row.month < value.range.startMonth || row.month > value.range.endMonth
      || (row.buildingId !== null && !id(row.buildingId))
      || (row.buildingId !== null && !value.buildings.some((building) => building.id === row.buildingId))
      || (buildingId && row.buildingId !== buildingId)
      || !value.accounts.some((account) => account.id === row.accountId && account.group === row.group && account.name === row.accountName))
    || value.issues.some((row) => !row || typeof row.id !== 'string' || typeof row.label !== 'string'
      || typeof row.code !== 'string' || !amount(row.amount) || typeof row.path !== 'string'
      || !/^\/(billing|banking)\//.test(row.path)
      || (row.expenseId !== null && !id(row.expenseId)) || (row.revenueItemId !== null && !id(row.revenueItemId)))
    || value.expenses.some((row) => !row || !id(row.id) || !id(row.transactionId) || !amount(row.amount)
      || typeof row.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !Number.isInteger(row.revision) || row.revision < 0
      || (row.accountId !== null && !value.accounts.some((account) => account.id === row.accountId && account.group.endsWith('Expense')))
      || (row.recognitionMonth !== null && !isValidMonth(row.recognitionMonth)))
    || value.revenueItems.some((row) => !row || !id(row.id) || typeof row.name !== 'string' || !amount(row.amount)
      || typeof row.recognized !== 'boolean' || !Number.isInteger(row.revision) || row.revision < 0)) invalid();
  if (new Set(value.records.map((row) => row.id)).size !== value.records.length
    || (value.completeness === 'READY' && value.issues.length)
    || (value.completeness === 'REVIEW_REQUIRED' && !value.issues.length)
    || (['SETUP_REQUIRED', 'BEFORE_START'].includes(value.completeness) && value.records.length)) invalid();
  return {
    ...value,
    availableRange: {
      startMonth: value.configuration?.startMonth ?? value.range.startMonth,
      endMonth: value.range.endMonth
    },
    records: value.records.map((record) => ({
      ...record,
      buildingId: record.buildingId ?? ''
    })),
    isExample: false,
    notice: value.completeness === 'REVIEW_REQUIRED'
      ? '확인 필요 항목이 남아 있어 확인된 자료만 반영한 잠정 손익입니다.'
      : '등록된 부과와 확인한 지출 귀속 기준이며 회계 마감 확정 자료가 아닙니다.'
  };
}

export async function configureAccounting(propertyId: string, request: ConfigureAccountingRequest) {
  await authenticatedAPI<void>({
    method: 'POST',
    url: `/api/properties/${propertyId}/accounting/settings`,
    data: request
  });
}

export async function createAccountingAccount(propertyId: string, request: CreateAccountingAccountRequest) {
  const result = await authenticatedAPI<CreateAccountingAccountResponse>({
    method: 'POST',
    url: `/api/properties/${propertyId}/accounting/accounts`,
    data: request
  });
  if (!result || !isPropertyId(result.id)) throw new ApiError(200, 'INVALID_RESPONSE', '과목을 확인할 수 없습니다.');
  return result.id;
}

export async function reviewAccountingExpense(propertyId: string, expenseId: string, request: ReviewAccountingExpenseRequest) {
  await authenticatedAPI<void>({
    method: 'POST',
    url: `/api/properties/${propertyId}/accounting/expenses/${expenseId}/reviews`,
    data: request
  });
}

export async function reviewAccountingRevenue(propertyId: string, itemId: string, request: ReviewAccountingRevenueRequest) {
  await authenticatedAPI<void>({
    method: 'POST',
    url: `/api/properties/${propertyId}/accounting/revenue-items/${itemId}/reviews`,
    data: request
  });
}
