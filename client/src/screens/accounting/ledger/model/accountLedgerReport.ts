import type { ReportDefinition } from '@/shared/lib/excel-report';
import { formatInteger } from '@/shared/lib/format';
import { formatMonthRange } from '@/shared/lib/month-range';
import { createReportPdfDocument } from '@/shared/lib/pdf-report';
import type { AccountLedgerWorkspace } from '../api/accountLedgerApiTypes';

export const LEDGER_NOTICE = '101 통장은 기초잔액에 입금을 더하고 출금을 뺀 잔액을 표시합니다. 전체 계좌는 101 합산 잔액이며 계좌를 선택하면 해당 계좌만 계산합니다. 다른 과목의 기간 누계는 조회 기간 반영액입니다.';

/** 자산·부채 조회는 손익 대신 해당 과목의 증가·감소를 같은 원본 금액으로 표시합니다. */
export function getLedgerSummary(data: AccountLedgerWorkspace): { label: string; value: bigint }[] {
  const account = data.accounts.find((row) => row.id === data.accountId);
  if (account && ['asset', 'liability'].includes(account.group)) {
    let increase = BigInt(0);
    let decrease = BigInt(0);
    for (const { entry } of data.rows) {
      const amount = BigInt(entry.amount);
      if (amount > 0) increase += amount;
      else decrease -= amount;
    }
    return [{
      label: '증가 반영액',
      value: increase
    }, {
      label: '감소 반영액',
      value: decrease
    }];
  }
  return [{
    label: '수익 반영액',
    value: BigInt(data.revenue)
  }, {
    label: '비용 반영액',
    value: BigInt(data.expense)
  }];
}

/** 부과 수익에는 부과일, 자금 거래에는 거래일을 표시하고 혼합 조회는 공통 일자로 구분합니다. */
export function getLedgerDateLabel(data: AccountLedgerWorkspace): string {
  const selected = data.accounts.find((account) => account.id === data.accountId);
  if (selected?.systemKey === 'MANAGEMENT_REVENUE') return '부과일';
  if (selected && ['RECEIVABLE', 'ADVANCE_RECEIPT', 'PAYABLE'].includes(selected.systemKey ?? '')) return '반영일';
  if (selected) return '거래일';
  return '일자';
}

/** 선택 과목은 코드순 첫 과목과 나머지 개수로 요약해 조회 범위가 잘리지 않게 표시합니다. */
export function getLedgerAccountLabel(data: AccountLedgerWorkspace): string {
  const selected = data.accounts.filter((account) => data.accountIds.includes(account.id))
    .sort((left, right) => left.code.localeCompare(right.code));
  if (!selected.length) return '전체 계정과목';
  const first = `${selected[0].code} ${selected[0].name}`;
  return selected.length === 1 ? first : `${first} 외 ${selected.length - 1}개`;
}

/** 페이지·표시 개수를 제외한 적용 조건 전체를 고정해 화면과 세 가지 출력 형식이 같은 자료를 사용합니다. */
export function getLedgerDocuments(data: AccountLedgerWorkspace): ReportDefinition[] {
  const building = data.buildings.find((row) => row.id === data.buildingId);
  const bankName = data.bankBalances.find((bank) => bank.accountId === data.bankAccountId)?.name;
  const description = `${data.propertyName} · ${formatMonthRange(data.range)} · ${building?.name ?? '전체 동'} · ${getLedgerAccountLabel(data)}${bankName ? ` · ${bankName}` : ''}`;
  const note = `${LEDGER_NOTICE}${data.issues.length ? ' 확인 필요 자료는 합계에 포함하지 않았습니다. 확인 목록은 선택 기간·동의 전체 과목 기준입니다.' : ''}`;
  return [{
    title: '계정별 원장',
    sheet: '계정별 원장',
    description,
    note,
    columns: [
      {
        label: '계정과목',
        width: 24
      },
      {
        label: '적요',
        width: 30
      },
      {
        label: '동',
        width: 16
      },
      {
        label: '귀속 월',
        width: 14
      },
      {
        label: getLedgerDateLabel(data),
        width: 16
      },
      {
        label: '반영액',
        width: 22,
        align: 'right'
      },
      {
        label: data.bankBalances.length ? '장부 잔액 / 기간 누계' : '과목별 기간 누계',
        width: 24,
        align: 'right'
      },
    ],
    rows: data.rows.map(({ entry, cumulativeAmount, cashBalance }) => {
      const account = data.accounts.find((row) => row.id === entry.accountId)!;
      return [`${account.code} ${account.name}`, entry.source.name,
        data.buildings.find((row) => row.id === entry.buildingId)?.name ?? '전체', entry.month, entry.source.date ?? '—',
        BigInt(entry.amount), cashBalance ? (cashBalance.ledgerBalance === null ? '확인 필요' : BigInt(cashBalance.ledgerBalance)) : BigInt(cumulativeAmount),
      ];
    }),
    highlightNegative: true,
    summary: [
      ...getLedgerSummary(data),
      {
        label: '반영 내역',
        value: `${data.rows.length}건`
      }
    ]
  }, ...(data.issues.length ? [{
    title: '회계 확인 필요',
    sheet: '회계 확인 필요',
    description,
    note: '선택 기간·동의 전체 과목 기준입니다. 원천 금액은 반영액·누계에 포함하지 않습니다.',
    columns: [{
      label: '원본',
      width: 30
    }, {
      label: '확인 사유',
      width: 55
    }, {
      label: '원천 금액',
      width: 24,
      align: 'right' as const
    }],
    rows: data.issues.map((issue) => [issue.sourceName, issue.label, BigInt(issue.amount)]),
    summary: [],
    highlightNegative: true
  }] : [])];
}

