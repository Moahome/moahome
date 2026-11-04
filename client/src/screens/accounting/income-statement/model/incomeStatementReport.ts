import { formatInteger } from '@/shared/lib/format';
import { formatMonthRange } from '@/shared/lib/month-range';
import type { ReportDefinition } from '@/shared/lib/excel-report';
import { createReportPdfDocument } from '@/shared/lib/pdf-report';
import {
  getIncomeChartRatio,
  getIncomeTrend
} from './incomeStatement';
import type { IncomeStatementReport } from './incomeStatementTypes';

/** 화면에서 확정한 기간·동·그래프 방식의 자료를 공통 Excel·PDF·이미지 미리보기에 전달합니다. */
export function getIncomeReportDocuments(report: IncomeStatementReport, cumulative: boolean): ReportDefinition[] {
  const description = `${report.propertyName} · ${report.isExample ? '예시 데이터 · ' : ''}${formatMonthRange(report.range)} · ${report.buildingName}`;
  const summary = [
    {
      label: '수익 합계',
      value: report.revenue
    },
    {
      label: '비용 합계',
      value: report.expense
    },
    {
      label: '기간 순손익',
      value: report.profit
    }
  ];
  const note = report.isExample ? '화면 확인용 가상 자료이며 실제 관리대상의 회계 자료가 아닙니다.' : report.notice;
  return [{
    title: report.isExample ? '손익계산서 (예시)' : '손익계산서',
    highlightNegative: true,
    description,
    sheet: '손익계산서',
    columns: [{
      label: '계정과목',
      width: 42
    }, {
      label: '기간 합계',
      width: 28,
      align: 'right'
    }],
    rows: report.rows.filter((row) => row.kind !== 'total').map((row) => [row.kind === 'account' ? `    ${row.label}` : row.label, row.amount]),
    summary,
    total: ['기간 순손익', report.profit],
    note
  }, {
    title: `${cumulative ? '기간 누계 손익' : '월별 손익 추이'}${report.isExample ? ' (예시)' : ''}`,
    highlightNegative: true,
    description,
    sheet: cumulative ? '누계 손익' : '월별 손익',
    columns: [
      {
        label: '월',
        width: 20
      },
      {
        label: '수익',
        width: 25,
        align: 'right'
      },
      {
        label: '비용',
        width: 25,
        align: 'right'
      },
      {
        label: '순손익',
        width: 25,
        align: 'right'
      }
    ],
    rows: getIncomeTrend(report, cumulative).map((row) => [row.month, row.revenue, row.expense, row.profit]),
    summary: [],
    note: `${note} ${cumulative ? '누계는 조회 시작 월부터 합산하며 월별 누계를 다시 더하지 않습니다.' : '월별 금액의 합계는 기간 손익과 같습니다.'}`
  }, ...(report.issues.length ? [{
    title: '회계 확인 필요',
    sheet: '회계 확인 필요',
    description,
    columns: [{
      label: '확인 항목',
      width: 60
    }, {
      label: '원천 금액',
      width: 28,
      align: 'right' as const
    }],
    rows: report.issues.map((issue) => [issue.label, BigInt(issue.amount)]),
    summary: [],
    highlightNegative: true,
    note: '이 금액은 미확인 원천 금액이며 손익 합계가 아닙니다. 귀속 월 미확인 지출은 조회 기간과 별개로 표시합니다.'
  }] : [])];
}

