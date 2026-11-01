import { formatInteger } from '@/shared/lib/format';
import { createReportPdfDocument } from '@/shared/lib/pdf-report';
import type { MonthlyReportSnapshot } from './monthlyExportTypes';
import {
  getMonthlyReportDocument,
  getMonthlyReportMetrics
} from './monthlyExport';

/** 첨부 시안의 제목·건물 장식·금액 카드·상태 배지를 같은 수납 자료로 그려 PDF와 PNG에 공유합니다. */
export async function createMonthlyCollectionPdf(data: MonthlyReportSnapshot): Promise<Blob> {
  const [{ autoTable }, pdf] = await Promise.all([import('jspdf-autotable'), createReportPdfDocument('landscape')]);
  const document = getMonthlyReportDocument(data);
  const metrics = getMonthlyReportMetrics(document);
  const colors = {
    text: '#0F172A',
    muted: '#64748B',
    primary: '#2563EB',
    teal: '#0D9488',
    danger: '#EF4444',
    success: '#16A34A',
    warning: '#F59E0B',
    border: '#E2E8F0',
    soft: '#F8FAFC',
    white: '#FFFFFF',
  };
  const tint = (color: string, weight = 0.07) => `#${[1, 3, 5].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * weight + 255 * (1 - weight)).toString(16).padStart(2, '0')).join('')}`;
  const metadata = (label: string) => String(document.summary.find((item) => item.label === label)?.value ?? '');
  const money = (value: string | bigint) => typeof value === 'bigint' ? `${formatInteger(value)}원` : value;
  const description = pdf.setFont('Pretendard', 'normal').setFontSize(11).splitTextToSize(document.description, 200) as string[];
  const timestampY = 43 + description.length * 5;
  const cardsY = timestampY + 12;
  const tableY = cardsY + 38;
  const reportWidths: Record<number, number[]> = {
    4: [70, 65, 70, 68],
    6: [44, 40, 48, 48, 50, 43],
    7: [38, 34, 40, 40, 43, 43, 35]
  };
  const widths = reportWidths[document.columns.length];
  const statusColors: Record<string, string> = {
    미납: colors.danger,
    일부납부: colors.warning,
    납부완료: colors.success,
    선입금: colors.teal,
  };
  pdf.setProperties({
    title: `${document.title} ${data.month}`,
    subject: '세대별 청구·수납 및 미수금 현황',
    creator: '모아홈',
  });

  /** 장식은 원본 데이터를 담지 않는 옅은 벡터로 그려 외부 이미지 요청 없이 보고서를 저장합니다. */
  function drawBuildings() {
    for (const [x, top, width] of [[230, 20, 13], [247, 8, 17], [268, 15, 14]]) {
      pdf.setFillColor(colors.soft); pdf.rect(x, top, width, 43 - top, 'F');
      pdf.setFillColor(tint(colors.muted, 0.12));
      for (let y = top + 4; y < 40; y += 6) {
        pdf.rect(x + 3, y, 2.5, 3.5, 'F');
        pdf.rect(x + width - 5.5, y, 2.5, 3.5, 'F');
      }
    }
    pdf.setFillColor(tint(colors.muted, 0.14));
    pdf.circle(224, 39, 2.5, 'F'); pdf.rect(223.6, 40, 0.8, 4, 'F');
    pdf.circle(286, 38, 3, 'F'); pdf.rect(285.6, 40, 0.8, 4, 'F');
  }

  /** 원형 금액 아이콘은 카드의 의미 색상과 함께 표시하고 숫자·업무 상태와 혼동하지 않게 합니다. */
  function drawMetricIcon(tone: typeof metrics[number]['tone'], x: number, y: number) {
    const color = colors[tone];
    pdf.setFillColor(tint(color, 0.14)); pdf.circle(x, y, 8, 'F');
    pdf.setDrawColor(color); pdf.setFillColor(color); pdf.setLineWidth(0.6);
    if (tone === 'danger') {
      pdf.triangle(x, y - 3.7, x - 3.9, y + 3.2, x + 3.9, y + 3.2, 'F');
      pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(12); pdf.setTextColor(colors.white);
      pdf.text('!', x, y + 2.1, {
        align: 'center'
      });
      return;
    }
    if (tone === 'primary') {
      for (let offset = 0; offset < 3; offset++) {
        pdf.ellipse(x, y - 2.7 + offset * 2.4, 2.8, 1.1, 'S');
        if (offset < 2) { pdf.line(x - 2.8, y - 2.7 + offset * 2.4, x - 2.8, y - 0.3 + offset * 2.4); pdf.line(x + 2.8, y - 2.7 + offset * 2.4, x + 2.8, y - 0.3 + offset * 2.4); }
      }
      return;
    }
    pdf.roundedRect(x - 2.7, y - 3.5, 5.4, 7, 0.5, 0.5, 'S');
    pdf.line(x - 1.3, y - 1, x + 1.3, y - 1); pdf.line(x - 1.3, y + 1, x + 0.5, y + 1);
  }

  autoTable(pdf, {
    startY: tableY,
    margin: {
      top: 27,
      bottom: 28,
      left: 12,
      right: 12
    },
    head: [document.columns.map((column) => column.label)],
    body: document.rows.length ? document.rows.map((row) => row.map(money)) : [[{
      content: '조건에 맞는 세대가 없습니다.',
      colSpan: document.columns.length
    }]],
    foot: [document.total!.map(money)],
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    theme: 'plain',
    styles: {
      font: 'Pretendard',
      fontSize: 14.5,
      textColor: colors.text,
      cellPadding: 3,
      minCellHeight: 17,
      valign: 'middle',
      overflow: 'linebreak',
      lineColor: colors.muted,
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: colors.soft,
      fontStyle: 'bold',
      fontSize: 14.5,
      minCellHeight: 18
    },
    footStyles: {
      fillColor: tint(colors.primary),
      fontStyle: 'bold',
      fontSize: 15.5,
      minCellHeight: 18
    },
    columnStyles: Object.fromEntries(widths.map((width, index) => [index, {
      cellWidth: width,
      halign: document.columns[index].align ?? 'left'
    }])),
    didParseCell: (cell) => {
      if (cell.section === 'head') cell.cell.styles.halign = cell.column.index === 0 ? 'left' : 'center';
      // AutoTable의 합계 행에도 열 정렬을 명시해 Excel 미리보기와 실제 PDF·PNG의 금액 끝선을 맞춥니다.
      if (cell.section === 'foot') cell.cell.styles.halign = document.columns[cell.column.index].align ?? 'left';
      if (cell.section !== 'body') return;
      const value = String(cell.cell.raw);
      if (value === '정산 확인 필요') cell.cell.styles.textColor = colors.muted;
      if (cell.column.index === document.columns.length - 1 && statusColors[value]) cell.cell.text = [];
    },
    didDrawCell: (cell) => {
      if (cell.section !== 'body' || cell.column.index !== document.columns.length - 1) return;
      const label = String(cell.cell.raw);
      const color = statusColors[label];
      if (!color) return;
      pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(13.5);
      const width = Math.min(cell.cell.width - 6, Math.max(22, pdf.getTextWidth(label) + 10));
      const x = cell.cell.x + (cell.cell.width - width) / 2;
      const y = cell.cell.y + (cell.cell.height - 10) / 2;
      pdf.setFillColor(tint(color, 0.12)); pdf.roundedRect(x, y, width, 10, 5, 5, 'F');
      pdf.setTextColor(color); pdf.text(label, cell.cell.x + cell.cell.width / 2, y + 6.7, {
        align: 'center'
      });
    },
    willDrawPage: (page) => {
      if (page.pageNumber > 1) {
        pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(12); pdf.setTextColor(colors.text); pdf.text(document.title, 12, 13);
        pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(9); pdf.setTextColor(colors.muted);
        pdf.text(`${metadata('조회 월')} · ${metadata('조회 동')} · ${metadata('납부 상태')}`, 12, 20);
        return;
      }
      drawBuildings();
      pdf.setFillColor(colors.primary); pdf.roundedRect(12, 12, 11, 1.5, 0.75, 0.75, 'F');
      pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(23); pdf.setTextColor(colors.text);
      const titleWidth = pdf.getTextWidth(document.title);
      if (titleWidth > 200) pdf.setFontSize(23 * 200 / titleWidth);
      pdf.text(document.title, 12, 27);
      pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(11); pdf.setTextColor(colors.muted); pdf.text(description, 12, 38);
      // 조회 월은 건수·조회시각과 분리해 큰 글씨와 달력 표식으로 강조합니다.
      pdf.setFillColor(tint(colors.primary)); pdf.roundedRect(12, timestampY - 8, 64, 11, 2, 2, 'F');
      pdf.setDrawColor(colors.primary); pdf.setLineWidth(0.5); pdf.roundedRect(15, timestampY - 5, 5, 5, 0.5, 0.5, 'S');
      pdf.line(15, timestampY - 3.5, 20, timestampY - 3.5); pdf.line(16.2, timestampY - 6, 16.2, timestampY - 4.2); pdf.line(18.8, timestampY - 6, 18.8, timestampY - 4.2);
      pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(18); pdf.setTextColor(colors.primary); pdf.text(metadata('조회 월'), 23, timestampY);
      pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(colors.muted);
      pdf.text(`${metadata('조회 세대')} · ${metadata('기간 상태')} · 조회 시각 ${metadata('조회시각')}`, 82, timestampY - 0.5);
      pdf.setLineWidth(0.2); pdf.setDrawColor(colors.border); pdf.line(12, timestampY + 7, 285, timestampY + 7);
      const gap = 5;
      const width = (273 - gap * (metrics.length - 1)) / metrics.length;
      metrics.forEach((metric, index) => {
        const x = 12 + index * (width + gap);
        const color = colors[metric.tone];
        pdf.setDrawColor(tint(color, 0.25)); pdf.setFillColor(tint(color, 0.035));
        pdf.roundedRect(x, cardsY, width, 32, 2.5, 2.5, 'FD');
        drawMetricIcon(metric.tone, x + 13, cardsY + 16);
        pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(11); pdf.setTextColor(colors.muted); pdf.text(metric.label, x + 25, cardsY + 11);
        pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(20); pdf.setTextColor(colors.text);
        const amount = money(metric.value);
        const amountWidth = pdf.getTextWidth(amount);
        if (amountWidth > width - 29) pdf.setFontSize(20 * (width - 29) / amountWidth);
        pdf.text(amount, x + 25, cardsY + 24);
      });
    },
  });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(colors.border); pdf.line(12, 187, 285, 187);
    pdf.setFillColor(tint(colors.muted, 0.5)); pdf.circle(14, 197, 2.6, 'F');
    pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(9); pdf.setTextColor(colors.white); pdf.text('i', 14, 198.1, {
      align: 'center'
    });
    pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(colors.muted); pdf.text(document.note, 20, 198, {
      maxWidth: 246
    });
    pdf.text(`${page} / ${pages}`, 285, 202, {
      align: 'right'
    });
  }
  return pdf.output('blob');
}
