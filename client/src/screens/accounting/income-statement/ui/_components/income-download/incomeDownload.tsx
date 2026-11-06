'use client';

import {
  useCallback,
  useMemo
} from 'react';
import { createReportWorkbook } from '@/shared/lib/excel-report';
import { formatMonthRange } from '@/shared/lib/month-range';
import { ReportDownload } from '@/shared/ui/report-download';
import {
  createIncomeReportPdf,
  getIncomeReportDocuments
} from '../../../model/incomeStatementReport';
import type { IncomeStatementReport } from '../../../model/incomeStatementTypes';

/** 열기 시점의 조회 자료를 Excel·PDF·PNG 미리보기와 저장에 공통으로 사용합니다. */
export function IncomeDownload({ report, cumulative, presentation, onClose }: {
  report: IncomeStatementReport;
  cumulative: boolean;
  presentation: 'modal' | 'page';
  onClose: () => void;
}) {
  const documents = useMemo(() => getIncomeReportDocuments(report, cumulative), [report, cumulative]);
  const createWorkbook = useCallback(() => createReportWorkbook({
    ...documents[0],
    additionalSheets: documents.slice(1)
  }), [documents]);
  const createPdf = useCallback(() => createIncomeReportPdf(report, cumulative), [report, cumulative]);

  return (
    <ReportDownload
      presentation={presentation}
      title={`${report.propertyName} 손익계산서${report.isExample ? ' (예시)' : ''}`}
      description={report.isExample ? '예시 데이터로 구성한 손익계산서입니다.' : report.notice}
      filename={`${report.propertyName}_손익계산서${report.isExample ? '_예시' : ''}_${report.range.startMonth}_${report.range.endMonth}_${report.buildingName}_${cumulative ? '누계' : '월별'}`.replace(/[\\/:*?"<>|]/g, '_')}
      sourceKey={`${report.range.startMonth}:${report.range.endMonth}:${report.buildingName}:${cumulative}`}
      documents={documents}
      excelDescription={`손익·월별 내역${report.issues.length ? '·확인 필요' : ''}`}
      scopeLabel={`${report.isExample ? '예시 데이터 · ' : ''}${formatMonthRange(report.range)} · ${report.buildingName}${report.issues.length ? ' · 잠정 손익' : ''}`}
      createWorkbook={createWorkbook}
      createPdf={createPdf}
      onClose={onClose}
    />
  );
}
