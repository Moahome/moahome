import { authenticatedAPI } from '@/entities/session';
import { ApiError } from '@/shared/api';
import type {
  NoticeAsset,
  NoticeDetail,
  NoticeList,
  NoticeSaveRequest
} from '../model/noticeTypes';

/** 관리대상과 목록 형식을 확인하고 조회 실패를 빈 공지 목록으로 바꾸지 않습니다. */
export async function getNotices(propertyId: string, page: number, query: string, field: string, signal?: AbortSignal) {
  const data = await authenticatedAPI<NoticeList>({
    url: `/api/properties/${propertyId}/notices`,
    data: {
      page,
      query,
      field
    },
    signal
  });
  if (!data || data.propertyId !== propertyId || data.page !== page || !Array.isArray(data.items)
    || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.pageCount) || data.pageCount < 1
    || !data.items.every((row) => typeof row.id === 'string' && Number.isSafeInteger(row.number) && row.number > 0
      && typeof row.title === 'string' && typeof row.important === 'boolean'
      && Number.isFinite(Date.parse(row.createdAt)) && Number.isSafeInteger(row.views) && row.views >= 0)) {
    throw new ApiError(200, 'INVALID_RESPONSE', '공지사항 목록을 확인할 수 없습니다.');
  }

  return data;
}

/** 다른 관리대상의 본문이나 잘못된 버전은 편집 폼에 전달하지 않습니다. */
function readDetail(data: NoticeDetail, propertyId: string, id: string) {
  if (!data || data.propertyId !== propertyId || data.id !== id || typeof data.title !== 'string'
    || typeof data.canEdit !== 'boolean'
    || typeof data.canDelete !== 'boolean'
    || typeof data.content !== 'string' || typeof data.important !== 'boolean'
    || !Number.isSafeInteger(data.version) || data.version < 1) {
    throw new ApiError(200, 'INVALID_RESPONSE', '공지사항을 확인할 수 없습니다.');
  }

  return data;
}

export async function getNotice(propertyId: string, id: string, signal?: AbortSignal) {
  const data = await authenticatedAPI<NoticeDetail>({
    url: `/api/properties/${propertyId}/notices/${id}`,
    signal
  });

  return readDetail(data, propertyId, id);
}

/** 새 글도 클라이언트가 만든 동일 ID로 재전송해 응답 유실 뒤 중복 게시하지 않습니다. */
export async function saveNotice(propertyId: string, id: string, data: NoticeSaveRequest) {
  const result = await authenticatedAPI<NoticeDetail>({
    url: `/api/properties/${propertyId}/notices/${id}`,
    method: 'PUT',
    data
  });

  return readDetail(result, propertyId, id);
}

export async function deleteNotice(propertyId: string, id: string, version: number) {
  await authenticatedAPI<void>({
    url: `/api/properties/${propertyId}/notices/${id}?version=${version}`,
    method: 'DELETE'
  });
}

/** 같은 File 객체의 재시도에는 같은 업로드 ID를 사용합니다. 원본은 S3, 메타데이터는 DB에 저장합니다. */
const uploadIds = new WeakMap<File, string>();
export async function uploadNoticeAsset(propertyId: string, file: File, image: boolean) {
  const id = uploadIds.get(file) ?? crypto.randomUUID();
  uploadIds.set(file, id);
  const data = new FormData();
  data.set('file', file);
  data.set('image', String(image));
  const asset = await authenticatedAPI<NoticeAsset>({
    url: `/api/properties/${propertyId}/notices/assets/${id}`,
    method: 'PUT',
    data,
    timeoutMs: 35_000
  });
  if (asset.id !== id || asset.size !== file.size || asset.name !== file.name
    || asset.data !== `/api/properties/${propertyId}/notices/assets/${id}`) {
    throw new ApiError(200, 'INVALID_RESPONSE', '첨부파일 저장 결과를 확인할 수 없습니다.');
  }
  return asset;
}

/** 임의 외부 URL로 인증 토큰이 유출되지 않도록 공지 자산 API만 호출합니다. */
export async function readNoticeAsset(reference: string, signal?: AbortSignal) {
  if (!/^\/api\/properties\/[0-9a-f-]{36}\/notices\/assets\/[0-9a-f-]{36}$/.test(reference)) {
    throw new ApiError(400, 'INVALID_NOTICE_ASSET', '첨부파일 주소를 확인해주세요.');
  }
  return authenticatedAPI<Blob>({
    url: reference,
    responseType: 'blob',
    signal
  });
}
