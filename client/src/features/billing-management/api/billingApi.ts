import type {
  BillingItem,
  BillingMonth,
  BillingPeriod,
  BillingSettings,
  BillingTemplate
} from '@/entities/billing';
import { FEE_ITEM_OPTIONS } from '@/entities/billing';
import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type { BillingHistoryResponse } from './billingApiTypes';

const MONTH = /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/;
const AMOUNT = /^-?[0-9]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never { throw new ApiError(200, 'INVALID_RESPONSE', '관리비 정보를 확인할 수 없습니다.'); }
function validItems(items: BillingItem[]): boolean {
  return Array.isArray(items) && items.length > 0 && items.every((item) => item && UUID.test(item.id)
    && (item.code === null || FEE_ITEM_OPTIONS.some((option) => option.value === item.code))
    && typeof item.name === 'string' && Boolean(item.name.trim()) && typeof item.amount === 'string' && AMOUNT.test(item.amount)
    && BigInt(item.amount) >= -BigInt('999999999999999') && BigInt(item.amount) <= BigInt('999999999999999'));
}
function validTemplate(template: BillingTemplate): boolean {
  return Boolean(template && UUID.test(template.id) && MONTH.test(template.effectiveMonth) && validItems(template.items)
    && (template.reason === null || typeof template.reason === 'string') && Number.isFinite(Date.parse(template.changedAt)));
}
function readSettings(result: BillingSettings, propertyId: string): BillingSettings {
  if (!result || result.propertyId !== propertyId || !MONTH.test(result.currentMonth) || !MONTH.test(result.firstBillingMonth)
    || !UUID.test(result.revisionId) || !Number.isFinite(Date.parse(result.nextBillingDate)) || !validTemplate(result.current)
    || (result.scheduled !== null && !validTemplate(result.scheduled))) invalid();

  return result;
}
/** 현재 사용자·관리대상의 조회 응답만 사용하며 잘못된 자료는 예시나 빈 설정으로 대체하지 않습니다. */
export async function getBillingSettings(propertyId: string): Promise<BillingSettings> {
  return readSettings(await authenticatedAPI<BillingSettings>({
    url: `/api/properties/${propertyId}/billing/settings`
  }), propertyId);
}
/** 최신 버전·적용월과 필수 사유를 전달하고 서버가 반환한 실제 저장 결과를 사용합니다. */
export async function saveBillingSettings(propertyId: string, settings: BillingSettings, items: BillingItem[], reason: string): Promise<BillingSettings> {
  const [year, month] = settings.currentMonth.split('-').map(Number);
  const effectiveMonth = `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
  return readSettings(await authenticatedAPI<BillingSettings>({
    url: `/api/properties/${propertyId}/billing/settings`,
    method: 'PUT',
    data: {
      revisionId: settings.revisionId,
      effectiveMonth,
      reason: reason.trim(),
      items: items.map((item) => ({
        itemCode: item.code,
        itemName: item.name.trim(),
        defaultAmount: Number(item.amount)
      }))
    }
  }), propertyId);
}
/** 모바일 직접 진입과 데스크톱 목록은 같은 월·세대 범위의 업무 API를 조회합니다. */
export async function getBillingMonth(propertyId: string, month: string, unitId?: string): Promise<BillingMonth> {
  if (!MONTH.test(month) || (unitId && !UUID.test(unitId))) throw new ApiError(400, 'INVALID_REQUEST', '조회할 관리비 정보를 확인해주세요.');
  const result = await authenticatedAPI<BillingMonth>({
    url: `/api/properties/${propertyId}/billing/monthly/${month}${unitId ? `/units/${unitId}` : ''}`
  });
  if (!result || result.propertyId !== propertyId || typeof result.hasBuildings !== 'boolean' || result.month !== month || !['ISSUED', 'SCHEDULED', 'NOT_BILLED'].includes(result.status)
    || typeof result.baseAmount !== 'string' || !AMOUNT.test(result.baseAmount)
    || !Number.isFinite(Date.parse(result.billingDate)) || !Number.isFinite(Date.parse(result.dueDate))
    || !Array.isArray(result.charges) || result.charges.some((charge) => !charge || !UUID.test(charge.id) || !UUID.test(charge.unitId)
      || (unitId && charge.unitId !== unitId) || typeof charge.building !== 'string' || typeof charge.room !== 'string'
      || !(charge.displayName === null || typeof charge.displayName === 'string')
      || !(charge.representativeName === null || typeof charge.representativeName === 'string') || !validItems(charge.items))) invalid();

  return result;
}
export async function getBillingHistory(propertyId: string): Promise<BillingPeriod[]> {
  const result = await authenticatedAPI<BillingHistoryResponse>({
    url: `/api/properties/${propertyId}/billing/history`
  });
  if (!result || result.propertyId !== propertyId || !Array.isArray(result.periods) || result.periods.some((period) => !period
    || !MONTH.test(period.month) || typeof period.totalAmount !== 'string' || !AMOUNT.test(period.totalAmount)
    || !Number.isSafeInteger(period.unitCount) || period.unitCount < 0 || !Number.isFinite(Date.parse(period.confirmedAt)))) invalid();

  return result.periods;
}
export function getBillingError(error: unknown): string {
  if (!(error instanceof ApiError)) return '관리비 정보를 처리하지 못했어요. 다시 시도해주세요.';
  if (error.code === 'BILLING_SETTINGS_CONFLICT') return '다른 변경이 반영되었거나 적용월이 바뀌었어요. 최신 설정을 다시 확인해주세요.';
  if (error.code === 'BILLING_SETTINGS_NOT_FOUND') return '등록된 관리비 설정을 찾을 수 없어요.';
  if (error.code === 'BILLING_CHARGE_HAS_PAYMENTS') return '수납이 반영된 관리비가 있어요. 관련 수납을 먼저 취소해주세요.';
  if (error.code === 'BILLING_CHARGE_NOT_FOUND') return '해당 월의 세대 청구 내역이 없어요.';
  if (error.code === 'INVALID_REQUEST') return '항목·금액·수정 사유를 확인해주세요.';
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';
  if (error.status === 403) return '관리비를 조회하거나 설정할 권한이 없어요.';
  return '관리비 정보를 처리하지 못했어요. 다시 시도해주세요.';
}
