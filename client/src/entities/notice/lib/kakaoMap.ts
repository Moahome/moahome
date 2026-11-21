import { isNoticeLocation } from '../model/noticeLocation';
import type { NoticeLocation } from '../model/noticeLocationTypes';
import type { KakaoMaps } from './kakaoMapTypes';

let loading: Promise<KakaoMaps> | null = null;

/** 검색창·미리보기가 SDK 한 번의 로드를 공유하고 실패·시간 초과 뒤에는 명시적으로 재시도합니다. */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (loading) return loading;
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  if (!key) return Promise.reject(new Error('MAP_NOT_CONFIGURED'));
  loading = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const timeout = window.setTimeout(fail, 15000);

    function fail() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('MAP_LOAD_FAILED'));
    }

    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onerror = fail;
    script.onload = () => {
      if (settled) return;
      const maps = (window as Window & { kakao?: { maps?: KakaoMaps } }).kakao?.maps;
      if (!maps?.load) { fail(); return; }
      try {
        maps.load(() => {
          if (settled) return;
          if (!maps.Map || !maps.services?.Geocoder) { fail(); return; }
          settled = true;
          window.clearTimeout(timeout);
          resolve(maps);
        });
      } catch { fail(); }
    };
    document.head.append(script);
  }).catch((failure) => {
    loading = null;
    throw failure;
  });
  return loading;
}

/** 주소 검색 결과만 사용하며 열람 때는 저장된 좌표를 사용해 주소를 매번 다시 검색하지 않습니다. */
export async function searchNoticeLocations(address: string): Promise<NoticeLocation[]> {
  const maps = await loadKakaoMaps();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('MAP_SEARCH_TIMEOUT')), 12000);
    new maps.services.Geocoder().addressSearch(address, (results, status) => {
      window.clearTimeout(timeout);
      if (status === maps.services.Status.ZERO_RESULT) { resolve([]); return; }
      if (status !== maps.services.Status.OK) { reject(new Error('MAP_SEARCH_FAILED')); return; }
      resolve(results.map((result) => ({
        name: (result.road_address?.building_name || result.road_address?.address_name || result.address_name).slice(0, 100),
        address: result.road_address?.address_name || result.address_name,
        latitude: Number(result.y),
        longitude: Number(result.x)
      })).filter(isNoticeLocation));
    }, {
      size: 10
    });
  });
}
