import {
  getSortedBillingCharges,
  getBillingDates,
  sumBillingItems
} from '@/entities/billing';
export {
  getSortedBillingCharges, getBillingDates, sumBillingItems
};
import { FEE_ITEM_OPTIONS } from '@/entities/billing';
import { getTextLength } from '@/shared/lib/format';

import type {
  BillingItem,
  BillingPlan,
  BillingTemplate,
  BillingTemporaryItem,
  BillingMode
} from '@/entities/billing';

export const BILLING_TABS = [
  {
    id: 'monthly',
    label: '월별 부과'
  },
  {
    id: 'items',
    label: '관리비 설정'
  },
  {
    id: 'history',
    label: '부과 이력'
  },
  {
    id: 'opening',
    label: '기존 잔액 인계'
  }
] as const;

const MAX_AMOUNT = BigInt('999999999999999');
/** 브라우저의 월 입력과 URL을 검증해 빈 값·잘못된 달을 날짜 계산에 사용하지 않습니다. */
export function isBillingMonth(value: string): boolean {
  return /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(value);
}

/** 월 단위로 이동하므로 연말·연초에도 다음 달 적용월을 정확하게 구합니다. */
export function shiftBillingMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + offset;

  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

/** 필수 사유·추천 종류·항목·부호 있는 정수와 최종 합계를 검사하며 상쇄 항목을 허용합니다. */
export function getSettingsError(items: BillingItem[], reason: string): string | null {
  if (!reason.trim()) return '수정 사유를 입력해주세요.';
  if (!items.length) return '관리비 항목을 하나 이상 추가해주세요.';
  for (const item of items) {
    if (item.code !== null && !FEE_ITEM_OPTIONS.some((option) => option.value === item.code)) return '항목 종류를 확인해주세요.';
    if (!getTextLength(item.name) || getTextLength(item.name) > 100) return '항목명은 1~100자로 입력해주세요.';
    if (!/^-?[0-9]+$/.test(item.amount)) return '금액을 정수 원 단위로 입력해주세요.';
    const amount = BigInt(item.amount);
    if (amount < -MAX_AMOUNT || amount > MAX_AMOUNT) return '항목 금액이 허용 범위를 초과했어요.';
  }
  const total = sumBillingItems(items);
  if (total < -MAX_AMOUNT || total > MAX_AMOUNT) return '세대당 기본 합계가 허용 범위를 초과했어요.';

  return null;
}

/** 기존 전체 설정을 읽을 수 있게 정규화하고 전월 임시 항목을 다음 달 편집에 이월하지 않습니다. */
export function getBillingPlan(template: BillingTemplate, includeTemporary = true): BillingPlan {
  return {
    mode: template.mode ?? 'ALL',
    items: template.items.map((item) => ({
      ...item
    })),
    buildingItems: (template.buildingItems ?? []).map((group) => ({
      buildingId: group.buildingId,
      items: group.items.map((item) => ({
        ...item
      }))
    })),
    temporaryMode: includeTemporary ? template.temporaryMode ?? 'ALL' : 'ALL',
    temporaryItems: includeTemporary ? (template.temporaryItems ?? []).map((item) => ({
      ...item,
      note: item.note ?? '',
      month: item.month ?? template.effectiveMonth
    })) : []
  };
}

/** 기본·임시 범위를 독립적으로 해석해 선택 동의 세대당 부과 항목을 반환합니다. */
export function getPlanItems(plan: BillingPlan, buildingId: string | null): BillingItem[] {
  const base = plan.mode === 'ALL' ? plan.items : plan.buildingItems.find((group) => group.buildingId === buildingId)?.items ?? [];
  return [...base, ...plan.temporaryItems.filter((item) => plan.temporaryMode === 'ALL' || item.buildingId === buildingId)];
}

/** 동별 설정의 완전성과 각 세대의 기본·임시 합계를 확인해 잘못된 범위를 저장하지 않습니다. */
export function getBillingPlanError(plan: BillingPlan, reason: string, buildingIds: string[]): string | null {
  if (!reason.trim()) return '수정 사유를 입력해주세요.';
  const groups = plan.mode === 'ALL' ? [{
    buildingId: null,
    items: plan.items
  }] : plan.buildingItems;
  if (plan.mode === 'BUILDING' && (!buildingIds.length || groups.length !== buildingIds.length
    || new Set(groups.map((group) => group.buildingId)).size !== buildingIds.length
    || groups.some((group) => !group.buildingId || !buildingIds.includes(group.buildingId)))) return '각 동의 기본 항목을 설정해주세요.';
  for (const group of groups) {
    const error = getSettingsError(group.items, reason);
    if (error) return error;
  }
  const temporaryError = getTemporarySettingsError(plan.temporaryItems, plan.temporaryMode, reason, buildingIds);
  if (temporaryError) return temporaryError;
  for (const buildingId of buildingIds.length ? buildingIds : [null]) {
    const total = sumBillingItems(getPlanItems(plan, buildingId));
    if (total < -MAX_AMOUNT || total > MAX_AMOUNT) return '기본·임시 부과를 합한 세대당 금액이 허용 범위를 초과했어요.';
  }
  return null;
}


/** 이번 달 항목은 다음 달 기본 금액과 합치지 않고 항목·대상·추가 청구 합계만 검증합니다. */
export function getTemporarySettingsError(items: BillingTemporaryItem[], mode: BillingMode, reason: string, buildingIds: string[]): string | null {
  if (!reason.trim()) return '수정 사유를 입력해주세요.';
  for (const item of items) {
    if (mode === 'BUILDING' && (!item.buildingId || !buildingIds.includes(item.buildingId))) return '임시 부과 대상 동을 선택해주세요.';
    if ((item.note ?? '').length > 500) return '임시 부과 비고는 500자 이내로 입력해주세요.';
    const error = getSettingsError([item], reason);
    if (error) return error;
  }
  for (const buildingId of buildingIds.length ? buildingIds : [null]) {
    const total = sumBillingItems(items.filter((item) => mode === 'ALL' || item.buildingId === buildingId));
    if (total < -MAX_AMOUNT || total > MAX_AMOUNT) return '임시 부과 합계가 허용 범위를 초과했어요.';
  }
  return null;
}
