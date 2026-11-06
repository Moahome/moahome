import type {
  CellObject,
  SheetData
} from 'write-excel-file/universal';
import { createReportCell } from '@/shared/lib/excel-report';
import type { ReportDefinition } from '@/shared/lib/excel-report';

/** 같은 조회 자료의 일곱 영역을 각각의 시트로 내보내고 기존 제목·표·정확한 원화 셀 서식을 유지합니다. */
export async function createMonthlyStyledWorkbook(documents: readonly ReportDefinition[]): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const overview = documents[0];
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
  const blank = () => [cell('', {
    height: 18
  })];
  const heading = {
    backgroundColor: colors.heading,
    fontWeight: 'bold' as const,
    height: 29
  };
  const metadata = overview.summary.map((item) => `${item.label}: ${item.value}`).join(' | ');
  const sheets = documents.map((section) => {
    const width = section.columns.length;
    const data: SheetData = [
      merge(`모아홈 | ${section.title}`, width, {
        height: 46,
        fontSize: 22,
        fontWeight: 'bold',
        textColor: colors.white,
        backgroundColor: colors.text
      }),
      merge(section.description, width, {
        height: 29,
        textColor: colors.muted
      }),
      merge(metadata, width, {
        height: 28,
        fontSize: 10,
        textColor: colors.muted
      }),
      blank(),
      section.columns.map((column) => cell(column.label, {
        ...heading,
        align: 'center'
      }))
    ];
    // 같은 문서 정의의 행과 합계를 각 시트에 한 번씩 기록해 화면 필터와 시트 분리가 금액을 바꾸지 않게 합니다.
    for (const [index, row] of section.rows.entries()) {
      data.push(section.columns.map((column, position) => {
        const value = row[position] ?? '';
        const status = String(value);
        let textColor = colors.text;
        if (status === '납부완료' || status === '회수 완료') textColor = colors.success;
        if (status === '미납' || status === '회수 필요') textColor = colors.danger;
        if (status === '일부납부' || status === '일부 회수' || status.includes('확인 필요')) textColor = colors.warning;

        return cell(value, {
          height: section.sheet === '입출금 명세' ? 48 : 36,
          align: column.align ?? 'left',
          backgroundColor: index % 2 ? colors.alternate : colors.white,
          textColor
        });
      }));
    }
    if (!section.rows.length) data.push(merge('해당 월 자료가 없습니다.', width, {
      height: 36,
      textColor: colors.muted
    }));
    if (section.total) data.push(section.columns.map((column, index) => cell(section.total![index] ?? '', {
      height: 34,
      fontSize: 11,
      fontWeight: 'bold',
      textColor: colors.primary,
      backgroundColor: colors.heading,
      align: column.align ?? 'left'
    })));
    data.push(blank(), merge(section.note, width, {
      height: 44,
      fontSize: 9,
      textColor: colors.muted
    }));

    return {
      sheet: section.sheet,
      data,
      columns: section.columns.map((column) => ({
        width: column.width
      })),
      showGridLines: false,
      stickyRowsCount: 5,
      ...(section.columns.length > 5 ? {
        orientation: 'landscape' as const
      } : {})
    };
  });

  return writeExcelFile(sheets).toBlob();
}
