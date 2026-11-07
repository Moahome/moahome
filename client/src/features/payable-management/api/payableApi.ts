import { authenticatedAPI } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { ApiError } from '@/shared/api';
import type {
  CreatePayableRequest,
  PayableWorkspace
} from './payableApiTypes';

/** 다른 관리대상의 원본과 잘못된 지급 잔액을 화면·처리에 사용하지 않도록 대조합니다. */
export async function getPayables(propertyId: string, signal?: AbortSignal): Promise<PayableWorkspace> {
  const value = await authenticatedAPI<PayableWorkspace>({
    url: `/api/properties/${propertyId}/accounting/payables`,
    signal
  });
  const invalid = () => { throw new ApiError(200, 'INVALID_RESPONSE', '미지급 자료를 확인할 수 없습니다.'); };
  const id = (v: unknown) => typeof v === 'string' && isPropertyId(v);
  const money = (v: unknown) => typeof v === 'string' && /^\d{1,30}$/.test(v);
  const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  const path = (v: unknown) => typeof v === 'string' && /^\/banking\/transactions\/[0-9a-f-]{36}$/i.test(v);
  if (!value || value.propertyId !== propertyId || typeof value.hasBuildings !== 'boolean' || typeof value.canManage !== 'boolean'
    || !Array.isArray(value.accounts) || !Array.isArray(value.buildings) || !Array.isArray(value.items) || !Array.isArray(value.candidates)) invalid();
  if (value.accounts.some((v) => !id(v.id) || !/^[89]\d{2}$/.test(v.code) || typeof v.name !== 'string')
    || value.buildings.some((v) => !id(v.id) || typeof v.name !== 'string' || typeof v.active !== 'boolean')) invalid();
  for (const item of value.items) {
    if (!id(item.id) || !date(item.date) || !id(item.accountId) || !id(item.payableAccountId)
      || (item.buildingId !== null && !id(item.buildingId)) || !money(item.amount) || !money(item.paid) || !money(item.remaining)
      || typeof item.name !== 'string' || typeof item.counterparty !== 'string' || (item.memo !== null && typeof item.memo !== 'string')
      || !['REGISTERED', 'CANCELED'].includes(item.status) || !Array.isArray(item.payments)) invalid();
    if (item.payments.some((v) => !id(v.id) || !id(v.expenseId) || !date(v.date) || !money(v.amount)
      || !['ACTIVE', 'CANCELED'].includes(v.status) || !path(v.path))) invalid();
    const paid = item.payments.filter((v) => v.status === 'ACTIVE').reduce((sum, v) => sum + BigInt(v.amount), BigInt(0));
    if (paid !== BigInt(item.paid) || (item.status === 'REGISTERED' && BigInt(item.amount) !== paid + BigInt(item.remaining))
      || (item.status === 'CANCELED' && (paid !== BigInt(0) || BigInt(item.remaining) !== BigInt(0)))) invalid();
  }
  if (value.candidates.some((v) => !id(v.expenseId) || !date(v.date) || typeof v.name !== 'string' || !money(v.amount)
    || !id(v.accountId) || (v.buildingId !== null && !id(v.buildingId)) || !path(v.path))) invalid();
  return value;
}

export async function createPayable(propertyId: string, data: CreatePayableRequest): Promise<void> {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/accounting/payables`,
    method: 'POST',
    data
  });
}

export async function settlePayable(propertyId: string, payableId: string, id: string, expenseId: string): Promise<void> {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/accounting/payables/${payableId}/payments`,
    method: 'POST',
    data: {
      id,
      expenseId
    }
  });
}

export async function cancelPayablePayment(propertyId: string, payableId: string, paymentId: string): Promise<void> {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/accounting/payables/${payableId}/payments/${paymentId}/cancel`,
    method: 'POST'
  });
}

export async function cancelPayable(propertyId: string, payableId: string): Promise<void> {
  await authenticatedAPI({
    url: `/api/properties/${propertyId}/accounting/payables/${payableId}/cancel`,
    method: 'POST'
  });
}
