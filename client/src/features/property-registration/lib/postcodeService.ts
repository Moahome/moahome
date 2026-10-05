interface PostcodeResult {
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: 'R' | 'J';
}

interface PostcodeOptions {
  oncomplete: (data: PostcodeResult) => void;
  width: string;
  height: string;
}

interface PostcodeService {
  Postcode: new (options: PostcodeOptions) => {
    embed: (element: HTMLElement) => void;
  };
}

const POSTCODE_SCRIPT_URL = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
let loadingService: Promise<PostcodeService> | null = null;

/** 공식 주소 검색 스크립트를 공유하고 로딩 실패·시간 초과 후에는 새 요청으로 재시도합니다. */
export function loadPostcodeService(): Promise<PostcodeService> {
  const browser = window as Window & { kakao?: PostcodeService; daum?: PostcodeService };
  const existing = browser.kakao?.Postcode ? browser.kakao : browser.daum;

  if (existing?.Postcode) return Promise.resolve(existing);
  if (loadingService) return loadingService;

  loadingService = new Promise<PostcodeService>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = POSTCODE_SCRIPT_URL;
    script.async = true;

    /** 실패한 스크립트를 제거해 재시도에 이전 로딩 상태가 남지 않게 합니다. */
    function fail() {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('주소 검색을 불러오지 못했습니다.'));
    }

    const timeout = window.setTimeout(fail, 15_000);
    script.onerror = fail;
    script.onload = () => {
      const service = browser.kakao?.Postcode ? browser.kakao : browser.daum;

      if (!service?.Postcode) {
        fail();
        return;
      }

      clearTimeout(timeout);
      resolve(service);
    };
    document.head.append(script);
  }).catch((error) => {
    loadingService = null;
    throw error;
  });

  return loadingService;
}
