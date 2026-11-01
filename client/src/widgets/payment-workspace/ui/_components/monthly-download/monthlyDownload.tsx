'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useMemo,
  useState
} from 'react';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  createMonthlyWorkbook,
  getMonthlyReportDocument,
  getMonthlyReportMetrics
} from '../../../model/monthlyExport';
import type { MonthlyReportSnapshot } from '../../../model/monthlyExportTypes';
import type { MonthlyCollectionFilters } from '../../../model/paymentPreviewTypes';
import { usePaymentWorkspace } from '../../payment-workspace-provider/paymentWorkspaceProvider';

// PDF·캔버스를 사용하는 미리보기는 브라우저에서만 읽어 순수 수납 모델의 서버·테스트 사용을 유지합니다.
const ReportDownload = dynamic(() => import('@/shared/ui/report-download').then((module) => module.ReportDownload), {
  ssr: false,
});

// 서식 변경 후 열린 미리보기에 이전 PDF·PNG가 남지 않도록 보고서 캐시 키에 서식 버전을 포함합니다.
const MONTHLY_REPORT_LAYOUT_VERSION = 3;

/** 다운로드를 열 때 현재 권한에서 확인한 빌라 이름·원장·조회 조건을 같은 자료로 고정합니다. */
export function MonthlyExportButton({ month, filters, selectedUnitIds }: {
  month: string;
  filters: MonthlyCollectionFilters;
  selectedUnitIds?: readonly string[];
}) {
  const { ledger, propertyId, busy } = usePaymentWorkspace();
  const session = useSession();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const [snapshot, setSnapshot] = useState<MonthlyReportSnapshot | null>(null);

  return (
    <>
      <Button
        variant={'outline'}
        disabled={busy || !context.data?.name || selectedUnitIds?.length === 0}
        onClick={() => {
          if (!context.data?.name || selectedUnitIds?.length === 0) return;
          setSnapshot({
            propertyId,
            propertyName: context.data.name,
            ledger,
            month,
            filters: {
              ...filters,
            },
            generatedAt: new Date().toISOString(),
            ...(selectedUnitIds === undefined ? {} : {
              selectedUnitIds: [...selectedUnitIds]
            }),
          });
        }}
        leadingIcon={(
          <ServiceIcon
            name={'download'}
          />
        )}
      >
        {selectedUnitIds === undefined ? '다운로드' : '선택 다운로드'}
      </Button>
      {snapshot && snapshot.propertyId === propertyId && snapshot.month === month && (
        <MonthlyDownload
          data={snapshot}
          onClose={() => setSnapshot(null)}
        />
      )}
    </>
  );
}

/** 열린 시점의 자료를 세 형식에서 공유해 미리보기와 실제 저장 내용을 일치시킵니다. */
function MonthlyDownload({ data, onClose }: { data: MonthlyReportSnapshot; onClose: () => void }) {
  const document = useMemo(() => getMonthlyReportDocument(data), [data]);
  const createWorkbook = useCallback(() => createMonthlyWorkbook(data), [data]);
  const createPdf = useCallback(() => import('../../../model/monthlyReportPdf').then((module) => module.createMonthlyCollectionPdf(data)), [data]);
  const selectionLabel = data.selectedUnitIds === undefined ? '' : `선택 ${document.rows.length}세대`;
  const filename = `${data.propertyName}_수납현황_${data.month}_${data.filters.status}${data.filters.building ? `_${data.filters.building}` : ''}${selectionLabel ? `_${selectionLabel.replace(' ', '')}` : ''}`.replace(/[\\/:*?"<>|]/g, '_');

  return (
    <ReportDownload
      title={`${data.month.replace('-', '년 ')}월 월별 수납 현황`}
      description={selectionLabel ? '선택한 세대와 해당 합계를 확인하고 내려받으세요.' : '현재 상태·동·검색 조건의 전체 세대를 확인하고 내려받으세요.'}
      filename={filename}
      sourceKey={JSON.stringify([MONTHLY_REPORT_LAYOUT_VERSION, data.propertyId, data.month, data.generatedAt, data.filters, data.selectedUnitIds])}
      documents={[document]}
      highlights={getMonthlyReportMetrics(document)}
      scopeLabel={`${data.filters.building || '전체 동'} · ${data.filters.status} · ${selectionLabel || `${document.rows.length}세대`}`}
      pdfDescription={'A4 가로 보고서'}
      createWorkbook={createWorkbook}
      createPdf={createPdf}
      onClose={onClose}
    />
  );
}
