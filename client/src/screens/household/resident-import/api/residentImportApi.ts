import { authenticatedAPI } from '@/entities/session';
import { isPropertyId } from '@/entities/property';
import { ApiError } from '@/shared/api';

export type ImportStatus = 'READY' | 'DUPLICATE' | 'ERROR' | 'SUCCESS' | 'NOT_SELECTED';
export interface ImportRow {
  rowNumber: number;
  building: string;
  unitNumber: string;
  name: string;
  relationType: string | null;
  phoneLast4: string | null;
  status: ImportStatus;
  reason: string;
  representative: boolean;
}
export interface ImportResult {
  importId: string;
  expiresAt: string;
  rows: ImportRow[];
}

/** 서버가 검증한 행만 사용하고 전체 연락처·중복 행 번호·예상하지 못한 상태는 표시하지 않습니다. */
function readResult(result: ImportResult): ImportResult {
  if (!result || !isPropertyId(result.importId) || typeof result.expiresAt !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))
    || !Array.isArray(result.rows) || !result.rows.length || result.rows.length > 1000
    || new Set(result.rows.map((row) => row?.rowNumber)).size !== result.rows.length
    || result.rows.some((row) => !row || !Number.isInteger(row.rowNumber) || row.rowNumber < 2 || row.rowNumber > 1001
      || !['building', 'unitNumber', 'name', 'reason'].every((key) => typeof row[key as keyof ImportRow] === 'string')
      || !(row.phoneLast4 === null || (typeof row.phoneLast4 === 'string' && /^\d{4}$/.test(row.phoneLast4)))
      || !(row.relationType === null || ['OWNER', 'TENANT', 'FAMILY', 'OTHER'].includes(row.relationType))
      || !['READY', 'DUPLICATE', 'ERROR', 'SUCCESS', 'NOT_SELECTED'].includes(row.status) || typeof row.representative !== 'boolean')) {
    throw new ApiError(200, 'INVALID_RESPONSE', '검증 결과를 확인할 수 없어요.');
  }

  return result;
}

/** 원본 파일을 multipart로 보내며 업로드만으로 주민을 등록하지 않습니다. */
export async function previewResidents(propertyId: string, file: File) {
  const data = new FormData();
  data.append('file', file);

  return readResult(await authenticatedAPI<ImportResult>({
    url: `/api/properties/${propertyId}/resident-imports`,
    method: 'POST',
    data,
    timeoutMs: 60_000
  }));
}

/** 선택한 원본 행 번호만 보내고 재시도에도 동일한 검증 ID·선택을 유지합니다. */
export async function commitResidents(propertyId: string, importId: string, rowNumbers: number[]) {
  return readResult(await authenticatedAPI<ImportResult>({
    url: `/api/properties/${propertyId}/resident-imports/${importId}/commit`,
    method: 'POST',
    data: {
      rowNumbers
    },
    timeoutMs: 120_000
  }));
}

export function getImportError(error: unknown) {
  if (!(error instanceof ApiError)) return '처리하지 못했어요. 다시 시도해주세요.';
  const messages: Record<string, string> = {
    INVALID_EXCEL_FILE: '5MB 이하의 올바른 .xlsx 파일을 선택해주세요.',
    EXCEL_ROW_LIMIT: '한 번에 최대 1,000행까지 등록할 수 있어요.',
    INVALID_EXCEL_HEADER: '양식의 첫 행을 동·호수·이름·주민 구분·연락처 순서로 맞춰주세요.',
    EMPTY_EXCEL_FILE: '입력된 주민이 없어요.',
    IMPORT_EXPIRED: '검증 정보가 만료되었어요. 파일을 다시 올려주세요.',
    PHONE_SECURITY_UNAVAILABLE: '연락처 저장 설정을 확인한 후 같은 요청으로 다시 시도해주세요.',
    ACCESS_DENIED: '주민을 등록할 관리소장 권한이 없어요.',
    INVALID_REQUEST: '선택한 주민 정보를 확인해주세요.'
  };
  if (Object.hasOwn(messages, error.code)) return messages[error.code];
  if (error.status === 401) return '로그인이 만료되었어요. 다시 로그인해주세요.';

  return '처리 결과를 확인하지 못했어요. 같은 요청으로 다시 시도해주세요.';
}
