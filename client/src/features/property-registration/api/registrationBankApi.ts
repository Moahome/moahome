import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  RegistrationBankPreview,
  RegistrationBankSupport
} from '../model/registrationBankTypes';

/** 초기 등록에서도 지원 여부와 확장자를 서버의 은행별 기준에서 조회합니다. */
export async function getRegistrationBankSupport(bankCode: string, signal?: AbortSignal): Promise<RegistrationBankSupport> {
  const support = await authenticatedAPI<RegistrationBankSupport>({
    url: `/api/property-registrations/bank-import/support?bankCode=${encodeURIComponent(bankCode)}`,
    signal
  });
  if (!support || typeof support.enabled !== 'boolean' || !Array.isArray(support.extensions) || !support.extensions.every((extension) => ['.xls', '.xlsx', '.csv'].includes(extension)) || typeof support.message !== 'string') throw new ApiError(200, 'INVALID_RESPONSE', '업로드 지원 정보를 확인할 수 없습니다.');
  return support;
}

/** 서버에서 은행 원본을 검증하며 Client가 파싱한 거래 금액을 미리보기로 사용하지 않습니다. */
export async function previewRegistrationBank(file: File, bankCode: string): Promise<RegistrationBankPreview> {
  const data = new FormData();
  data.append('file', file);
  data.append('bankCode', bankCode);
  const result = await authenticatedAPI<RegistrationBankPreview>({
    url: '/api/property-registrations/bank-import/preview',
    method: 'POST',
    data,
    timeoutMs: 60_000
  });
  if (!result || !Array.isArray(result.rows) || !result.rows.length || result.rows.length > 5000 || !result.period
    || !result.rows.every((row) => /^[0-9a-f-]{36}$/i.test(row.id) && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && typeof row.payer === 'string' && ['INCOME', 'EXPENSE'].includes(row.direction) && /^[0-9]{1,15}$/.test(row.amount) && BigInt(row.amount) > BigInt(0) && (row.balance === null || /^-?[0-9]{1,15}$/.test(row.balance)) && typeof row.autoMatchEligible === 'boolean')
    || new Set(result.rows.map((row) => row.id)).size !== result.rows.length) throw new ApiError(200, 'INVALID_RESPONSE', '거래내역을 확인할 수 없습니다.');
  return result;
}

/** 최종 등록에서 같은 원본을 재검증하도록 파일 바이트를 브라우저 메모리에 보존합니다. */
export function readRegistrationBankFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}
