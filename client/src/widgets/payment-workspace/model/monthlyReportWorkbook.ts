import type {
  CellObject,
  SheetData
} from 'write-excel-file/universal';
import {
  createReportCell,
  type ReportDefinition
} from '@/shared/lib/excel-report';
import { getMonthlyReportMetrics } from './monthlyExport';

/** 첨부 시안의 큰 빌라 제목·금액 카드·옅은 표·합계를 한 시트에 담고 공통 정수·문자열 보호를 재사용합니다. */
export async function createMonthlyStyledWorkbook(document: ReportDefinition): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const colors = {
    text: '#0F172A',
    muted: '#64748B',
    primary: '#2563EB',
    teal: '#0D9488',
    success: '#16A34A',
    warning: '#F59E0B',
    danger: '#EF4444',
    border: '#E2E8F0',
    soft: '#F8FAFC',
    white: '#FFFFFF',
  };
  /** 상태 의미 색을 흰색과 섞어 시안의 옅은 카드·상태 배경으로 사용합니다. */
  const tint = (color: string) => `#${[1, 3, 5].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.07 + 255 * 0.93).toString(16).padStart(2, '0')).join('')}`;
  const statusColors: Record<string, string> = {
    미납: colors.danger,
    일부납부: colors.warning,
    납부완료: colors.success,
    선입금: colors.teal,
    '정산 확인 필요': colors.muted
  };
  const width = document.columns.length;
  const metrics = getMonthlyReportMetrics(document);
  const cell = (value: string | bigint, style: CellObject = {}) => createReportCell(value, {
    fontSize: 14,
    height: 38,
    ...style,
  });
  const merge = (value: string | bigint, span: number, style: CellObject = {}) => [cell(value, {
    columnSpan: span,
    ...style,
  }), ...Array(span - 1).fill(null)];
  const metadata = (label: string) => String(document.summary.find((item) => item.label === label)?.value ?? '');
  const data: SheetData = [
    merge(document.title, width, {
      fontSize: 26,
      fontWeight: 'bold',
      height: 58,
    }),
    merge(document.description, width, {
      fontSize: 14,
      textColor: colors.muted,
      height: 34,
    }),
    merge(metadata('조회 월'), width, {
      fontSize: 20,
      fontWeight: 'bold',
      textColor: colors.primary,
      height: 40
    }),
    merge(`${metadata('조회 세대')} · ${metadata('기간 상태')} · 조회 시각 ${metadata('조회시각')}`, width, {
      fontSize: 12,
      textColor: colors.muted,
      height: 34,
      bottomBorderColor: colors.border,
      bottomBorderStyle: 'thin',
    }),
    [cell('', {
      height: 12
    })],
  ];
  const spans = metrics.map((_, index) => Math.floor(width / metrics.length) + (index < width % metrics.length ? 1 : 0));
  data.push(metrics.flatMap((metric, index) => merge(metric.label, spans[index], {
    fontSize: 14,
    fontWeight: 'bold',
    height: 30,
    align: 'center',
    textColor: colors[metric.tone],
    backgroundColor: tint(colors[metric.tone]),
  })));
  data.push(metrics.flatMap((metric, index) => merge(metric.value, spans[index], {
    fontSize: 20,
    fontWeight: 'bold',
    height: 48,
    align: 'center',
    backgroundColor: tint(colors[metric.tone]),
  })));
  data.push([cell('', {
    height: 14
  })]);
  const frozenRows = data.length + 1;
  data.push(document.columns.map((column) => cell(column.label, {
    height: 42,
    fontWeight: 'bold',
    align: 'center',
    backgroundColor: colors.soft,
    borderColor: colors.muted,
    borderStyle: 'medium',
  })));
  for (const row of document.rows) {
    data.push(document.columns.map((column, index) => {
      const value = row[index] ?? '';
      const statusColor = statusColors[String(value)];
      return cell(value, {
        align: column.align,
        textColor: statusColor ?? colors.text,
        fontWeight: statusColor ? 'bold' : undefined,
        backgroundColor: statusColor ? tint(statusColor) : colors.white,
        borderColor: colors.muted,
        borderStyle: 'medium',
      });
    }));
  }
  if (!document.rows.length) data.push(merge('조회 조건에 맞는 내역이 없습니다.', width, {
    textColor: colors.muted,
    align: 'center',
  }));
  if (document.total) data.push(document.columns.map((column, index) => cell(document.total?.[index] ?? '', {
    align: column.align,
    fontSize: 16,
    fontWeight: 'bold',
    backgroundColor: tint(colors.primary),
    height: 44,
    borderColor: colors.muted,
    borderStyle: 'medium',
  })));
  data.push([cell('', {
    height: 14
  })]);
  data.push(merge(document.note, width, {
    fontSize: 11,
    textColor: colors.muted,
  }));

  return writeExcelFile([{
    sheet: document.sheet,
    data,
    columns: document.columns.map((column) => ({
      width: column.width
    })),
    stickyRowsCount: frozenRows,
    showGridLines: false,
    orientation: 'landscape',
  }]).toBlob();
}
