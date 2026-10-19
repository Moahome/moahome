import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import type { ResidentList } from '../src/screens/household/resident-list/api/residentApiTypes';
import type { ResidentExportRow } from '../src/screens/household/resident-list/api/residentExportApiTypes';
import { getResidentUnitLabel } from '../src/screens/household/resident-list/lib/residentLabel';
import { createResidentWorkbook } from '../src/screens/household/resident-list/model/residentExport';
import {
  EMPTY_RESIDENT_FILTERS,
  getResidentListView
} from '../src/screens/household/resident-list/model/residentList';

/** 현재 페이지보다 큰 명부와 숫자 순서가 다른 동을 구성해 실제 내려받는 범위를 확인합니다. */
function residentDirectory(): ResidentList {
  return {
    propertyId: '11111111-1111-4111-8111-111111111111',
    hasBuildings: true,
    buildings: [{
      id: '103',
      name: '103동'
    }, {
      id: '102',
      name: '102동'
    }],
    residents: Array.from({
      length: 12
    }, (_, index) => ({
      id: `resident-${index}`,
      name: `주민 ${String(index + 1).padStart(2, '0')}`,
      phoneLast4: '0037',
      unitId: `unit-${index}`,
      buildingId: index === 0 ? '103' : '102',
      unitNumber: index === 0 ? '301' : String(200 + index),
      relationType: index % 3 === 0 ? 'OWNER' : 'TENANT',
      representative: true,
      signupStatus: 'APPROVED'
    }))
  };
}

/** ZIP 내부의 실제 XLSX 시트와 문자열 셀을 읽어 화면 데이터가 파일에도 보존되는지 확인합니다. */
async function readWorkbook(blob: Blob) {
  expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const strings = [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  const cells = Object.fromEntries([...sheet.matchAll(/<c r="([A-Z]+\d+)"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/g)].map((match) => [match[1], strings[Number(match[2])]]));

  return {
    sheet,
    cells,
    strings,
    styles: strFromU8(files['xl/styles.xml'])
  };
}

/** 별도 내보내기 응답을 모의하되 목록의 필터·정렬 순서대로 허용된 세 항목만 구성합니다. */
function exportRows(data: ResidentList, rows: ResidentList['residents']): ResidentExportRow[] {
  const buildings = new Map(data.buildings.map((building) => [building.id, building.name]));

  return rows.map((row) => ({
    name: row.name,
    phone: '+821012340037',
    unitLabel: getResidentUnitLabel(row, buildings, data.hasBuildings)
  }));
}

test('주민 XLSX는 현재 페이지와 관계없이 전체 결과의 세 열과 전체 연락처만 저장', async () => {
  const data = residentDirectory();
  const view = getResidentListView(data, EMPTY_RESIDENT_FILTERS, 2, 10);
  expect(view.rows).toHaveLength(2);
  const { sheet, cells, strings, styles } = await readWorkbook(await createResidentWorkbook(exportRows(data, view.filtered)));

  expect((sheet.match(/<row /g) ?? []).length).toBe(22);
  expect(cells.A9).toBe('주민 02');
  expect(cells.C9).toBe('102동 201호');
  expect(cells.A20).toBe('주민 01');
  expect(cells.C20).toBe('103동 301호');
  expect(cells.B9).toBe('010-1234-0037');
  expect([cells.A8, cells.B8, cells.C8]).toEqual(['주민명', '연락처', '동·호수']);
  expect(Object.keys(cells).some((cell) => /^[D-Z]/.test(cell))).toBe(false);
  for (const excluded of ['주민 구분', '대표 주민', '가입 상태', '소유주', '대표', '가입 완료']) {
    expect(strings).not.toContain(excluded);
  }
  expect(sheet).toContain('ySplit="8"');
  expect(sheet).toContain('ht="56"');
  expect(sheet).toContain('ht="42"');
  for (const color of ['DBEAFE', 'FFFFFF', 'F8FAFC', 'EFF6FF']) expect(styles).toContain(color);
  expect(styles).toContain('맑은 고딕');
  expect(strings.join(' ')).not.toContain(data.propertyId);
  expect(strings.join(' ')).not.toContain(data.residents[0].id);
});

test('주민 XLSX는 필터로 제외한 주민을 내보내지 않고 수식 형태의 이름도 문자열로 저장', async () => {
  const data = residentDirectory();
  data.residents[0].name = '=2+2';
  const view = getResidentListView(data, {
    ...EMPTY_RESIDENT_FILTERS,
    buildingId: '103'
  }, 1, 10);
  // 구분·가입·대표 필드가 전달되어도 허용한 세 항목 이외의 값을 파일에 넣지 않습니다.
  const rows = exportRows(data, view.filtered).map((row) => ({
    ...row,
    relationType: 'OWNER',
    representative: true,
    signupStatus: 'APPROVED'
  }));
  const { sheet, cells, strings } = await readWorkbook(await createResidentWorkbook(rows));

  expect((sheet.match(/<row /g) ?? []).length).toBe(11);
  expect(cells.A9).toBe('=2+2');
  expect(cells.B9).toBe('010-1234-0037');
  expect(sheet).not.toContain('<f');
  expect(strings).not.toContain('주민 02');
  expect(strings.join(' ')).not.toContain('OWNER');
  expect(strings.join(' ')).not.toContain('APPROVED');
});

test('연락처 없는 주민은 빈 연락처 셀을 저장하고 국제 번호는 앞자리와 전체 번호를 보존', async () => {
  const { cells, strings } = await readWorkbook(await createResidentWorkbook([
    {
      name: '연락처 없음',
      phone: null,
      unitLabel: '—'
    },
    {
      name: '+문자열 주민',
      phone: '+441234567890',
      unitLabel: '001호'
    }
  ]));
  expect(cells.B9 ?? '').toBe('');
  expect(cells.B10).toBe('+441234567890');
  expect(cells.C10).toBe('001호');
  expect(strings.join(' ')).not.toContain('••••');
});

test('주민 등록 양식은 새 문서 색상을 사용해도 재업로드할 첫 행과 빈 입력 위치를 유지', async () => {
  const { readFile } = await import('node:fs/promises');
  const zip = unzipSync(await readFile('public/residentImportTemplate.xlsx'));
  const first = strFromU8(zip['xl/worksheets/sheet1.xml']);
  expect(first).toContain('r="A1"');expect(first).toContain('r="E1"');expect(first).toContain('ySplit="1"');
  expect(strFromU8(zip['xl/styles.xml'])).toContain('FFDBEAFE');
  for (const header of ['동', '호수', '이름', '주민 구분', '연락처']) expect(first).toContain(header);
  expect(first).not.toContain('<f>');
});
