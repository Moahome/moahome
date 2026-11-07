'use client';

import {
  useCallback,
  useMemo
} from 'react';
import { createReportWorkbook } from '@/shared/lib/excel-report';
import { ReportDownload } from '@/shared/ui/report-download';
import type { AccountLedgerWorkspace } from '../../../api/accountLedgerApiTypes';
import {
  createLedgerPdf,
  getLedgerDocuments
} from '../../../model/accountLedgerReport';

/** 다운로드를 연 시점의 전체 조회 자료를 보관하며 목록의 페이지 수로 출력 범위를 줄이지 않습니다. */
export function LedgerDownload({ data, presentation, onClose }: {
  data: AccountLedgerWorkspace;
  presentation: 'modal' | 'page';
  onClose: () => void;
}) {
  const documents = useMemo(() => getLedgerDocuments(data), [data]);
  const createWorkbook = useCallback(() => createReportWorkbook({
    ...documents[0],
    additionalSheets: documents.slice(1)
  }), [documents]);
  const createPdf = useCallback(() => createLedgerPdf(data), [data]);
  const codes = data.accounts.filter((row) => data.accountIds.includes(row.id)).map((row) => row.code).sort().join('-');
  const building = data.buildings.find((row) => row.id === data.buildingId);
  return (
    <ReportDownload
      title={`${data.propertyName} 계정별 원장`}
      filename={`${data.propertyName}_계정별원장_${data.range.startMonth}_${data.range.endMonth}_${codes || '전체과목'}_${building?.name ?? '전체동'}_${data.bankBalances.find((bank) => bank.accountId === data.bankAccountId)?.name ?? '전체계좌'}`.replace(/[\\/:*?"<>|]/g, '_')}
      sourceKey={`${data.generatedAt}:${data.accountIds.join(',')}:${data.buildingId}:${data.bankAccountId}`}
      documents={documents}
      scopeLabel={documents[0].description}
      excelDescription={'계정별 거래·확인 필요'}
      pdfDescription={'A4 세로 보고서'}
      createWorkbook={createWorkbook}
      createPdf={createPdf}
      presentation={presentation}
      onClose={onClose}
    />
  );
}
