import type { ResidentExportRow } from '../../../../api/residentExportApi';
import { createResidentWorkbook } from '../../../../model/residentExport';

/** 미리보기에서 확인한 데이터만 저장하고 파일 저장 요청 뒤 임시 링크와 메모리 URL을 해제합니다. */
export async function downloadResidents(rows: readonly ResidentExportRow[], isActive: () => boolean) {
  const blob = await createResidentWorkbook(rows);
  if (!isActive()) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '주민_목록.xlsx';

  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
