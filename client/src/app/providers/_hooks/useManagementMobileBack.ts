'use client';

import {
  usePathname,
  useSearchParams
} from 'next/navigation';
import { getMonthRangeQuery } from '@/shared/lib/month-range';
import { getDateRangeQuery } from '@/shared/lib/date-range';
import { getManagementMobileBack } from '../_utils/managementMobileBack';

/** 현재 관리대상의 경로와 조회 조건으로 모바일 헤더의 복귀 대상을 결정합니다. */
export function useManagementMobileBack(propertyId: string) {
  const pathname = usePathname();
  const basePath = `/manage/${propertyId}`;
  const searchParams = useSearchParams();
  const ledgerBuilding = searchParams.get('buildingId');
  const ledgerMonth = searchParams.get('month') ?? searchParams.get('endMonth');
  const ledgerPeriod = getMonthRangeQuery(searchParams);
  const ledgerAccount = searchParams.get('account');
  if (/^[0-9a-f-]{36}$/i.test(ledgerAccount ?? ''))
    ledgerPeriod.set('account', ledgerAccount!);
  // 원장 진입 문맥만 허용해 다른 관리대상이나 임의 URL로 돌아가지 않게 합니다.
  const fromBalance = searchParams.get('from') === 'balance'
    && /^[0-9a-f-]{36}$/i.test(ledgerBuilding ?? '') && /^\d{4}-(0[1-9]|1[0-2])$/.test(ledgerMonth ?? '')
    && (pathname.startsWith(`${basePath}/banking/receipts/`) || pathname.startsWith(`${basePath}/banking/transactions/`));
  const fromExpenses = searchParams.get('from') === 'expenses'
    && pathname.startsWith(`${basePath}/banking/transactions/`);
  const expenseQuery = getDateRangeQuery(searchParams);
  if (/^[0-9a-f-]{36}$/i.test(ledgerAccount ?? ''))
    expenseQuery.set('account', ledgerAccount!);
  const mobileBack = fromExpenses ? {
    href: `${basePath}/banking/expenses${expenseQuery.size ? `?${expenseQuery}` : ''}`,
    label: '지출 내역으로 돌아가기',
    title: '지출 상세'
  } : fromBalance ? {
    href: `${basePath}/banking/balances/${ledgerBuilding}?${ledgerPeriod}`,
    label: '동별 상세 원장으로 돌아가기',
    title: '거래 상세'
  } : getManagementMobileBack(pathname, basePath, ledgerMonth, ledgerAccount, getMonthRangeQuery(searchParams), getDateRangeQuery(searchParams), new URLSearchParams(searchParams.toString()));

  return mobileBack;
}
