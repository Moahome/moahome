import { isPropertyId } from '@/entities/property';

const RECENT_PROPERTY_PREFIX = 'moahome.management.recent-property.';

/** 최근 ID는 선택 편의 정보이며 이름·역할·토큰이나 권한 증명을 저장하지 않습니다. */
export function readRecentProperty(userId: string): string | null {
  try {
    const id = localStorage.getItem(RECENT_PROPERTY_PREFIX + userId);
    if (isPropertyId(id)) return id;
    localStorage.removeItem(RECENT_PROPERTY_PREFIX + userId);
  } catch { /* 저장소가 차단되어도 서버 목록의 첫 대상으로 진입합니다. */ }
  return null;
}

/** 서버의 현재 관리 권한 확인에 성공한 대상만 기억합니다. */
export function rememberRecentProperty(userId: string, propertyId: string) {
  try { localStorage.setItem(RECENT_PROPERTY_PREFIX + userId, propertyId); } catch { /* 진입 자체는 유지합니다. */ }
}

/** 늦은 이전 대상의 접근 거부가 새로 선택한 대상을 지우지 않도록 비교합니다. */
export function forgetRecentProperty(userId: string, propertyId: string) {
  try {
    if (localStorage.getItem(RECENT_PROPERTY_PREFIX + userId) === propertyId) {
      localStorage.removeItem(RECENT_PROPERTY_PREFIX + userId);
    }
  } catch { /* 다음 목록 조회에서 현재 권한을 다시 확인합니다. */ }
}
