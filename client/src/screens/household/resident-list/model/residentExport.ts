import type { SheetData } from 'write-excel-file/universal';
import {
  RESIDENT_RELATION_OPTIONS,
  RESIDENT_SIGNUP_OPTIONS
} from '@/entities/resident';
import type {
  ResidentList,
  ResidentRow
} from '../api/residentApi';
import { getResidentUnitLabel } from './residentList';

/** 목록과 동일한 표시 값으로 XLSX를 만들며 필터·정렬된 전체 결과는 호출 화면에서 전달합니다. */
export async function createResidentWorkbook(data: ResidentList, rows: readonly ResidentRow[]): Promise<Blob> {
  const buildings = new Map(data.buildings.map((building) => [building.id, building.name]));
  const headers = ['주민명', '연락처', '동·호수', '주민 구분', '대표 주민', '가입 상태'];
  const sheet: SheetData = [headers.map((value) => ({
    value,
    type: String,
    fontWeight: 'bold'
  })), ...rows.map((row) => [
    row.name,
    row.phoneLast4 ? `•••• ${row.phoneLast4}` : '—',
    getResidentUnitLabel(row, buildings, data.hasBuildings),
    RESIDENT_RELATION_OPTIONS.find((option) => option.value === row.relationType)?.label ?? '—',
    row.representative ? '대표' : '—',
    RESIDENT_SIGNUP_OPTIONS.find((option) => option.value === row.signupStatus)?.label ?? '—'
  ].map((value) => ({
    // 전체 번호를 추가 조회하지 않으며 =, + 등으로 시작하는 이름도 수식 대신 문자열로 저장합니다.
    value,
    type: String,
    format: '@'
  })))];
  // 다운로드 시에만 라이브러리를 불러와 목록의 초기 로딩에 포함하지 않습니다.
  const { default: writeExcelFile } = await import('write-excel-file/universal');

  return writeExcelFile(sheet, {
    sheet: '주민 목록',
    stickyRowsCount: 1,
    columns: [18, 18, 24, 14, 14, 16].map((width) => ({
      width
    }))
  }).toBlob();
}
