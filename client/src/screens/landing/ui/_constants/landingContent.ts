import type { ServiceIconName } from '@/shared/ui/service-icon';

export const SERVICE_FEATURES: {
  icon: ServiceIconName;
  title: string;
  summary: string;
  description: string;
  items: string[];
}[] = [
  {
    icon: 'users',
    title: '세대·주민 관리',
    summary: '세대 · 명부 · 가입 승인',
    description: '세대와 주민 정보를 한곳에서 관리해요.',
    items: [
      '세대와 주민 명부 등록·수정',
      '주민 초대와 가입 신청 승인',
      '세대 대표와 참여 역할 관리',
    ],
  },
  {
    icon: 'receipt',
    title: '관리비 부과·수납',
    summary: '부과 · 납부 반영 · 미수금',
    description: '관리비를 부과하고 납부 현황을 확인해요.',
    items: [
      '월별 관리비 항목 설정과 부과',
      '입금 확인과 청구별 납부 반영',
      '세대별 미납·선입금 현황 조회',
    ],
  },
  {
    icon: 'chart',
    title: '통장 관리·월별 정산',
    summary: '거래 · 지출 · 잔고',
    description: '통장 거래와 지출을 정리하고 정산 자료를 확인해요.',
    items: [
      '은행 내역 업로드와 지출 분류',
      '동별 입출금과 잔고·정산 조회',
      '월별 정산과 Excel·PDF·이미지 출력',
    ],
  },
];

export const BENEFITS: {
  icon: ServiceIconName;
  title: string;
  description: string;
}[] = [
  {
    icon: 'home',
    title: '관리 현황을 한눈에',
    description: '청구액과 납부 반영액, 미수금을\n대시보드에서 확인합니다.',
  },
  {
    icon: 'electricity',
    title: '간편한 업무',
    description: '반복되는 관리 업무를\n더 쉽게 처리할 수 있습니다.',
  },
  {
    icon: 'chart',
    title: '월별 정산과 보고서',
    description: '입출금과 잔고를 확인하고\n정산 자료를 내려받습니다.',
  },
  {
    icon: 'users',
    title: '소규모 주택에 최적화',
    description: '빌라, 다세대, 소규모 공동주택을\n위한 서비스입니다.',
  },
];

export const FAQ_ITEMS = [
  {
    question: '어떤 주택에서 이용할 수 있나요?',
    answer:
      '빌라, 다세대 주택, 소규모 공동주택의 관리 업무를 위한 서비스입니다. 동 구분이 없는 주택과 여러 동이 있는 공동주택을 등록해 세대별로 관리할 수 있습니다.',
  },
  {
    question: '관리소장과 주민은 어떻게 이용하나요?',
    answer:
      '관리소장과 부담당자는 세대·주민 관리, 관리비 부과·수납, 통장 거래와 월별 정산 업무를 처리합니다. 주민은 초대로 가입한 곳을 확인하고 설정을 이용할 수 있으며, 주민용 관리비 조회와 공지 기능은 준비 중입니다.',
  },
  {
    question: '관리비는 어떻게 납부하나요?',
    answer:
      '안내받은 관리계좌로 은행 앱에서 직접 이체합니다. 관리소장이 입금 내역을 확인하고 청구에 반영하면 수납·납부 현황에 표시됩니다. 모아홈 안에서 계좌이체나 카드 결제를 실행하는 기능은 제공하지 않습니다.',
  },
  {
    question: '지금 바로 서비스를 사용할 수 있나요?',
    answer:
      '카카오 로그인 후 관리할 곳을 등록하면 세대·주민 관리부터 관리비 부과·수납, 통장 관리와 월별 정산까지 이용할 수 있습니다.',
  },
];

export const BRAND_POINTS = [
  '웹과 설치 앱에서',
  '소규모 공동주택을 위해',
  '부과·수납·통장 업무를 한곳에',
  '관리할 곳별 권한 관리',
] as const;

export const MANAGEMENT_STEPS = [
  '관리비 부과',
  '수납 확인',
  '지출 정리',
  '월별 정산',
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
    title: '관리소장 · 부담당자',
    text: '부과부터 정산까지, 필요한 업무를 간편하게.',
    icon: 'users',
  },
] as const satisfies readonly {
  title: string;
  text: string;
  icon: ServiceIconName;
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
