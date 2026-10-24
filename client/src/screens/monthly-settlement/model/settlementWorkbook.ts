import type {
  CellObject,
  SheetData
} from 'write-excel-file/universal';
import { createReportCell } from '@/shared/lib/excel-report';
import type { ReportDefinition } from '@/shared/lib/excel-report';
import { getSettlementSections } from './settlementExport';

/** 첨부 엑셀의 제목 띠·가로 요약 카드·동별 명세를 한 시트에 구성하고 공통 숫자 정밀도 처리를 재사용합니다. */
export async function createSettlementStyledWorkbook(document: ReportDefinition): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const sections = getSettlementSections(document);
  const colors = {
    text: '#0F172A',
    muted: '#64748B',
    primary: '#2563EB',
    danger: '#EF4444',
    white: '#FFFFFF',
    soft: '#F8FAFC',
    blue: '#EFF6FF',
    red: '#FEF2F2',
    border: '#E2E8F0'
  };
  const cell = (value: string | bigint, style: CellObject = {}) => createReportCell(value, {
    fontSize: 10,
    height: 27,
    bottomBorderColor: colors.border,
    bottomBorderStyle: 'thin',
    ...style
  });
  const merge = (value: string | bigint, span: number, style: CellObject = {}) => [cell(value, {
    columnSpan: span,
    ...style
  }), ...Array(span - 1).fill(null)];
  const band = (label: string) => merge(label, 8, {
    height: 30,
    fontSize: 11,
    fontWeight: 'bold',
    textColor: colors.primary,
    backgroundColor: colors.blue
  });
  const blank = () => [cell('', {
    height: 14
  })];
  const amount = (value: bigint | null) => value ?? '설정 필요';
  const summary = (label: string) => document.summary.find((row) => row.label === label)?.value ?? '';
  const data: SheetData = [
    merge(document.title.replace('모아홈 ', '모아홈 | '), 8, {
      height: 42,
      fontSize: 19,
      fontWeight: 'bold',
      textColor: colors.white,
      backgroundColor: colors.text
    }),
    merge(`${summary('조회 월')} · ${summary('조회 동')} · ${summary('조회 계좌')} · ${summary('기간 상태')}`, 8, {
      height: 28,
      textColor: colors.muted
    }),
    merge(`조회 시각: ${summary('조회시각')}`, 8, {
      height: 23,
      fontSize: 9,
      textColor: colors.muted
    }),
    band('월별 입출금 및 잔액 요약')
  ];

  /** 네 요약값은 두 칸씩 묶어 기초 잔액·수입·지출·월말 잔액을 같은 줄에서 읽게 합니다. */
  function cards(start: string | bigint, income: string | bigint, expense: string | bigint, end: string | bigint) {
    const values = [start, income, expense, end];
    data.push(['기초 잔액', '입금 합계', '지출 합계', '월말 잔액'].flatMap((label) => merge(label, 2, {
      height: 23,
      fontSize: 9,
      fontWeight: 'bold',
      textColor: colors.muted,
      backgroundColor: colors.soft
    })));
    data.push(values.flatMap((value, index) => merge(value, 2, {
      height: 42,
      fontSize: 17,
      fontWeight: 'bold',
      align: 'right',
      textColor: index === 1 ? colors.primary : index === 2 ? colors.danger : colors.text,
      backgroundColor: colors.soft
    })));
  }
  cards(summary('기초 잔액'), document.total?.[5] ?? BigInt(0), document.total?.[6] ?? BigInt(0), summary('월말 잔액'));
  data.push(blank(), band('동별 자금 요약'));
  data.push(['동', '기초 잔액', '입금 합계', '지출 합계', '월말 잔액', '입금 건수', '지출 건수', '전체 건수'].map((label) => cell(label, {
    fontSize: 9,
    height: 30,
    fontWeight: 'bold',
    backgroundColor: colors.soft
  })));
  sections.forEach((section, index) => {
    const counts = [section.rows.filter((row) => BigInt(row[5]) !== BigInt(0)).length, section.rows.filter((row) => BigInt(row[6]) !== BigInt(0)).length, section.rows.length];
    data.push([section.label, amount(section.start), section.income, section.expense, amount(section.end), ...counts.map(BigInt)].map((value, column) => cell(value, {
      height: 32,
      align: column ? 'right' : 'left',
      backgroundColor: index % 2 ? colors.soft : colors.white,
      ...(column >= 5 ? {
        format: '0"건"'
      } : {})
    })));
  });
  const spans = [2, 1, 2, 1, 1, 1];
  for (const section of sections) {
    data.push(blank(), band(`${section.label} 거래 상세 · 총 ${section.rows.length}건`));
    cards(amount(section.start), section.income, section.expense, amount(section.end));
    data.push(['거래일시', '구분', '입금자 · 지출명', '입금액', '지출액', '잔액'].flatMap((label, index) => merge(label, spans[index], {
      height: 30,
      fontWeight: 'bold',
      backgroundColor: colors.soft,
      align: index >= 3 ? 'right' : 'left'
    })));
    if (!section.rows.length) data.push(merge('조회 월의 입금·지출 내역이 없습니다.', 8, {
      textColor: colors.muted
    }));
    for (const [index, row] of section.rows.entries()) {
      const values = [row[1], row[3], row[4], row[5], row[6], row[7]];
      data.push(values.flatMap((value, column) => merge(value, spans[column], {
        height: 27,
        backgroundColor: index % 2 ? colors.soft : colors.white,
        align: column >= 3 ? 'right' : column === 1 ? 'center' : 'left',
        ...(column === 1 ? {
          textColor: value === '지출' ? colors.danger : colors.primary,
          backgroundColor: value === '지출' ? colors.red : colors.blue,
          fontWeight: 'bold'
        } : {}),
        ...(column >= 3 && typeof value === 'bigint' && value !== BigInt(0) ? {
          fontWeight: 'bold'
        } : {})
      })));
    }
    data.push([...merge(`${section.label} 소계`, 5, {
      height: 32,
      backgroundColor: colors.blue,
      fontWeight: 'bold'
    }), ...[section.income, section.expense, amount(section.end)].map((value) => cell(value, {
      height: 32,
      align: 'right',
      fontWeight: 'bold',
      backgroundColor: colors.blue
    }))]);
  }
  data.push(blank(), [...merge('전체 합계', 5, {
    height: 34,
    backgroundColor: colors.blue,
    fontWeight: 'bold'
  }), ...[document.total?.[5] ?? BigInt(0), document.total?.[6] ?? BigInt(0), summary('월말 잔액')].map((value) => cell(value, {
    height: 34,
    align: 'right',
    fontWeight: 'bold',
    textColor: colors.primary,
    backgroundColor: colors.blue
  }))], blank(), merge(document.note, 8, {
    height: 28,
    fontSize: 9,
    textColor: colors.muted
  }));
  return writeExcelFile([{
    sheet: document.sheet,
    data,
    showGridLines: false,
    stickyRowsCount: 9,
    columns: [12, 12, 10, 16, 16, 18, 18, 19].map((width) => ({
      width
    }))
  }]).toBlob();
}
