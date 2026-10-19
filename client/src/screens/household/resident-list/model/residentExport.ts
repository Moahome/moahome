import { formatResidentPhone } from '@/entities/resident';
import { createReportWorkbook } from '@/shared/lib/excel-report';
import type { ResidentExportRow } from '../api/residentExportApiTypes';

export const RESIDENT_EXPORT_HEADERS = ['주민명', '연락처', '동·호수'] as const;

/** 모바일 페이지 이동에는 현재 결과의 ID만 일시 전달하며 전체 연락처는 캐시에 담지 않습니다. */
export function getResidentExportSelectionKey(userId: string, propertyId: string) {
  return ['resident-export-selection', userId, propertyId] as const;
}

/** 엑셀 파일에 허용된 세 항목을 구성하며 연락처는 전체 번호로 저장합니다. */
export function getResidentExportValues(row: ResidentExportRow) {
  return [row.name, row.phone ? formatResidentPhone(row.phone) : '', row.unitLabel];
}

/** 공통 보고서 서식에 허용된 세 항목만 내보내고 이름·연락처의 문자열 형식을 유지합니다. */
export async function createResidentWorkbook(rows: readonly ResidentExportRow[]): Promise<Blob> {
  return createReportWorkbook({
    title: '모아홈 주민 목록',
    description: '선택한 조회 결과의 주민 명부',
    sheet: '주민 목록',
    columns: RESIDENT_EXPORT_HEADERS.map((label, index) => ({
      label,
      width: [24, 28, 32][index],
      align: 'center'
    })),
    summary: [{
      label: '전체 주민 수',
      value: `${rows.length}명`
    }, {
      label: '연락처 등록',
      value: `${rows.filter((row) => row.phone).length}명`
    }, {
      label: '조회 범위',
      value: '선택한 조회 결과 전체'
    }],
    rows: rows.map(getResidentExportValues),
    note: '※ 연락처는 전체 번호로 표시됩니다. 현재 조회 결과의 주민명·연락처·동·호수만 포함합니다.'
  });
}
