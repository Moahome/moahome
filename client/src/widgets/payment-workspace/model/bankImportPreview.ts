import {
  strFromU8,
  unzipSync
} from 'fflate';
import { isPreviewDate } from './paymentPreview';
import type {
  PreviewLedger,
  PreviewPayment
} from './paymentPreviewTypes';

/** 따옴표·쉼표·줄바꿈을 보존하는 CSV 파서입니다. 업로드 값은 코드나 수식으로 실행하지 않습니다. */
export function parseBankPreviewCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index++; }
      else if (!cell || quoted) quoted = !quoted;
      else throw new Error('CSV의 따옴표 형식을 확인해주세요.');
    } else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('CSV의 따옴표가 닫히지 않았어요.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);

  return rows;
}

function parsePreviewXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('엑셀 내부 데이터를 읽을 수 없어요.');

  return document;
}

/** 첫 워크시트의 문자열·숫자·인라인 셀만 읽고 수식은 거래 원본으로 가져오지 않습니다. */
async function readPreviewXlsx(file: File): Promise<string[][]> {
  let size = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      if (!/^xl\/(worksheets\/sheet[0-9]+\.xml|sharedStrings\.xml)$/.test(entry.name)) return false;
      size += entry.originalSize;
      if (size > 20 * 1024 * 1024) throw new Error('엑셀 내부 데이터는 20MB 이하만 지원합니다.');

      return true;
    }
  });
  const sheetName = Object.keys(files).filter((name) => name.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new Error('엑셀 워크시트를 찾을 수 없어요.');
  const strings = files['xl/sharedStrings.xml'] ? Array.from(parsePreviewXml(strFromU8(files['xl/sharedStrings.xml'])).querySelectorAll('si'))
    .map((item) => Array.from(item.querySelectorAll('t')).map((text) => text.textContent ?? '').join('')) : [];

  return Array.from(parsePreviewXml(strFromU8(files[sheetName])).querySelectorAll('row')).map((row) => {
    const result: string[] = [];
    for (const cell of row.querySelectorAll('c')) {
      if (cell.querySelector('f')) throw new Error('수식 셀은 지원하지 않습니다. 값으로 저장한 거래내역을 선택해주세요.');
      const column = (cell.getAttribute('r') ?? '').match(/^[A-Z]+/)?.[0];
      if (!column) continue;
      const index = Array.from(column).reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
      const raw = cell.querySelector('v')?.textContent ?? '';
      result[index] = cell.getAttribute('t') === 's' ? strings[Number(raw)] ?? '' : cell.getAttribute('t') === 'inlineStr' ? cell.querySelector('is')?.textContent ?? '' : raw;
    }

    return result;
  });
}

/** 은행별 자동 연결을 가장하지 않고 헤더를 인식한 거래만 검토 목록으로 변환합니다. */
export async function readBankPreviewFile(file: File, ledger: PreviewLedger): Promise<PreviewPayment[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 거래내역 파일을 선택해주세요.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension !== 'csv' && extension !== 'xlsx') throw new Error('.xlsx 또는 .csv 파일을 선택해주세요.');
  const rows = extension === 'csv' ? parseBankPreviewCsv(await file.text()) : await readPreviewXlsx(file);
  if (rows.length > 5001) throw new Error('한 번에 5,000행까지 가져올 수 있어요.');
  const aliases = {
    date: ['거래일시', '거래일자', '거래일', '입금일', '날짜'],
    amount: ['입금액', '입금금액', '받은금액', '입금'],
    payer: ['입금자명', '입금자', '송금인', '거래내용', '적요'],
    memo: ['적요', '메모', '거래내용'],
    reference: ['거래번호', '거래고유번호'],
    balance: ['거래후잔액', '잔액']
  };
  const headerIndex = rows.findIndex((row) => row.some((cell) => aliases.date.includes(cell.trim()))
    && row.some((cell) => aliases.amount.includes(cell.trim())) && row.some((cell) => aliases.payer.includes(cell.trim())));
  if (headerIndex < 0) throw new Error('입금일·입금액·입금자명 컬럼을 찾지 못했어요.');
  const headers = rows[headerIndex].map((value) => value.trim());
  const index = (key: keyof typeof aliases) => headers.findIndex((header) => aliases[key].includes(header));
  const result: PreviewPayment[] = [];
  for (const [offset, row] of rows.slice(headerIndex + 1).entries()) {
    const amount = (row[index('amount')] ?? '').replaceAll(',', '').trim();
    if (!amount || amount === '0') continue;
    if (!/^[0-9]+$/.test(amount) || BigInt(amount) > BigInt('999999999999999')) throw new Error(`${headerIndex + offset + 2}행의 입금액을 확인해주세요.`);
    const rawDate = (row[index('date')] ?? '').trim();
    const match = rawDate.match(/^([1-9][0-9]{3})[./-]([0-9]{1,2})[./-]([0-9]{1,2})/);
    const date = match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
      : /^[0-9]{5}(\.[0-9]+)?$/.test(rawDate) ? new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(rawDate)) * 86400000).toISOString().slice(0, 10) : '';
    const payer = (row[index('payer')] ?? '').trim();
    const memo = (row[index('memo')] ?? '').trim();
    if (!isPreviewDate(date) || !payer) throw new Error(`${headerIndex + offset + 2}행의 입금일·입금자명을 확인해주세요.`);
    const normalizedAmount = BigInt(amount).toString();
    const unit = ledger.units.find((item) => `${payer} ${memo}`.includes(`${item.id}호`));
    const accountId = ledger.accounts[0]?.id ?? '';
    const key = [accountId, rawDate, normalizedAmount, payer, memo, row[index('reference')] ?? '', row[index('balance')] ?? ''].join('|');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))))
      .map((byte) => byte.toString(16).padStart(2, '0')).join('');
    result.push({
      id: `import-${hash}`,
      source: 'BANK_IMPORT',
      status: 'PENDING',
      accountId,
      date,
      payer,
      amount: normalizedAmount,
      unitId: unit?.id ?? '',
      memo,
      reason: unit ? '입금자명·적요에 호수 포함' : '세대 직접 확인 필요',
      allocations: []
    });
  }
  if (!result.length) throw new Error('가져올 입금 거래가 없습니다.');

  return result;
}
