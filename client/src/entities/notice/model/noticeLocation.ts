import type { NoticeLocation } from './noticeLocationTypes';

/** 과거 공지에는 장소가 없으며 잘못된 초안 좌표로 외부 지도를 호출하지 않습니다. */
export function isNoticeLocation(value: unknown): value is NoticeLocation {
  if (!value || typeof value !== 'object')
    return false;
  const location = value as Record<string, unknown>;

  return typeof location.name === 'string' && Boolean(location.name.trim()) && location.name.length <= 100
    && typeof location.address === 'string' && Boolean(location.address.trim()) && location.address.length <= 300
    && typeof location.latitude === 'number' && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
    && typeof location.longitude === 'number' && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
}

/** 본문·첨부와 같은 JSON의 선택 장소 한 곳을 읽고 이전 공지는 그대로 표시합니다. */
export function readNoticeLocation(content?: string): NoticeLocation | null {
  if (!content)
    return null;
  try {
    const value: unknown = JSON.parse(content).location;

    return isNoticeLocation(value) ? value : null;
  } catch {
    return null;
  }
}
