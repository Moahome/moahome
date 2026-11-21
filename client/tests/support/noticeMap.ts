import type { Page } from '@playwright/test';

export const NOTICE_LOCATION = {
  name: '서울특별시청',
  address: '서울특별시 중구 세종대로 110',
  latitude: 37.5663,
  longitude: 126.9779
};

/** 실제 카카오 호출 없이 SDK 로드·주소 검색·지도 생성과 실패 뒤 복구를 검증합니다. */
export async function mockNoticeMap(page: Page, failFirstLoad = false) {
  let loads = 0;
  await page.route('https://dapi.kakao.com/v2/maps/sdk.js?**', async (route) => {
    loads += 1;
    if (failFirstLoad && loads === 1) return route.abort();
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.kakao = { maps: {
        load(callback) { callback(); },
        LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } getLat() { return this.lat; } getLng() { return this.lng; } },
        Map: class {
          constructor(element, options) {
            this.center = options.center;
            element.style.background = 'repeating-linear-gradient(0deg, #F8FAFC 0 44px, #FFFFFF 44px 52px)';
            const marker = document.createElement('span');
            marker.textContent = '📍';
            marker.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:32px';
            element.append(marker);
          }
          relayout() {} setCenter(center) { this.center = center; } getCenter() { return this.center; }
          addControl() {}
        },
        ZoomControl: class {},
        ControlPosition: { RIGHT: 1 },
        Marker: class { setMap() {} },
        services: {
          Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' },
          Geocoder: class {
            addressSearch(query, callback) {
              if (query === '없는 주소') { callback([], 'ZERO_RESULT'); return; }
              if (query === '검색 오류') { callback([], 'ERROR'); return; }
              const first = { address_name: '${NOTICE_LOCATION.address}', x: '${NOTICE_LOCATION.longitude}', y: '${NOTICE_LOCATION.latitude}', road_address: { address_name: '${NOTICE_LOCATION.address}', building_name: '${NOTICE_LOCATION.name}' } };
              const second = { address_name: '서울특별시 중구 세종대로 99', x: '126.977', y: '37.565', road_address: null };
              callback(query === '세종대로' ? [first, second] : [first], 'OK');
            }
          }
        }
      }};`
    });
  });
  await page.route('https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.daum = { Postcode: class {
      constructor(options) { this.options = options; }
      embed(element) {
        const input = document.createElement('input');
        input.setAttribute('aria-label', '주소 검색어');
        const result = document.createElement('button');
        result.type = 'button'; result.textContent = '${NOTICE_LOCATION.address}'; result.hidden = true;
        const empty = document.createElement('p'); empty.textContent = '검색 결과가 없습니다.'; empty.hidden = true;
        input.oninput = () => {
          result.hidden = !input.value || input.value === '없는 주소';
          empty.hidden = input.value !== '없는 주소';
        };
        result.onclick = () => this.options.oncomplete({ userSelectedType: 'R', address: '${NOTICE_LOCATION.address}', roadAddress: '${NOTICE_LOCATION.address}', jibunAddress: '', buildingName: '${NOTICE_LOCATION.name}' });
        element.append(input, result, empty);
      }
    }};`
  }));
  return {
    loads: () => loads
  };
}
