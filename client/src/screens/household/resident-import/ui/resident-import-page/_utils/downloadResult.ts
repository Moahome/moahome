import { RESIDENT_RELATION_OPTIONS } from '@/entities/resident';
import type { ImportRow } from '../../../api/residentImportApi';

/** CSV 수식 실행을 막고 마스킹한 화면 결과만 Excel에서 열 수 있는 UTF-8 파일로 만듭니다. */
export function downloadResult(rows: ImportRow[]) {
  function cell(value: unknown) {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;

    return `"${safe.replaceAll('"', '""')}"`;
  }
  const labels: Record<string, string> = {
    SUCCESS: '등록 성공',
    DUPLICATE: '중복 제외',
    ERROR: '오류',
    NOT_SELECTED: '선택 안 함'
  };
  const lines = [['동', '호수', '이름', '주민 구분', '연락처 끝 4자리', '결과', '안내'], ...rows.map((row) => [row.building, row.unitNumber, row.name, RESIDENT_RELATION_OPTIONS.find((option) => option.value === row.relationType)?.label ?? '', row.phoneLast4 ? `•••• ${row.phoneLast4}` : '', labels[row.status], row.reason])];
  const url = URL.createObjectURL(new Blob(['\uFEFF', lines.map((line) => line.map(cell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8'
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '주민_일괄등록_결과.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
