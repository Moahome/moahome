import type { ReportDefinition } from '@/shared/lib/excel-report';
import { formatInteger } from '@/shared/lib/format';
import { createReportPdfDocument } from '@/shared/lib/pdf-report';

/** 첨부 세로 PDF의 종합 요약 / 통장 확인 / 수납·외부 정산 구성을 실제 월 자료에 적용합니다. */
export async function createMonthlyReportPdf(documents: readonly ReportDefinition[]): Promise<Blob> {
  const [{ autoTable }, pdf] = await Promise.all([import('jspdf-autotable'), createReportPdfDocument()]);
  const [overview, checks, accounts, buildings, collections, cash, external] = documents;
  const color = {
    text: '#0F172A',
    muted: '#64748B',
    primary: '#2563EB',
    teal: '#0D9488',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#16A34A',
    border: '#E2E8F0',
    soft: '#F8FAFC',
    blue: '#EFF6FF',
    white: '#FFFFFF'
  };
  const money = (value: string | bigint) => typeof value === 'bigint' ? value === BigInt(0) ? '—' : `${formatInteger(value)}원` : value;
  const metadata = (label: string) => String(overview.summary.find((item) => item.label === label)?.value ?? '');
  const month = metadata('조회 월');
  const monthLabel = `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
  let cursor = 0;
  pdf.setProperties({
    title: `모아홈 ${overview.title} ${month}`,
    creator: '모아홈'
  });

  /** 논리 영역의 첫 페이지에만 제목을 그리고 표가 길어지면 제목을 반복하지 않고 다음 페이지로 잇습니다. */
  function header(title: string) {
    pdf.setFillColor(color.text); pdf.rect(0, 0, 210, 3, 'F');
    pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(9); pdf.setTextColor(color.primary); pdf.text('MOAHOME / 모아홈', 13, 13);
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(8); pdf.setTextColor(color.muted); pdf.text(`월별 정산 · ${monthLabel}`, 197, 13, {
      align: 'right'
    });
    pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(19); pdf.setTextColor(color.text); pdf.text(title, 13, 28);
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(8); pdf.setTextColor(color.muted); pdf.text(`${monthLabel} 운영 현황 | ${metadata('조회시각')} 조회`, 13, 36);
    pdf.setDrawColor(color.border); pdf.setLineWidth(0.2); pdf.line(13, 42, 197, 42);
  }

  /** 큰 요약 영역 다음의 표 제목과 보조 설명을 같은 기준선에 배치합니다. */
  function heading(title: string, y: number, description = '') {
    pdf.setFillColor(color.primary); pdf.roundedRect(13, y - 3.5, 1.2, 6, 0.6, 0.6, 'F');
    pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(11); pdf.setTextColor(color.text); pdf.text(title, 17, y + 0.5);
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(7); pdf.setTextColor(color.muted); pdf.text(description, 197, y + 0.5, {
      align: 'right'
    });
  }

  /** 표를 자료 수만큼 이어 출력하고 금액은 정확한 정수 문자열로 표시합니다. */
  function table(document: ReportDefinition, y: number, widths: number[], compact = false, rows = document.rows, columns = document.columns, total = document.total) {
    autoTable(pdf, {
      startY: y,
      margin: {
        top: 18,
        bottom: 25,
        left: 13,
        right: 13
      },
      head: [columns.map((column) => column.label)],
      body: rows.length ? rows.map((row) => row.map(money)) : [[{
        content: '해당 월 자료가 없습니다.',
        colSpan: columns.length
      }]],
      foot: total ? [total.map(money)] : undefined,
      showFoot: 'lastPage',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      theme: 'plain',
      styles: {
        font: 'Pretendard',
        fontSize: compact ? 6.8 : 7.8,
        textColor: color.text,
        cellPadding: compact ? 1.7 : 2.5,
        minCellHeight: compact ? 6.1 : 8.5,
        lineColor: color.border,
        lineWidth: {
          bottom: 0.1
        },
        valign: 'middle'
      },
      headStyles: {
        fillColor: color.blue,
        fontStyle: 'bold'
      },
      footStyles: {
        fillColor: color.blue,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: color.soft
      },
      columnStyles: Object.fromEntries(columns.map((column, index) => [index, {
        cellWidth: widths[index],
        halign: column.align ?? 'left'
      }])),
      didParseCell: (cell) => {
        if (cell.section !== 'body') return;
        const value = String(cell.cell.raw);
        if (value === '미납' || value === '회수 필요') cell.cell.styles.textColor = color.danger;
        if (value === '납부완료' || value === '회수 완료') cell.cell.styles.textColor = color.success;
        if (value === '일부납부' || value === '일부 회수' || value.includes('확인 필요')) cell.cell.styles.textColor = color.warning;
      },
      didDrawPage: (data) => { cursor = data.cursor?.y ?? y; }
    });
  }

  header(overview.title);
  pdf.setFillColor(color.blue); pdf.roundedRect(13, 46, 184, 12, 2, 2, 'F');
  pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(8); pdf.setTextColor(color.primary); pdf.text(`조회 월 ${monthLabel}`, 17, 53.5);
  pdf.setTextColor(color.muted); pdf.text(metadata('기간 상태'), 193, 53.5, {
    align: 'right'
  });
  heading('핵심 운영 지표', 66, '수납액과 청구 충당액은 서로 다른 집계입니다');
  const metricColors = [color.primary, color.warning, color.teal, color.primary, color.primary, color.teal, color.danger, color.warning];
  for (const [index, metric] of overview.rows.entries()) {
    const x = 13 + (index % 4) * 47; const y = 73 + Math.floor(index / 4) * 30;
    pdf.setDrawColor(color.border); pdf.setFillColor(color.white); pdf.roundedRect(x, y, 43, 26, 3, 3, 'FD');
    pdf.setFillColor(metricColors[index]); pdf.roundedRect(x + 3, y + 4, 1, 4.5, 0.5, 0.5, 'F');
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(7); pdf.setTextColor(color.muted); pdf.text(String(metric[0]), x + 6, y + 7.5);
    const value = money(metric[1]); pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(12); pdf.setTextColor(index === 6 ? color.danger : color.text);
    if (pdf.getTextWidth(value) > 35) pdf.setFontSize(12 * 35 / pdf.getTextWidth(value));
    pdf.text(value, x + 3.5, y + 17);
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(5.8); pdf.setTextColor(color.muted); pdf.text(String(metric[2]), x + 3.5, y + 23);
  }
  heading('월말 점검', 140, '확인 안내이며 자동 마감 차단 결과가 아닙니다');
  for (const [index, row] of checks.rows.entries()) {
    const x = 13 + (index % 3) * 62.5; const y = 147 + Math.floor(index / 3) * 25;
    pdf.setFillColor(color.soft); pdf.setDrawColor(color.border); pdf.roundedRect(x, y, 59, 21, 2.5, 2.5, 'FD');
    pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(7); pdf.setTextColor(color.text); pdf.text(String(row[0]), x + 3, y + 7);
    pdf.setFont('Pretendard', 'normal'); pdf.setTextColor(String(row[1]) === '0건' ? color.muted : color.warning); pdf.text(String(row[1]), x + 55, y + 7, {
      align: 'right'
    });
    pdf.setFontSize(6.8); pdf.text(String(row[2]), x + 3, y + 15.5);
  }
  heading(buildings.title, 205, '통장 기준 입출금이 아닌 동별 귀속액');
  table(buildings, 212, [26, 40, 40, 39, 39]);
  if (cursor < 250) {
    pdf.setFillColor(color.soft); pdf.roundedRect(13, cursor + 6, 184, 15, 2, 2, 'F');
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(7); pdf.setTextColor(color.muted); pdf.text(overview.note, 17, cursor + 12, {
      maxWidth: 176
    });
  }

  pdf.addPage(); header('통장 확인 및 입출금 명세'); heading(accounts.title, 53, '확인시점이 다르면 동일 시점 대사 결과가 아닙니다');
  table(accounts, 60, [58, 28, 44, 28, 26]);
  let y = cursor + 14;
  if (y > 220) { pdf.addPage(); y = 22; }
  heading(`${cash.title} · 총 ${cash.rows.length}건`, y, '은행 원본과 유효 수동 거래');
  table(cash, y + 7, [23, 40, 55, 24, 24, 18], false, cash.rows.map((row) => [row[0], row[1], row[2], row[3], row[4], `${row[5]}${row[6] === '내부 이체' ? ' · 이체' : ''}`]), cash.columns.slice(0, 6), cash.total?.slice(0, 6));

  pdf.addPage(); header('수납·미납 및 외부 부담금');
  pdf.setFillColor(color.blue); pdf.roundedRect(13, 47, 184, 17, 3, 3, 'F');
  const figures = [['대상 세대', `${collections.rows.length}세대`], ['당월 청구액', money(overview.rows[4][1])], ['미수금', money(overview.rows[6][1])]];
  figures.forEach(([label, value], index) => {
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(7); pdf.setTextColor(color.muted); pdf.text(label, 18 + index * 61, 53);
    pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(12); pdf.setTextColor(index === 2 ? color.danger : color.text); pdf.text(value, 18 + index * 61, 60);
  });
  heading(collections.title, 73, '전월 이월을 포함한 청구월 누적 기준');
  table(collections, 80, [29, 18, 23, 23, 23, 23, 23, 22], true);
  y = cursor + 10;
  if (y > 235) { pdf.addPage(); y = 22; }
  heading(external.title, y, '선택 월 지출 · 정산 제외분은 합계에서 제외');
  table(external, y + 7, [24, 22, 38, 26, 26, 26, 22], true);
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(color.border); pdf.line(13, 280, 197, 280);
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(7); pdf.setTextColor(color.muted);
    pdf.text(`${monthLabel} 월간 운영 보고서 · 금액의 —는 0원입니다.`, 13, 286); pdf.text(`${page} / ${pages}`, 197, 286, {
      align: 'right'
    });
  }
  return pdf.output('blob');
}
