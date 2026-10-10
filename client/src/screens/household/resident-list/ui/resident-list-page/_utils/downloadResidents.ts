import type {
  ResidentList,
  ResidentRow
} from '../../../api/residentApi';
import { createResidentWorkbook } from '../../../model/residentExport';

/** 화면에서 조회한 명부만 다운로드하고 파일 저장 요청 뒤 임시 링크와 메모리 URL을 해제합니다. */
export async function downloadResidents(data: ResidentList, rows: readonly ResidentRow[]) {
  const blob = await createResidentWorkbook(data, rows);
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
