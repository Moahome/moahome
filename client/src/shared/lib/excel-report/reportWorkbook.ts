import type {
  CellObject,
  SheetData
} from 'write-excel-file/universal';
import type {
  ReportColumn,
  ReportDefinition,
  ReportValue
} from './reportWorkbookTypes';

// 사용자가 제공한 지출 내역서의 문서 팔레트입니다. 브라우저 UI 색상과 별도로 XLSX에 기록합니다.
const COLORS = {
  text: '#0F172A',
  muted: '#64748B',
  primary: '#2563EB',
  white: '#FFFFFF',
  summary: '#EFF6FF',
  heading: '#DBEAFE',
  alternate: '#F8FAFC'
};
const BASE: CellObject = {
  fontFamily: '맑은 고딕',
  fontSize: 14,
  textColor: COLORS.text,
  backgroundColor: COLORS.white,
  alignVertical: 'center',
  wrap: true
};

/** 15자리 이내 원화는 계산 가능한 숫자로, 더 큰 합계는 Excel의 15자리 한계를 피해 정확한 문자열로 저장합니다. */
function cell(value: ReportValue, style: CellObject = {}): CellObject {
  if (typeof value === 'string') return {
    ...BASE,
    ...style,
    value,
    type: String
  };
  if (value >= -BigInt('999999999999999') && value <= BigInt('999999999999999')) {
    return {
      ...BASE,
      ...style,
      value: Number(value),
      type: Number,
      format: '#,##0"원"'
    };
  }
  return {
    ...BASE,
    ...style,
    value: value.toString(),
    type: String,
    format: '@'
  };
}

export {
  cell as createReportCell
};

/** 입력 데이터와 열 정의만 받아 공통 헤더·교차 행을 적용하며 이름·전화번호는 수식으로 변환하지 않습니다. */
function table(columns: readonly ReportColumn[], rows: readonly (readonly ReportValue[])[]): SheetData {
  return [
    columns.map((column) => cell(column.label, {
      height: 42,
      fontWeight: 'bold',
      backgroundColor: COLORS.heading,
      align: column.align ?? 'left'
    })),
    ...rows.map((row, index) => columns.map((column, columnIndex) => cell(row[columnIndex] ?? '', {
      height: 42,
      align: column.align ?? 'left',
      backgroundColor: index % 2 === 0 ? COLORS.alternate : COLORS.white
    })))
  ];
}

/** 한 보고서 시트의 내용·표시 옵션을 구성해 원장별 추가 시트도 같은 문서 서식을 사용합니다. */
function reportSheet({ title, description, sheet, columns, rows, summary, total, note }: ReportDefinition) {
  const width = columns.length;
  const labelSpan = Math.max(1, Math.ceil(width * 0.6));
  const merged = (value: string, style: CellObject) => [cell(value, {
    ...style,
    columnSpan: width
  }), ...Array(width - 1).fill(null)];
  const data: SheetData = [
    merged(title, {
      height: 56,
      fontSize: 24,
      fontWeight: 'bold'
    }),
    merged(description, {
      height: 28,
      fontSize: 12,
      textColor: COLORS.muted
    }),
    [cell('', {
      height: 16
    })],
    ...summary.map((item, index) => [
      cell(item.label, {
        columnSpan: labelSpan,
        height: index === 0 ? 53 : 38,
        fontSize: 13,
        fontWeight: 'bold',
        textColor: COLORS.muted,
        backgroundColor: COLORS.summary
      }),
      ...Array(labelSpan - 1).fill(null),
      cell(item.value, {
        columnSpan: width - labelSpan,
        align: 'right',
        fontSize: index === 0 ? 22 : 14,
        fontWeight: 'bold',
        textColor: index === 0 ? COLORS.primary : COLORS.text,
        backgroundColor: COLORS.summary
      }),
      ...Array(width - labelSpan - 1).fill(null)
    ]),
    [cell('', {
      height: 17
    })],
    ...table(columns, rows)
  ];
  if (total) data.push(columns.map((column, index) => cell(total[index] ?? '', {
    height: 48,
    fontSize: 16,
    fontWeight: 'bold',
    textColor: COLORS.primary,
    backgroundColor: COLORS.summary,
    align: column.align ?? 'left'
  })));
  data.push([cell('', {
    height: 16
  })], merged(note, {
    height: 30,
    fontSize: 11,
    textColor: COLORS.muted
  }));
  return {
    data,
    sheet,
    showGridLines: false,
    stickyRowsCount: summary.length + 5,
    columns: columns.map(({ width }) => ({
      width
    })),
    ...(columns.length > 5 ? {
      orientation: 'landscape' as const
    } : {})
  };
}

/** 실제 다운로드 때만 라이브러리를 읽고 요약·선택한 상세 원장을 한 파일로 저장합니다. */
export async function createReportWorkbook(definition: ReportDefinition & { additionalSheets?: readonly ReportDefinition[] }): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');

  return writeExcelFile([reportSheet(definition), ...(definition.additionalSheets ?? []).map(reportSheet)]).toBlob();
}

/** 재업로드용 첫 시트의 헤더·문자열을 유지하고 작성 안내는 별도 시트에 배치합니다. */
export async function createInputWorkbook({ title, sheet, columns, rows, instructions }: {
  title: string;
  sheet: string;
  columns: readonly ReportColumn[];
  rows: readonly (readonly string[])[];
  instructions: readonly string[];
}): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const guide: SheetData = [
    [cell(title, {
      columnSpan: 2,
      height: 56,
      fontSize: 24,
      fontWeight: 'bold'
    }), null],
    ...table([{
      label: '항목',
      width: 20
    }, {
      label: '작성 안내',
      width: 80
    }], instructions.map((value, index) => [String(index + 1), value]))
  ];

  return writeExcelFile([
    {
      sheet,
      data: table(columns, rows),
      showGridLines: false,
      stickyRowsCount: 1,
      columns: columns.map(({ width }) => ({
        width
      }))
    },
    {
      sheet: '작성 안내',
      data: guide,
      showGridLines: false,
      columns: [{
        width: 20
      }, {
        width: 80
      }]
    }
  ]).toBlob();
}
