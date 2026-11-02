import type { ServiceIconName } from '@/shared/ui/service-icon';

type PreviewMenuItem = {
  icon: ServiceIconName;
  label: string;
  expandable?: boolean;
};

// 관리소장 화면의 현재 메뉴 구조를 축약해 표시하고 준비 중인 메뉴는 기능 제공으로 안내하지 않습니다.
export const PREVIEW_MENU: readonly PreviewMenuItem[] = [
  {
    icon: 'home',
    label: '대시보드'
  },
  {
    icon: 'users',
    label: '세대 관리',
    expandable: true
  },
  {
    icon: 'receipt',
    label: '관리비 부과'
  },
  {
    icon: 'bank',
    label: '통장 관리',
    expandable: true
  },
  {
    icon: 'closing',
    label: '정산 / 마감'
  },
  {
    icon: 'car',
    label: '차량 관리',
    expandable: true
  },
  {
    icon: 'notice',
    label: '공지사항'
  },
  {
    icon: 'settings',
    label: '설정'
  },
] as const satisfies readonly PreviewMenuItem[];

export const PREVIEW_TRANSACTIONS = [
  {
    date: '11.02',
    label: '201호 관리비',
    amount: '+50,000원',
    status: '확정'
  },
  {
    date: '11.02',
    label: '공용 전기요금',
    amount: '-80,000원',
    status: '확정'
  },
  {
    date: '11.01',
    label: '입금 내역',
    amount: '30,000원',
    status: '확인 필요'
  },
] as const;

export const PREVIEW_STATS = [
  {
    icon: 'receipt',
    label: '선택 월 청구액',
    amount: '1,200,000',
    note: '선택 월 신규 부과 기준',
    tone: 'primary'
  },
  {
    icon: 'check',
    label: '청구 납부반영액',
    amount: '950,000',
    note: '선택 월 청구에 반영된 납부액',
    tone: 'success'
  },
  {
    icon: 'alert',
    label: '당월 청구 미수금',
    amount: '250,000',
    note: '선택 월 청구 중 남은 미납액',
    tone: 'danger'
  },
  {
    icon: 'wallet',
    label: '관리대상 부담 지출',
    amount: '180,000',
    note: '확정 지출 · 내부 이체 제외',
    tone: 'teal'
  },
] as const satisfies readonly {
  icon: ServiceIconName;
  label: string;
  amount: string;
  note: string;
  tone: string;
}[];

export const PREVIEW_TASKS = [
  {
    label: '확인 필요 입금',
    count: 3
  },
  {
    label: '가입·정보 수정 요청',
    count: 1
  },
  {
    label: '미분류 출금',
    count: 2
  },
  {
    label: '외부 부담금 미회수',
    count: 1
  },
  {
    label: '중복 의심 거래',
    count: 0
  },
] as const;

export const PREVIEW_PHONE_ACTIONS = [
  {
    icon: 'wallet',
    label: '납부계좌'
  },
  {
    icon: 'receipt',
    label: '상세내역'
  },
  {
    icon: 'chart',
    label: '지난 내역'
  },
] as const satisfies readonly PreviewMenuItem[];

export const PREVIEW_PHONE_NAVIGATION = [
  {
    icon: 'home',
    label: '홈'
  },
  {
    icon: 'receipt',
    label: '관리비'
  },
  {
    icon: 'bell',
    label: '공지'
  },
  {
    icon: 'users',
    label: '내 정보'
  },
] as const satisfies readonly PreviewMenuItem[];
