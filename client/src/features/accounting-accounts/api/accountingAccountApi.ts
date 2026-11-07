import { authenticatedAPI } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { ApiError } from '@/shared/api';
import type {
  AccountingAccountChange,
  AccountingAccountsWorkspace,
  CreateAccountingAccountRequest,
  CreateAccountingAccountResponse,
  EditAccountingAccountRequest
} from './accountingAccountApiTypes';
import {
  ACCOUNT_GROUP_LABELS,
  acceptsAccountCode
} from '../model/accountingAccounts';

const base = (propertyId: string) => `/api/properties/${propertyId}/accounting/accounts`;
const revision = (value: number) => Number.isInteger(value) && value >= 0;

/** 권한·관리대상·과목 식별자를 검증하며 조회 실패를 기본 과목이나 빈 목록으로 대체하지 않습니다. */
export async function getAccountingAccounts(propertyId: string, signal?: AbortSignal): Promise<AccountingAccountsWorkspace> {
  const value = await authenticatedAPI<AccountingAccountsWorkspace>({
    url: base(propertyId),
    signal
  });
  if (!value || value.propertyId !== propertyId || typeof value.canManage !== 'boolean' || !Array.isArray(value.accounts)
    || value.accounts.some((row) => !row || !isPropertyId(row.id) || typeof row.name !== 'string' || !row.name.trim()
      || !Object.hasOwn(ACCOUNT_GROUP_LABELS, row.group) || !acceptsAccountCode(row.group, row.code)
      || typeof row.defaultAccount !== 'boolean' || typeof row.active !== 'boolean' || typeof row.used !== 'boolean' || !revision(row.revision))
    || new Set(value.accounts.map((row) => row.id)).size !== value.accounts.length
    || new Set(value.accounts.map((row) => row.code)).size !== value.accounts.length) {
    throw new ApiError(200, 'INVALID_RESPONSE', '계정과목을 확인할 수 없습니다.');
  }
  return {
    ...value,
    accounts: [...value.accounts].sort((left, right) => left.code.localeCompare(right.code))
  };
}

/** 기존 손익 화면과 설정 화면의 추가 요청·응답 검증을 공유합니다. */
export async function createAccountingAccount(propertyId: string, request: CreateAccountingAccountRequest) {
  const result = await authenticatedAPI<CreateAccountingAccountResponse>({
    method: 'POST',
    url: base(propertyId),
    data: request
  });
  if (!result || !isPropertyId(result.id)) throw new ApiError(200, 'INVALID_RESPONSE', '과목을 확인할 수 없습니다.');
  return result.id;
}

export async function editAccountingAccount(propertyId: string, id: string, request: EditAccountingAccountRequest) {
  await authenticatedAPI<void>({
    method: 'PUT',
    url: `${base(propertyId)}/${id}`,
    data: request
  });
}

export async function changeAccountingAccountStatus(propertyId: string, id: string, active: boolean, expectedRevision: number) {
  await authenticatedAPI<void>({
    method: 'POST',
    url: `${base(propertyId)}/${id}/status`,
    data: {
      active,
      expectedRevision
    }
  });
}

export async function deleteAccountingAccount(propertyId: string, id: string, expectedRevision: number) {
  await authenticatedAPI<void>({
    method: 'DELETE',
    url: `${base(propertyId)}/${id}`,
    data: {
      expectedRevision
    }
  });
}

export async function getAccountingAccountHistory(propertyId: string, id: string, signal?: AbortSignal): Promise<AccountingAccountChange[]> {
  const value = await authenticatedAPI<AccountingAccountChange[]>({
    url: `${base(propertyId)}/${id}/history`,
    signal
  });
  if (!Array.isArray(value) || value.some((row) => !row || !revision(row.revision) || typeof row.name !== 'string'
    || !Object.hasOwn(ACCOUNT_GROUP_LABELS, row.group) || !acceptsAccountCode(row.group, row.code)
    || typeof row.active !== 'boolean' || !Number.isFinite(Date.parse(row.changedAt))
    || (row.deletedAt !== null && !Number.isFinite(Date.parse(row.deletedAt))))) {
    throw new ApiError(200, 'INVALID_RESPONSE', '변경 이력을 확인할 수 없습니다.');
  }
  return value;
}
