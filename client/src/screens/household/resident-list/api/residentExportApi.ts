import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';

export interface ResidentExportRow {
  name: string;
  phone: string | null;
  unitLabel: string;
}

/** 명시적인 다운로드 진입에서만 전체 번호를 받고 조회 캐시나 브라우저 저장소에는 보관하지 않습니다. */
export async function getResidentExport(propertyId: string, residentIds: readonly string[]): Promise<ResidentExportRow[]> {
  const result = await authenticatedAPI<{ residents: ResidentExportRow[] }>({
    url: `/api/properties/${propertyId}/residents/export`,
    method: 'POST',
    data: {
      residentIds
    }
  });
  const invalid = () => new ApiError(200, 'INVALID_RESPONSE', '다운로드할 주민 정보를 확인할 수 없습니다.');
  if (!result || !Array.isArray(result.residents) || result.residents.length !== residentIds.length) throw invalid();

  return result.residents.map((row) => {
    if (!row || typeof row.name !== 'string' || !row.name.trim()
      || !(row.phone === null || (typeof row.phone === 'string' && /^\+[1-9][0-9]{3,14}$/.test(row.phone)))
      || typeof row.unitLabel !== 'string' || !row.unitLabel.trim()) throw invalid();

    // 서버에 필드가 추가되어도 내보내기에 허용한 세 값만 미리보기와 파일에 전달합니다.
    return {
      name: row.name,
      phone: row.phone,
      unitLabel: row.unitLabel
    };
  });
}
