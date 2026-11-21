'use client';

import type { ReadonlyURLSearchParams } from 'next/navigation';

import { useCallback } from 'react';
import {
  getDateRangeQuery,
  type DateRange
} from '@/shared/lib/date-range';
import type { BankingTransaction } from '../../../api/bankingApiTypes';
import type { useReportDownload } from '@/shared/ui/report-download';
import { ReportDownload } from '@/shared/ui/report-download';
import {
  createExpenseWorkbook,
  getExpenseReportDocument
} from '../../../model/expenseExport';
interface UseBankingExpenseDownloadOptions {
  baseRows: BankingTransaction[];
  expenseBuildingIds: string[];
  dateRange: DateRange;
  building: string;
  expenseBuildings: {
    id: string;
    label: string;
  }[];
  search: string;
  openDownload: ReturnType<typeof useReportDownload>['openDownload'];
  propertyId: string;
  searchParams: ReadonlyURLSearchParams;
  currentMonth: string;
}

/** 통장 ExpenseDownload 책임의 처리와 재시도 흐름을 분리합니다. */
export function useBankingExpenseDownload({
  baseRows,
  expenseBuildingIds,
  dateRange,
  building,
  expenseBuildings,
  search,
  openDownload,
  propertyId,
  searchParams,
  currentMonth
}: UseBankingExpenseDownloadOptions) {

  const downloadExpenses = useCallback(async () => {
    if (!baseRows.length)
      return;
    const snapshotRows = [...baseRows];
    const snapshotBuildings = [...expenseBuildingIds];
    const context = {
      period: {
        ...dateRange
      },
      buildingLabel: building === 'ALL' ? '전체 동' : expenseBuildings.map((item) => item.label).join(' · '),
      search: search.trim()
    };
    const document = getExpenseReportDocument(snapshotRows, snapshotBuildings, context);
    openDownload({
      pageHref: `/manage/${propertyId}/banking/expenses/download?${getDateRangeQuery(searchParams, currentMonth)}`,
      render: (presentation, onClose) => (
        <ReportDownload
          presentation={presentation}
          title={'지출 내역 다운로드'}
          description={'현재 조회 조건의 전체 지출을 확인하고 내려받으세요.'}
          filename={`모아홈_지출내역_${dateRange.startDate}_${dateRange.endDate}_${building === 'ALL' ? '전체동' : '선택동'}`}
          sourceKey={JSON.stringify([dateRange, building, search])}
          documents={[document]}
          formats={['excel']}
          scopeLabel={`${context.buildingLabel} · ${snapshotRows.length}건`}
          createWorkbook={() => createExpenseWorkbook(snapshotRows, snapshotBuildings, context)}
          onClose={onClose}
        />
      )
    });
  }, [baseRows, expenseBuildingIds, dateRange, building, expenseBuildings, search, openDownload, propertyId, searchParams, currentMonth]);

  return {
    downloadExpenses
  };
}
