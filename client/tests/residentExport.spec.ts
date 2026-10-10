import {
  expect,
  test
} from '@playwright/test';
import {
  strFromU8,
  unzipSync
} from 'fflate';
import type { ResidentList } from '../src/screens/household/resident-list/api/residentApi';
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
    strings
  };
}

test('주민 XLSX는 현재 페이지와 관계없이 동·호수 순서의 전체 결과와 마스킹 연락처를 저장', async () => {
  const data = residentDirectory();
  const view = getResidentListView(data, EMPTY_RESIDENT_FILTERS, 2, 10);
  expect(view.rows).toHaveLength(2);
  const { sheet, cells, strings } = await readWorkbook(await createResidentWorkbook(data, view.filtered));

  expect((sheet.match(/<row /g) ?? []).length).toBe(13);
  expect(cells.A2).toBe('주민 02');
  expect(cells.C2).toBe('102동 201호');
  expect(cells.A13).toBe('주민 01');
  expect(cells.C13).toBe('103동 301호');
  expect(cells.B2).toBe('•••• 0037');
  expect(cells.D13).toBe('소유주');
  expect(cells.E13).toBe('대표');
  expect(cells.F13).toBe('가입 완료');
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
  // 예기치 않은 원문 필드가 있어도 명시한 목록 표시 값 이외의 데이터는 파일에 넣지 않습니다.
  const rows = view.filtered.map((row) => ({
    ...row,
    phone: '01012340037'
  }));
  const { sheet, cells, strings } = await readWorkbook(await createResidentWorkbook(data, rows));

  expect((sheet.match(/<row /g) ?? []).length).toBe(2);
  expect(cells.A2).toBe('=2+2');
  expect(cells.B2).toBe('•••• 0037');
  expect(sheet).not.toContain('<f');
  expect(strings).not.toContain('주민 02');
  expect(strings.join(' ')).not.toContain('01012340037');
});