/** 중앙 요약 카드·조회 범위·단정한 거래 표를 같은 원천의 PDF·PNG에 적용합니다. */
export async function createLedgerPdf(data: AccountLedgerWorkspace): Promise<Blob> {
  const [{ autoTable }, pdf] = await Promise.all([import('jspdf-autotable'), createReportPdfDocument()]);
  const documents = getLedgerDocuments(data);
  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue(name).trim();
  const palette = {
    text: color('--foreground'),
    muted: color('--sub-text'),
    primary: color('--primary'),
    teal: color('--secondary-teal'),
    border: color('--border'),
    card: color('--card'),
    soft: color('--background'),
    blue: color('--button-primary-background'),
    danger: color('--danger')
  };
  const building = data.buildings.find((row) => row.id === data.buildingId);
  pdf.setProperties({
    title: `${data.propertyName} 계정별 원장`,
    creator: '모아홈'
  });

  /** 긴 관리대상명·계정명도 지정한 문서 영역을 넘지 않게 줄이며 금액은 아래에서 별도로 보존합니다. */
  function textWithin(text: string, width: number): string {
    if (pdf.getTextWidth(text) <= width) return text;
    let result = text;
    while (result.length && pdf.getTextWidth(`${result}…`) > width) result = result.slice(0, -1);
    return `${result}…`;
  }

  /** 각 페이지에 같은 범위·요약·안내를 반복해 여러 장을 따로 보아도 조회 기준을 확인할 수 있게 합니다. */
  function frame(report: ReportDefinition) {
    pdf.setFillColor(palette.card);
    pdf.rect(0, 0, 210, 297, 'F');
    pdf.setFillColor(palette.primary);
    pdf.rect(0, 0, 210, 2, 'F');
    pdf.setFont('Pretendard', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(palette.primary);
    pdf.text('MOAHOME', 14, 14);
    pdf.setTextColor(palette.muted);
    pdf.setFontSize(7);
    pdf.text('ACCOUNT LEDGER', 196, 14, {
      align: 'right'
    });
    pdf.setFontSize(20);
    pdf.setTextColor(palette.text);
    pdf.text(report.title, 14, 26);
    pdf.setFont('Pretendard', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(palette.muted);
    pdf.text(textWithin(`${data.propertyName}의 계정별 반영 내역을 확인하는 보고서`, 182), 14, 33);

    pdf.setFillColor(palette.soft);
    pdf.setDrawColor(palette.border);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(14, 40, 182, 20, 3, 3, 'FD');
    const scope = [
      {
        x: 20,
        width: 60,
        label: '조회 기간',
        value: `${data.range.startMonth} - ${data.range.endMonth}`
      },
      {
        x: 87,
        width: 43,
        label: '조회 범위',
        value: `${building?.name ?? '전체 동'}${data.bankAccountId ? ` · ${data.bankBalances.find((bank) => bank.accountId === data.bankAccountId)?.name ?? ''}` : ''}`
      },
      {
        x: 139,
        width: 51,
        label: '계정과목',
        value: getLedgerAccountLabel(data)
      }
    ];
    for (const x of [81, 133]) pdf.line(x, 44, x, 56);
    for (const item of scope) {
      pdf.setFont('Pretendard', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(palette.muted);
      pdf.text(item.label, item.x, 47);
      pdf.setFont('Pretendard', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(palette.text);
      pdf.text(textWithin(item.value, item.width), item.x, 54);
    }

    if (report.summary.length) {
      pdf.setFont('Pretendard', 'bold');
      pdf.setFontSize(10);
      pdf.text('조회 요약', 14, 71);
      pdf.setFont('Pretendard', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(palette.muted);
      pdf.text('원 단위 기준', 196, 71, {
        align: 'right'
      });
      report.summary.forEach((item, index) => {
        const x = 14 + index * 62;
        const accent = [palette.muted, palette.primary, palette.teal][index];
        pdf.setFillColor(palette.card);
        pdf.setDrawColor(palette.border);
        pdf.roundedRect(x, 77, 58, 32, 3, 3, 'FD');
        pdf.setDrawColor(accent);
        pdf.setLineWidth(0.8);
        pdf.line(x + 5, 84, x + 13, 84);
        pdf.setLineWidth(0.2);
        pdf.setFont('Pretendard', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(palette.muted);
        pdf.text(item.label, x + 5, 91);
        const value = typeof item.value === 'bigint' ? formatInteger(item.value) : String(data.rows.length);
        const unit = typeof item.value === 'bigint' ? '원' : '건';
        pdf.setFont('Pretendard', 'bold');
        let size = 17;
        pdf.setFontSize(size);
        // 큰 원화 합계도 소수점·단위 축약이나 말줄임 없이 정확한 숫자를 모두 표시합니다.
        while (size > 8 && pdf.getTextWidth(value) > 43) pdf.setFontSize(--size);
        pdf.setTextColor(index === 0 ? palette.text : accent);
        pdf.text(value, x + 5, 102);
        const unitX = x + 6 + pdf.getTextWidth(value);
        pdf.setFont('Pretendard', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(palette.muted);
        pdf.text(unit, Math.min(x + 52, unitX), 102);
      });
    }
    const tableY = report.summary.length ? 121 : 72;
    pdf.setFont('Pretendard', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(palette.text);
    pdf.text(report.summary.length ? '거래 내역' : report.title, 14, tableY);
    pdf.setFont('Pretendard', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(palette.muted);
    pdf.text(`총 ${report.rows.length}건`, 196, tableY, {
      align: 'right'
    });

    pdf.setFillColor(palette.soft);
    pdf.setDrawColor(palette.border);
    pdf.roundedRect(14, 260, 182, 21, 3, 3, 'FD');
    pdf.setDrawColor(palette.primary);
    pdf.setLineWidth(0.8);
    pdf.line(19, 265, 19, 271);
    pdf.setLineWidth(0.2);
    pdf.setFont('Pretendard', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(palette.text);
    pdf.text('집계 기준 안내', 23, 267);
    pdf.setFont('Pretendard', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(palette.muted);
    pdf.text(pdf.splitTextToSize(report.note, 167), 23, 273);
  }

  for (const [index, report] of documents.entries()) {
    if (index) pdf.addPage();
    const top = report.summary.length ? 127 : 78;
    autoTable(pdf, {
      startY: top,
      margin: {
        left: 14,
        right: 14,
        top,
        bottom: 45
      },
      head: [report.columns.map((column) => column.label)],
      body: report.rows.map((row) => row.map((cell) => typeof cell === 'bigint' ? formatInteger(cell) : String(cell ?? ''))),
      styles: {
        font: 'Pretendard',
        fontSize: 8.5,
        cellPadding: 3,
        textColor: palette.text,
        fillColor: palette.card,
        lineColor: palette.border,
        lineWidth: {
          bottom: 0.15
        },
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: palette.blue,
        textColor: palette.muted,
        fontStyle: 'bold',
        fontSize: 8
      },
      alternateRowStyles: {
        fillColor: palette.soft
      },
      columnStyles: index === 0 ? {
        0: {
          cellWidth: 31
        },
        1: {
          cellWidth: 34,
          overflow: 'ellipsize'
        },
        2: {
          cellWidth: 14
        },
        3: {
          cellWidth: 18
        },
        4: {
          cellWidth: 24
        },
        5: {
          cellWidth: 27
        },
        6: {
          cellWidth: 34
        }
      } : {},
      willDrawPage() { frame(report); },
      didParseCell(cell) {
        if (report.columns[cell.column.index].align === 'right') cell.cell.styles.halign = 'right';
        const value = report.rows[cell.row.index]?.[cell.column.index];
        if (cell.section !== 'body' || typeof value !== 'bigint') return;
        if (value < BigInt(0)) cell.cell.styles.textColor = palette.danger;
        else if (index === 0 && cell.column.index === report.columns.length - 1) cell.cell.styles.textColor = palette.primary;
      }
    });
  }
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(palette.border);
    pdf.line(14, 286, 196, 286);
    pdf.setFont('Pretendard', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(palette.muted);
    pdf.text(textWithin(`MOAHOME · ${data.propertyName}`, 155), 14, 291);
    pdf.text(`${String(page).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 196, 291, {
      align: 'right'
    });
  }
  return pdf.output('blob');
}
