'use client';
import { useBankingWorkspace } from './useBankingWorkspace';
import { getDateRangeQuery } from '@/shared/lib/date-range';
import type { BankingTransaction } from '../../../api/bankingApiTypes';
type Options=Pick<ReturnType<typeof useBankingWorkspace>['results'],
 | 'isSelecting'
 | 'toggleDeletion'
 | 'preview'
 | 'searchParams'
 | 'currentMonth'
 | 'accountId'
 | 'router'
 | 'propertyId'
 | 'setTransferDetail'
 | 'setEditingId'
 | 'direction'
 | 'notify'
 | 'view'
 | 'setDetail'>;

/** 선택 편집·미리보기·PC 상세·모바일 이동을 같은 행 행동으로 처리합니다. */
export function useBankingListActions({
  isSelecting,
  toggleDeletion,
  preview,
  searchParams,
  currentMonth,
  accountId,
  router,
  propertyId,
  setTransferDetail,
  setEditingId,
  notify,
  view,
  setDetail
}:Options) {
  const openRow = (row: BankingTransaction) => {
    if (isSelecting) {
      toggleDeletion(row.id);

      return;
    }
    if (!preview && row.transferCandidate) {
      if (window.matchMedia('(max-width: 767px)').matches) {
        const query = getDateRangeQuery(searchParams, currentMonth);
        if (accountId !== 'ALL')
          query.set('account', accountId);
        router.push(`/manage/${propertyId}/banking/transactions/${row.id}?${query}`);

        return;
      }
      setTransferDetail(row);

      return;
    }
    if (preview) {
      setEditingId((current) => current === row.id ? null : row.id);

      return;
    }
    // 입금의 수납 연결이 누락돼도 출금 상세로 해석하지 않고 현재 목록에서 연결 오류를 안내합니다.
    if (row.direction === 'INCOME' && !row.paymentId) {
      notify('입금 상세 연결 정보를 확인할 수 없어요. 거래 정보를 다시 확인해주세요.');

      return;
    }
    if (window.matchMedia('(max-width: 767px)').matches) {
      const query = getDateRangeQuery(searchParams, currentMonth);
      if (view === 'expenses')
        query.set('from', 'expenses');
      if (accountId !== 'ALL')
        query.set('account', accountId);
      router.push(`${row.paymentId ? `/manage/${propertyId}/banking/receipts/${row.paymentId}` : `/manage/${propertyId}/banking/transactions/${row.id}`}?${query}`);

      return;
    }
    setDetail({
      id: row.paymentId ?? row.id,
      kind: row.paymentId ? 'receipt' : 'expense'
    });
  };

  return {
    openRow
  };
}
