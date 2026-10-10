import type { SheetData } from 'write-excel-file/universal';
import { formatResidentPhone } from '@/entities/resident';
import type { ResidentExportRow } from '../api/residentExportApi';

export const RESIDENT_EXPORT_HEADERS = ['주민명', '연락처', '동·호수'] as const;

/** 모바일 페이지 이동에는 현재 결과의 ID만 일시 전달하며 전체 연락처는 캐시에 담지 않습니다. */
export function getResidentExportSelectionKey(userId: string, propertyId: string) {
  return ['resident-export-selection', userId, propertyId] as const;
}

/** 엑셀 파일에 허용된 세 항목을 구성하며 연락처는 전체 번호로 저장합니다. */
export function getResidentExportValues(row: ResidentExportRow) {
  return [row.name, row.phone ? formatResidentPhone(row.phone) : '', row.unitLabel];
}

/** 첨부 시트의 회색 헤더·교차 행·테두리·행 높이를 적용하고 세 항목만 문자열 셀로 저장합니다. */
export async function createResidentWorkbook(rows: readonly ResidentExportRow[]): Promise<Blob> {
  // 이 중립 색상은 사용자가 전달한 주민목록.xlsx의 문서 스타일이며 웹 UI 색상 토큰과 구분합니다.
  const baseStyle = {
    fontFamily: '맑은 고딕',
    align: 'center' as const,
    alignVertical: 'center' as const,
    borderStyle: 'thin' as const,
    borderColor: '#DFE3E8'
  };
  const sheet: SheetData = [RESIDENT_EXPORT_HEADERS.map((value) => ({
    ...baseStyle,
    value,
    type: String,
    fontSize: 13,
    fontWeight: 'bold',
    textColor: '#27313C',
    backgroundColor: '#EDEFF1',
    bottomBorderColor: '#9CA3AF',
    height: 43
  })), ...rows.map((row, index) => getResidentExportValues(row).map((value) => ({
    ...baseStyle,
    // 이름이 =, + 등으로 시작해도 수식으로 해석하지 않고 연락처의 앞자리 0도 보존합니다.
    value,
    type: String,
    format: '@',
    fontSize: 12,
    textColor: '#334155',
    backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F7F8F9',
    height: 32
  })))];
  // 다운로드 시에만 라이브러리를 불러와 목록의 초기 로딩에 포함하지 않습니다.
  const { default: writeExcelFile } = await import('write-excel-file/universal');

  return writeExcelFile(sheet, {
    sheet: '주민 목록',
    stickyRowsCount: 1,
    columns: [16, 20, 23].map((width) => ({
      width
    }))
  }).toBlob();
}