/** 공통 한글 PDF 설정을 재사용하고 같은 월 자료로 그래프·표를 그려 이미지 출력과 일치시킵니다. */
export async function createIncomeReportPdf(report: IncomeStatementReport, cumulative: boolean): Promise<Blob> {
  const [{ autoTable }, pdf] = await Promise.all([import('jspdf-autotable'), createReportPdfDocument()]);
  const documents = getIncomeReportDocuments(report, cumulative);
  const colors = {
    text: '#0F172A',
    muted: '#64748B',
    primary: '#2563EB',
    teal: '#0D9488',
    border: '#E2E8F0',
    soft: '#F8FAFC',
    blue: '#EFF6FF',
    white: '#FFFFFF',
    danger: '#EF4444'
  };
  const money = (value: bigint | string) => typeof value === 'bigint' ? `${formatInteger(value)}원` : value;
  pdf.setProperties({
    title: `${report.propertyName} 손익계산서${report.isExample ? ' (예시)' : ''}`,
    creator: '모아홈'
  });

  /** 자동 표가 여러 페이지로 나뉘어도 예시·조회 범위·페이지 번호를 매 장에 표시합니다. */
  function header(title: string) {
    pdf.setFillColor(colors.primary);
    pdf.rect(0, 0, 210, 2, 'F');
    pdf.setFont('Pretendard', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(colors.primary);
    pdf.text(report.isExample ? 'MOAHOME / 예시 데이터' : `MOAHOME / ${report.issues.length ? '잠정 손익' : '등록·확인 자료 기준'}`, 14, 14);
    pdf.setFontSize(20);
    pdf.setTextColor(colors.text);
    pdf.text(title, 14, 28);
    pdf.setFont('Pretendard', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(colors.muted);
    pdf.text(pdf.splitTextToSize(`${report.propertyName} | ${formatMonthRange(report.range)} | ${report.buildingName}`, 182), 14, 37);
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(documents[0].note, 172), 14, 282);
    pdf.text(String(pdf.getCurrentPageInfo().pageNumber), 196, 286, {
      align: 'right'
    });
  }

  header('손익계산서');
  documents[0].summary.forEach((item, index) => {
    const x = 14 + index * 62;
    pdf.setFillColor(colors.blue);
    pdf.roundedRect(x, 45, 58, 24, 2, 2, 'F');
    pdf.setFont('Pretendard', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(colors.muted);
    pdf.text(item.label, x + 4, 53);
    pdf.setFont('Pretendard', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(typeof item.value === 'bigint' && item.value < BigInt(0) ? colors.danger : index === 2 ? colors.primary : colors.text);
    pdf.text(money(item.value), x + 4, 63);
  });
  autoTable(pdf, {
    startY: 78,
    margin: {
      top: 45,
      right: 14,
      bottom: 20,
      left: 14
    },
    head: [['계정과목', '기간 합계']],
    body: report.rows.map((row) => [row.kind === 'account' ? `    ${row.label}` : row.label, money(row.amount)]),
    styles: {
      font: 'Pretendard',
      fontSize: 11,
      cellPadding: 3.3,
      textColor: colors.text,
      lineColor: colors.border,
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: colors.soft,
      textColor: colors.muted,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: {
        cellWidth: 110
      },
      1: {
        halign: 'right'
      }
    },
    didParseCell(data) {
      const row = report.rows[data.row.index];
      if (data.section === 'body' && row?.kind !== 'account') {
        data.cell.styles.fillColor = row?.kind === 'total' ? colors.blue : colors.soft;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.column.index === 1 && row?.amount < BigInt(0)) data.cell.styles.textColor = colors.danger;
    },
    didDrawPage(data) { if (data.pageNumber > 1) header('손익계산서 (계속)'); }
  });

  pdf.addPage();
  header(cumulative ? '기간 누계 손익' : '월별 손익 추이');
  const trend = getIncomeTrend(report, cumulative);
  // 긴 조회 기간은 그래프를 일정한 월 수로 나눠 축·막대가 겹치지 않게 합니다.
  for (let offset = 0; offset < trend.length; offset += 8) {
    if (offset > 0) { pdf.addPage(); header(cumulative ? '기간 누계 손익 (계속)' : '월별 손익 추이 (계속)'); }
    const rows = trend.slice(offset, offset + 8);
    const values = rows.flatMap((row) => [row.revenue, row.expense, row.profit]);
    const top = values.reduce((max, value) => value > max ? value : max, BigInt(1));
    const bottom = values.reduce((min, value) => value < min ? value : min, BigInt(0));
    const y = (value: bigint) => 54 + getIncomeChartRatio(top - value, top - bottom) * 57;
    const x = (index: number) => 32 + (index + 0.5) * 162 / rows.length;
    const unit = top >= BigInt(10000) ? BigInt(10000) : BigInt(1);
    pdf.setFont('Pretendard', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(colors.muted);
    pdf.text(unit === BigInt(1) ? '(원)' : '(만원)', 14, 48);
    for (let tick = 0; tick <= 4; tick++) {
      const amount = top - (top - bottom) * BigInt(tick) / BigInt(4);
      pdf.setDrawColor(colors.border);
      pdf.line(32, y(amount), 196, y(amount));
      pdf.text(formatInteger(amount / unit), 29, y(amount) + 1, {
        align: 'right'
      });
    }
    rows.forEach((row, index) => {
      [row.revenue, row.expense].forEach((value, series) => {
        pdf.setFillColor(value < BigInt(0) ? colors.danger : series === 0 ? colors.primary : colors.border);
        pdf.rect(x(index) - 6 + series * 6, Math.min(y(value), y(BigInt(0))), 5, Math.max(0.3, Math.abs(y(value) - y(BigInt(0)))), 'F');
      });
      pdf.setTextColor(colors.muted);
      pdf.text(row.month.slice(2).replace('-', '.'), x(index), 119, {
        align: 'center'
      });
      pdf.setDrawColor(colors.teal);
      pdf.setLineWidth(0.6);
      if (index > 0) {
        const previous = rows[index - 1].profit;
        // 부호가 달라지는 선은 0원 교점을 기준으로 나눠 적자 구간만 붉게 표시합니다.
        if ((previous < BigInt(0)) !== (row.profit < BigInt(0))) {
          const previousAbs = previous < BigInt(0) ? -previous : previous;
          const currentAbs = row.profit < BigInt(0) ? -row.profit : row.profit;
          const zeroX = x(index - 1) + (x(index) - x(index - 1)) * getIncomeChartRatio(previousAbs, previousAbs + currentAbs);
          pdf.setDrawColor(previous < BigInt(0) ? colors.danger : colors.teal);
          pdf.line(x(index - 1), y(previous), zeroX, y(BigInt(0)));
          pdf.setDrawColor(row.profit < BigInt(0) ? colors.danger : colors.teal);
          pdf.line(zeroX, y(BigInt(0)), x(index), y(row.profit));
        } else {
          pdf.setDrawColor(row.profit < BigInt(0) ? colors.danger : colors.teal);
          pdf.line(x(index - 1), y(previous), x(index), y(row.profit));
        }
      }
      pdf.setDrawColor(row.profit < BigInt(0) ? colors.danger : colors.teal);
      pdf.setFillColor(colors.white);
      pdf.circle(x(index), y(row.profit), 1.1, 'FD');
    });
    pdf.setTextColor(colors.primary); pdf.text('■ 수익', 55, 130);
    pdf.setTextColor(colors.muted); pdf.text('■ 비용', 90, 130);
    pdf.setTextColor(colors.teal); pdf.text('─ 순손익', 125, 130);
    autoTable(pdf, {
      startY: 138,
      margin: {
        top: 45,
        right: 14,
        bottom: 20,
        left: 14
      },
      head: [['월', '수익', '비용', '순손익']],
      body: rows.map((row) => [row.month, money(row.revenue), money(row.expense), money(row.profit)]),
      styles: {
        font: 'Pretendard',
        fontSize: 10,
        cellPadding: 3,
        textColor: colors.text
      },
      headStyles: {
        fillColor: colors.soft,
        textColor: colors.muted
      },
      columnStyles: {
        1: {
          halign: 'right'
        },
        2: {
          halign: 'right'
        },
        3: {
          halign: 'right'
        }
      },
      didParseCell(data) {
        if (data.section !== 'body') return;
        const row = rows[data.row.index];
        const value = [null, row.revenue, row.expense, row.profit][data.column.index];
        if (value !== null && value < BigInt(0)) data.cell.styles.textColor = colors.danger;
        else if (data.column.index === 3) data.cell.styles.textColor = colors.primary;
      }
    });
  }
  if (report.issues.length) {
    pdf.addPage();
    header('회계 확인 필요');
    autoTable(pdf, {
      startY: 49,
      margin: {
        top: 49,
        bottom: 23,
        left: 14,
        right: 14
      },
      head: [['확인 항목', '원천 금액']],
      body: report.issues.map((issue) => [issue.label, `${formatInteger(issue.amount)}원`]),
      styles: {
        font: 'Pretendard',
        fontSize: 10,
        cellPadding: 3,
        textColor: colors.text
      },
      headStyles: {
        fillColor: colors.soft,
        textColor: colors.muted
      },
      columnStyles: {
        1: {
          halign: 'right'
        }
      },
      didDrawPage(data) { if (data.pageNumber > 1) header('회계 확인 필요 (계속)'); },
      didParseCell(data) { if (data.section === 'body' && data.column.index === 1 && BigInt(report.issues[data.row.index].amount) < BigInt(0)) data.cell.styles.textColor = colors.danger; }
    });
  }
  return pdf.output('blob');
}
