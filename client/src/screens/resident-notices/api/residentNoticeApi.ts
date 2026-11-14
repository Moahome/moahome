import {
  ApiError,
  customAPI
} from '@/shared/api';
import type {
  ResidentNoticeContext,
  ResidentNoticeDetail,
  ResidentNoticeList,
  ResidentNoticeSummary
} from './residentNoticeApiTypes';

const BASE = '/api/notice-access';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 주민 세션은 관리자 Bearer·로그인 복원과 분리된 HttpOnly 쿠키로만 교환합니다. */
export function exchangeNoticeLink(token: string) {
  return customAPI<void>({
    url: `${BASE}/sessions`,
    method: 'POST',
    data: {
      token
    }
  });
}

export async function getResidentNoticeContext(signal?: AbortSignal) {
  const data = await customAPI<ResidentNoticeContext>({
    url: `${BASE}/context`,
    signal
  });
  if (!data || !UUID.test(data.propertyId) || typeof data.name !== 'string') throw invalidResponse();
  return data;
}

function validSummary(row: ResidentNoticeSummary) {
  return row && UUID.test(row.id) && typeof row.title === 'string' && typeof row.important === 'boolean'
    && Number.isFinite(Date.parse(row.createdAt));
}

function invalidResponse() {
  return new ApiError(200, 'INVALID_RESPONSE', '공지사항을 확인할 수 없습니다.');
}

/** 주소의 관리대상과 응답을 대조하고 실패를 빈 공지 목록으로 표시하지 않습니다. */
export async function getResidentNotices(propertyId: string, page: number, query: string, signal?: AbortSignal) {
  const data = await customAPI<ResidentNoticeList>({
    url: `${BASE}/notices`,
    data: {
      page,
      query
    },
    signal
  });
  if (!data || data.propertyId !== propertyId || data.page !== page || !Array.isArray(data.items)
    || !Array.isArray(data.importantItems) || !data.importantItems.every((row) => validSummary(row) && row.important)
    || !data.items.every((row) => validSummary(row) && !row.important) || !Number.isSafeInteger(data.total) || data.total < 0
    || !Number.isSafeInteger(data.pageCount) || data.pageCount < 1) throw invalidResponse();
  return data;
}

export async function getResidentNotice(propertyId: string, id: string, signal?: AbortSignal) {
  const data = await customAPI<ResidentNoticeDetail>({
    url: `${BASE}/notices/${id}`,
    signal
  });
  if (!data || data.propertyId !== propertyId || data.id !== id || !validSummary(data)
    || typeof data.content !== 'string' || typeof data.authorName !== 'string') throw invalidResponse();
  try {
    if (JSON.parse(data.content).type !== 'doc') throw invalidResponse();
  } catch { throw invalidResponse(); }
  return data;
}

/** 문서의 관리자용 참조를 주민 전용 경로로 바꾸고 해당 공지에 연결된 자산만 요청합니다. */
export function readResidentNoticeAsset(propertyId: string, noticeId: string, reference: string, signal?: AbortSignal) {
  const prefix = `/api/properties/${propertyId}/notices/assets/`;
  const id = reference.startsWith(prefix) ? reference.slice(prefix.length) : '';
  if (!UUID.test(id)) throw new ApiError(400, 'INVALID_NOTICE_ASSET', '첨부파일 주소를 확인해주세요.');
  return customAPI<Blob>({
    url: `${BASE}/notices/${noticeId}/assets/${id}`,
    responseType: 'blob',
    signal
  });
}
