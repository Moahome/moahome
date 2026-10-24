import {
  createReportPdfDocument,
  getReportPeriodLabel
} from '@/shared/lib/pdf-report';
import { formatInteger } from '@/shared/lib/format';
import type { BalanceReportSnapshot } from './balanceReportTypes';
import {
  getBalanceReportDocument,
  getBalanceReportSections
} from './balanceReport';

/** 첨부 A4 세로 시안처럼 동별 페이지·기초/입금/지출/월말 잔액 요약·거래 명세를 같은 선택 범위로 출력합니다. */
export async function createBalanceReportPdf(data: BalanceReportSnapshot, buildingId = '', accountId = ''): Promise<Blob> {
  const [{ autoTable }, pdf] = await Promise.all([import('jspdf-autotable'), createReportPdfDocument()]);
  const document = getBalanceReportDocument(data, buildingId, accountId);
  // 소계·전체 합계는 Excel과 같은 문서 정의에서 읽고 빈 동 안내는 거래 건수에 포함하지 않습니다.
  const sections = getBalanceReportSections(document);
  if (!sections.length) sections.push({
    label: '전체 동',
    start: null,
    end: null,
    rows: [],
    income: BigInt(0),
    expense: BigInt(0)
  });
  pdf.setProperties({
    title: `모아홈 동별 입출금 ${data.month}`,
    subject: '동별 입금·지출 내역',
    creator: '모아홈'
  });
  // 제공된 PDF의 흰 바탕·파랑 입금·빨강 지출·옅은 교차 행을 출력 문서 팔레트로 사용합니다.
  const colors = {
    text: '#0F172A',
    muted: '#64748B',
    primary: '#2563EB',
    danger: '#EF4444',
    border: '#E2E8F0',
    white: '#FFFFFF',
    alternate: '#F8FAFC',
    blue: '#EFF6FF',
    red: '#FEF2F2',
    amber: '#FFFBEB'
  };
  const money = (value: bigint | null) => value === null ? '설정 필요' : `${formatInteger(value)}원`;
  const generatedAt = String(document.summary.find((row) => row.label === '조회시각')?.value ?? '');
  const selectedAccount = String(document.summary.find((row) => row.label === '조회 계좌')?.value ?? '전체 계좌');
  const totalCount = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const pageLabels = new Map<number, string>();

  for (const [index, section] of sections.entries()) {
    if (index) pdf.addPage();
    const names = [...new Set(section.rows.map((row) => String(row[2])))];
    let accountLabel = selectedAccount;
    if (!accountId && names.length === 1) accountLabel = names[0];
    if (!accountId && names.length > 1) accountLabel = `전체 계좌 · ${names.length}개 계좌`;
    const foot = [[{
      content: `${section.label} 소계`,
      colSpan: 3
    }, money(section.income), money(section.expense), money(section.end)]];
    if (index === sections.length - 1 && sections.length > 1 && document.total) {
      foot.push([{
        content: '전체 합계',
        colSpan: 3
      }, money(BigInt(document.total[5])), money(BigInt(document.total[6])), typeof document.total[7] === 'bigint' ? money(document.total[7]) : '설정 필요']);
    }
    autoTable(pdf, {
      startY: 97,
      margin: {
        top: 20,
        bottom: 30,
        left: 12,
        right: 12
      },
      head: [['거래일시', '구분', '입금자 · 지출명', '입금액', '지출액', '잔액']],
      body: section.rows.length ? section.rows.map((row) => [String(row[1]), String(row[3]), String(row[4]), money(BigInt(row[5])), money(BigInt(row[6])), typeof row[7] === 'bigint' ? money(row[7]) : '설정 필요'])
        : [[{
          content: '조회 월의 입금·지출 내역이 없습니다.',
          colSpan: 6
        }]],
      foot,
      showFoot: 'lastPage',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      theme: 'plain',
      styles: {
        font: 'Pretendard',
        fontSize: 8,
        textColor: colors.text,
        cellPadding: {
          top: 2.1,
          bottom: 2.1,
          left: 2.8,
          right: 2.8
        },
        minCellHeight: 7.7,
        valign: 'middle',
        lineColor: colors.border,
        lineWidth: {
          bottom: 0.1
        },
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: colors.alternate,
        textColor: colors.text,
        fontStyle: 'bold',
        minCellHeight: 9.4
      },
      footStyles: {
        fillColor: colors.blue,
        textColor: colors.text,
        fontStyle: 'bold',
        minCellHeight: 9
      },
      alternateRowStyles: {
        fillColor: colors.alternate
      },
      columnStyles: {
        0: {
          cellWidth: 35
        },
        1: {
          cellWidth: 13,
          halign: 'center'
        },
        2: {
          cellWidth: 51
        },
        3: {
          cellWidth: 29,
          halign: 'right'
        },
        4: {
          cellWidth: 29,
          halign: 'right'
        },
        5: {
          cellWidth: 29,
          halign: 'right'
        }
      },
      didParseCell: (cell) => {
        if (cell.section === 'body' && cell.column.index >= 3) {
          cell.cell.styles.textColor = cell.cell.raw === '0원' ? colors.muted : colors.text;
          cell.cell.styles.fontStyle = cell.cell.raw === '0원' ? 'normal' : 'bold';
        }
        if (cell.section === 'body' && cell.column.index === 1 && section.rows.length) cell.cell.text = [];
        if (cell.section === 'foot' && cell.column.index >= 3) cell.cell.styles.halign = 'right';
        if (cell.section === 'foot' && cell.row.index > 0 && cell.column.index >= 3) cell.cell.styles.textColor = colors.primary;
      },
      didDrawCell: (cell) => {
        if (cell.section !== 'body' || cell.column.index !== 1 || !section.rows.length) return;
        const label = String(cell.cell.raw);
        const outgoing = label === '지출';
        pdf.setFillColor(outgoing ? colors.red : colors.blue);
        pdf.roundedRect(cell.cell.x + 1, cell.cell.y + (cell.cell.height - 4.8) / 2, 11, 4.8, 2.4, 2.4, 'F');
        pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(8);
        pdf.setTextColor(outgoing ? colors.danger : colors.primary);
        pdf.text(label, cell.cell.x + 6.5, cell.cell.y + cell.cell.height / 2 + 1, {
          align: 'center'
        });
      },
      willDrawPage: (tablePage) => {
        const page = pdf.getCurrentPageInfo().pageNumber;
        pageLabels.set(page, section.label);
        // 같은 동의 이어지는 페이지에는 큰 제목·조회 정보·요약 카드를 반복하지 않습니다.
        if (tablePage.pageNumber > 1) return;
        pdf.setFillColor(colors.primary); pdf.roundedRect(12, 8.5, 1, 5.5, 0.5, 0.5, 'F');
        pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(8); pdf.setTextColor(colors.primary);
        pdf.text('MOAHOME  /  MONTHLY REPORT', 15.5, 12.8);
        pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(17.5); pdf.setTextColor(colors.text);
        pdf.text('모아홈 동별 입출금 내역', 12, 25.5);
        pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(colors.muted);
        pdf.text(`${data.month.slice(0, 4)}년 ${Number(data.month.slice(5))}월  |  지출액은 각 동의 실제 부담액 기준입니다.`, 12, 31.5);
        pdf.setFillColor(colors.alternate); pdf.setDrawColor(colors.border); pdf.setLineWidth(0.2);
        pdf.roundedRect(12, 36.5, 186, 16, 3, 3, 'FD');
        pdf.setFontSize(8); pdf.text('조회 대상', 16.5, 42); pdf.text('통장', 52, 42);
        pdf.line(47.5, 40, 47.5, 48.5);
        pdf.setFont('Pretendard', 'bold'); pdf.setTextColor(colors.text); pdf.setFontSize(11);
        pdf.text(section.label, 16.5, 48);
        pdf.setFontSize(8.5);
        pdf.text(accountLabel, 52, 48, {
          maxWidth: 102
        });
        pdf.setTextColor(colors.primary); pdf.setFontSize(8);
        pdf.text(`${section.rows.length}건 / 전체 ${totalCount}건`, 194, 48, {
          align: 'right'
        });
        pdf.setFont('Pretendard', 'normal'); pdf.setTextColor(colors.muted); pdf.setFontSize(8);
        pdf.text(`조회 시각: ${generatedAt}`, 12, 59);
        pdf.setFillColor(colors.amber); pdf.roundedRect(165, 54.5, 33, 6, 3, 3, 'F');
        pdf.setTextColor('#A16207'); pdf.setFont('Pretendard', 'bold'); pdf.text(getReportPeriodLabel(data), 194, 58.5, {
          align: 'right'
        });
        const cards = [{
          label: '기초 잔액',
          value: section.start,
          color: colors.text
        }, {
          label: '입금 합계',
          value: section.income,
          color: colors.primary
        }, {
          label: '지출 합계',
          value: section.expense,
          color: colors.danger
        }, {
          label: '월말 잔액',
          value: section.end,
          color: colors.text
        }];
        cards.forEach((card, cardIndex) => {
          const x = 12 + cardIndex * 47.25;
          pdf.setFillColor(colors.white); pdf.setDrawColor(colors.border); pdf.roundedRect(x, 66, 44.25, 20, 2.5, 2.5, 'FD');
          pdf.setFillColor(card.color); pdf.roundedRect(x + 3.5, 71, 1, 10.5, 0.4, 0.4, 'F');
          pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(8); pdf.setTextColor(colors.muted); pdf.text(card.label, x + 7.5, 73.5);
          pdf.setFont('Pretendard', 'bold'); pdf.setTextColor(card.color);
          const value = money(card.value);
          pdf.setFontSize(11.5);
          if (pdf.getTextWidth(value) > 34) pdf.setFontSize(11.5 * 34 / pdf.getTextWidth(value));
          pdf.text(value, x + 7.5, 81.5);
        });
        pdf.setFont('Pretendard', 'bold'); pdf.setFontSize(11); pdf.setTextColor(colors.text); pdf.text(`${section.label} 거래 명세`, 12, 93);
        pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(8); pdf.setTextColor(colors.muted); pdf.text('거래일 기준 오름차순 · 동별 누적 잔액', 198, 93, {
          align: 'right'
        });
      }
    });
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont('Pretendard', 'normal'); pdf.setFontSize(9); pdf.setTextColor(colors.text);
    pdf.text(`${pageLabels.get(page)} · ${page} / ${pages}`, 198, 12.8, {
      align: 'right'
    });
    pdf.setDrawColor(colors.border); pdf.setLineWidth(0.2); pdf.line(12, 279, 198, 279);
    pdf.setFontSize(8); pdf.setTextColor(colors.muted);
    pdf.text('기초 잔액 + 입금액 - 지출액 = 월말 잔액 · 동별 자금 기준', 12, 285);
    pdf.text(`${data.month.replace('-', '.')}   |   ${page} / ${pages}`, 198, 285, {
      align: 'right'
    });
  }
  return pdf.output('blob');
}
