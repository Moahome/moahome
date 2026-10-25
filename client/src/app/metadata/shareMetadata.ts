import type { Metadata } from 'next';

const SHARE_IMAGES = {
  management: {
    url: '/images/share/managementPreview.png',
    alt: '모아홈 · 우리 빌라 관리, 모아홈으로 간편하게',
  },
  resident: {
    url: '/images/share/residentPreview.png',
    alt: '모아홈 · 우리 빌라 관리 플랫폼',
  },
};

/** 로그인이나 초대 검증 없이 읽을 수 있는 공개 문구와 이미지로 공유 메타데이터를 구성합니다. */
function createShareMetadata(title: string, description: string, audience: keyof typeof SHARE_IMAGES): Metadata {
  const image = SHARE_IMAGES[audience];

  return {
    title,
    description,
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      siteName: '모아홈',
      title,
      description,
      images: [{
        ...image,
        width: 1731,
        height: 909,
        type: 'image/png',
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export const SERVICE_SHARE_METADATA = createShareMetadata(
  '모아홈 · 소규모 공동주택 관리 플랫폼',
  '관리비 부과부터 수납·정산까지, 우리 빌라 관리 업무를 한곳에서 간편하게 시작하세요.',
  'management',
);

export const MANAGER_INVITATION_METADATA = createShareMetadata(
  '모아홈 관리 업무에 초대받았어요',
  '초대코드를 입력하고 모아홈에서 우리 빌라 관리에 함께하세요.',
  'management',
);

export const RESIDENT_SHARE_METADATA = createShareMetadata(
  '모아홈에서 우리 빌라 소식을 확인하세요',
  '관리비 조회부터 납부 확인과 공지사항까지, 우리 빌라 생활을 모아홈에서 함께하세요.',
  'resident',
);
