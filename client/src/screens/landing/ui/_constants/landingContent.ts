import type { LandingIconName } from '../_components/landingIcon';

export const ROLES: {
  icon: LandingIconName;
  title: string;
  summary: string;
  description: string;
  items: string[];
}[] = [
  {
    icon: 'people',
    title: '주민 관리',
    summary: '조회 · 계좌 · 납부상태',
    description: '우리 집 관리비, 궁금할 때 바로 확인해요.',
    items: [
      '이번 달 관리비와 상세 항목',
      '납부계좌와 월별 납부 내역',
      '우리 주택의 공용 지출과 공지',
    ],
  },
  {
    icon: 'receipt',
    title: '관리자 관리비',
    summary: '부과 · 수납 · 지출',
    description: '반복되는 관리 업무를 한곳에서 처리해요.',
    items: [
      '세대와 주민 정보 관리',
      '월별 관리비 부과와 수납 확인',
      '미납 현황과 공용 지출 관리',
    ],
  },
  {
    icon: 'chart',
    title: '관리비 회계',
    summary: '전표 · 원장 · 손익',
    description: '관리 업무의 결과가 회계로 이어져요.',
    items: [
      '부과·수납에 연결되는 회계 기록',
      '세대별 미수금과 계정별 원장',
      '월별 정산과 손익 조회',
    ],
  },
];

export const BENEFITS: {
  icon: LandingIconName;
  title: string;
  description: string;
}[] = [
  {
    icon: 'home',
    title: '투명한 관리비',
    description: '주민이 언제든지\n내역을 확인할 수 있습니다.',
  },
  {
    icon: 'bolt',
    title: '간편한 업무',
    description: '반복되는 관리 업무를\n더 쉽게 처리할 수 있습니다.',
  },
  {
    icon: 'chart',
    title: '자동 회계 연결',
    description: '확정된 부과·수납·지출을\n회계 기록으로 연결합니다.',
  },
  {
    icon: 'people',
    title: '소규모 주택에 최적화',
    description: '빌라, 다세대, 소규모 공동주택을\n위한 서비스입니다.',
  },
];

export const FAQ_ITEMS = [
  {
    question: '어떤 주택에서 이용할 수 있나요?',
    answer:
      '빌라, 다세대 주택, 소규모 공동주택의 관리 업무를 위한 서비스입니다. 동이 없는 주택부터 여러 동이 있는 공동주택까지 고려하고 있습니다.',
  },
  {
    question: '주민과 관리자가 같은 서비스를 사용하나요?',
    answer:
      '네. 같은 건물·단지의 정보를 함께 사용하되, 주민은 본인 세대의 관리비와 공개된 공용 정보를 확인하고 관리자는 부과·수납·지출 등 관리 업무를 처리하도록 구성합니다.',
  },
  {
    question: '관리비는 어떻게 납부하나요?',
    answer:
      '주민은 안내된 관리계좌로 은행 앱에서 직접 계좌이체합니다. 관리자가 수납을 확인하면 납부 상태에 반영하는 방식이며, 앱 내 카드 결제는 초기 범위에 포함되지 않습니다.',
  },
  {
    question: '지금 바로 서비스를 사용할 수 있나요?',
    answer:
      '현재 모아홈은 개발 중입니다. 이 페이지는 서비스의 방향을 소개하며, 노트북과 휴대폰에 표시된 화면은 예시입니다. 로그인과 실제 관리 기능은 순차적으로 준비하고 있습니다.',
  },
];

export const BRAND_POINTS = [
  '별도 설치 없이 웹에서',
  '소규모 공동주택을 위해',
  '주민·관리자·회계 통합',
  '관리할 곳별 권한 관리',
] as const;

export const MANAGEMENT_STEPS = [
  '관리비 부과',
  '수납 확인',
  '납부 상태 반영',
  '회계 연결',
] as const;

export const AUDIENCE_ITEMS = [
  {
    title: '빌라 · 다세대 주택',
    text: '동이 없어도, 세대별 관리비를 한눈에.',
    icon: 'building',
  },
  {
    title: '소규모 공동주택',
    text: '여러 세대의 부과와 수납을 한곳에서.',
    icon: 'home',
  },
  {
    title: '직접 관리하는 주민 · 관리자',
    text: '관리 경험이 적어도 이해하기 쉽게.',
    icon: 'people',
  },
] as const satisfies readonly {
  title: string;
  text: string;
  icon: LandingIconName;
}[];

export const NAVIGATION_ITEMS = [
  {
    href: '#service',
    label: '서비스 소개'
  },
  {
    href: '#features',
    label: '주요 기능'
  },
  {
    href: '#audience',
    label: '이용 대상'
  },
  {
    href: '#faq',
    label: '자주 묻는 질문'
  },
];
