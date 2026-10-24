import type {
  CellObject,
  SheetData
} from 'write-excel-file/universal';
import { createReportCell } from '@/shared/lib/excel-report';
import type { ReportDefinition } from '@/shared/lib/excel-report';

/** 첨부 엑셀의 진한 제목·운영 요약/점검 병렬 배치·파란 표 머리글을 한 시트에 적용합니다. */
export async function createMonthlyStyledWorkbook(documents: readonly ReportDefinition[]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const [overview, checks] = documents;
  const colors = {
    text: '#0F172A',
    muted: '#64748B',
    primary: '#2563EB',
    white: '#FFFFFF',
    heading: '#EFF6FF',
    alternate: '#F8FAFC',
    success: '#16A34A',
    warning: '#F59E0B',
    danger: '#EF4444',
    border: '#E2E8F0'
  };
  const cell = (value: string | bigint, style: CellObject = {}) => createReportCell(value, {
    fontSize: 10,
    height: 36,
    bottomBorderColor: colors.border,
    bottomBorderStyle: 'thin',
    ...style
  });
  const merge = (value: string | bigint, span: number, style: CellObject = {}) => [cell(value, {
    columnSpan: span,
    ...style
  }), ...Array(span - 1).fill(null)];
  const band = (label: string) => merge(label, 8, {
    height: 31,
    fontSize: 12,
    fontWeight: 'bold',
    textColor: colors.primary,
    backgroundColor: colors.heading
  });
  const blank = () => [cell('', {
    height: 18
  })];
  const heading = {
    backgroundColor: colors.heading,
    fontWeight: 'bold' as const,
    height: 29
  };
  const data: SheetData = [
    merge(`모아홈 | ${overview.title}`, 8, {
      height: 46,
      fontSize: 22,
      fontWeight: 'bold',
      textColor: colors.white,
      backgroundColor: colors.text
    }),
    merge(overview.description, 8, {
      height: 29,
      textColor: colors.muted
    }),
    merge(overview.summary.map((item) => `${item.label}: ${item.value}`).join(' | '), 8, {
      height: 28,
      fontSize: 10,
      textColor: colors.muted
    }), blank(),
    [...merge('이번 달 운영 요약', 4, heading), null, ...merge('월말 점검', 3, heading)],
    ['항목', '금액', '분류', '집계 기준', '', '점검 항목', '건수', '확인 상태'].map((label) => cell(label, heading))
  ];
  const categories = ['원본 입금', '원본 출금', '세대 수납', '동별 잔고', '당월 청구', '청구 충당', '미수 잔액', '외부 회수'];
  for (const [index, row] of overview.rows.entries()) {
    const check = checks.rows[index] ?? ['', '', ''];
    const values = [row[0], row[1], categories[index], row[2], '', ...check];
    data.push(values.map((value, column) => cell(value, {
      height: 45,
      backgroundColor: index % 2 ? colors.alternate : colors.white,
      ...(column === 1 ? {
        align: 'right',
        fontWeight: 'bold',
        textColor: index === 1 || index === 6 ? colors.danger : colors.primary
      } : {}),
      ...(column === 6 ? {
        align: 'right'
      } : {})
    })));
  }
  data.push(blank(), merge(overview.note, 8, {
    height: 34,
    textColor: colors.muted,
    backgroundColor: colors.alternate
  }));
  for (const section of documents.slice(2)) {
    data.push(blank(), band(section.title), merge(section.description, 8, {
      height: 27,
      fontSize: 10,
      textColor: colors.muted
    }));
    data.push(section.columns.map((column) => cell(column.label, {
      ...heading,
      align: column.align ?? 'left'
    })));
    for (const [index, row] of section.rows.entries()) {
      data.push(section.columns.map((column, position) => {
        const value = row[position] ?? '';
        const status = String(value);
        let textColor = colors.text;
        if (status === '납부완료' || status === '회수 완료') textColor = colors.success;
        if (status === '미납' || status === '회수 필요') textColor = colors.danger;
        if (status === '일부납부' || status === '일부 회수' || status.includes('확인 필요')) textColor = colors.warning;
        return cell(value, {
          height: section.sheet === '통장별 잔액' || section.sheet === '입출금 명세' ? 48 : 32,
          align: column.align ?? 'left',
          backgroundColor: index % 2 ? colors.alternate : colors.white,
          textColor
        });
      }));
    }
    if (section.total) data.push(section.columns.map((column, index) => cell(section.total![index] ?? '', {
      height: 34,
      fontSize: 11,
      fontWeight: 'bold',
      textColor: colors.primary,
      backgroundColor: colors.heading,
      align: column.align ?? 'left'
    })));
    data.push(merge(section.note, 8, {
      height: 32,
      fontSize: 9,
      textColor: colors.muted
    }));
  }
  return writeExcelFile([{
    sheet: '월별 정산 보고서',
    data,
    columns: [26, 25, 30, 28, 25, 26, 23, 24].map((width) => ({
      width
    })),
    showGridLines: false,
    stickyRowsCount: 6,
    orientation: 'landscape'
  }]).toBlob();
}
