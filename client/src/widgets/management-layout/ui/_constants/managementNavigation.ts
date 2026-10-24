import type { ServiceIconName } from '@/shared/ui/service-icon';

export interface ManagementMenuLink {
  id: string;
  label: string;
  path: string;
  available: boolean;
}

type ManagementMenuItem = {
  id: string;
  label: string;
  icon: ServiceIconName;
} & ({ children: ManagementMenuLink[] } | { path: string; available: boolean });

export const MANAGEMENT_NAVIGATION: ManagementMenuItem[] = [
  {
    id: 'dashboard',
    label: '대시보드',
    icon: 'home',
    path: 'dashboard',
    available: true
  },
  {
    id: 'households',
    label: '세대 관리',
    icon: 'users',
    children: [
      {
        id: 'household-list',
        label: '세대 목록',
        path: 'households',
        available: true
      },
      {
        id: 'residents',
        label: '주민 목록',
        path: 'residents',
        available: true
      },
      {
        id: 'join-requests',
        label: '가입 요청',
        path: 'join-requests',
        available: true
      },
      {
        id: 'invitations',
        label: '초대 관리',
        path: 'invitations',
        available: false
      },
    ]
  },
  {
    id: 'billing',
    label: '관리비 부과',
    icon: 'receipt',
    path: 'billing/monthly',
    available: true
  },
  {
    id: 'banking',
    label: '통장 관리',
    icon: 'bank',
    children: [
      {
        id: 'transactions',
        label: '통장 거래',
        path: 'banking/transactions',
        available: true
      },
      {
        id: 'monthly-payments',
        label: '월별 수납 현황',
        path: 'banking/monthly',
        available: true
      },
      {
        id: 'expense-list',
        label: '지출 내역',
        path: 'banking/expenses',
        available: true
      },
      {
        id: 'building-balances',
        label: '동별 잔고·정산',
        path: 'banking/balances',
        available: true
      },
    ]
  },
  {
    id: 'closing',
    label: '정산 / 마감',
    icon: 'closing',
    path: 'closing/monthly',
    available: true
  },
  {
    id: 'notices',
    label: '공지사항',
    icon: 'notice',
    path: 'notices',
    available: false
  },
  {
    id: 'settings',
    label: '설정',
    icon: 'settings',
    path: 'settings',
    available: true
  },
];
