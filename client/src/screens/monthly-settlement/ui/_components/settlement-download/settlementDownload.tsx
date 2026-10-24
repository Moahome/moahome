import {
  useCallback,
  useMemo
} from 'react';
import { getReportPeriodLabel } from '@/shared/lib/pdf-report';
import { ReportDownload } from '@/shared/ui/report-download';
import type { MonthlySettlementSnapshot } from '../../../api/monthlySettlementApiTypes';
import {
  createMonthlyReportWorkbook,
  getMonthlyReportDocuments
} from '../../../model/monthlyReport';
import { createMonthlyReportPdf } from '../../../model/monthlyReportPdf';

/** 월별 정산은 관리대상 전체의 월간 요약을 출력하고 동별 거래 후 잔액 명세·동/계좌 선택은 잔고·정산에서 제공합니다. */
export function SettlementDownload({ data, onClose }: { data: MonthlySettlementSnapshot; onClose: () => void }) {
  const documents = useMemo(() => getMonthlyReportDocuments(data), [data]);
  const createWorkbook = useCallback(() => createMonthlyReportWorkbook(data), [data]);
  const createPdf = useCallback(() => createMonthlyReportPdf(documents), [documents]);
  return (
    <ReportDownload
      title={`${data.month.replace('-', '년 ')}월 월별 정산 종합보고서`}
      description={'한 달의 청구·수납·미납, 동별 자금과 외부 부담금 회수 현황을 확인하세요.'}
      filename={`모아홈_월별정산_${data.month}`}
      sourceKey={`${data.propertyId}:${data.month}:${data.generatedAt}`}
      documents={documents}
      scopeLabel={`관리대상 전체 · ${getReportPeriodLabel(data)}`}
      createWorkbook={createWorkbook}
      createPdf={createPdf}
      onClose={onClose}
    />
  );
}
