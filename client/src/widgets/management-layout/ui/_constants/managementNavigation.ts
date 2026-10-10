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
        available: false
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
    children: [
      {
        id: 'monthly-billing',
        label: '월별 부과 내역',
        path: 'billing/monthly',
        available: false
      },
      {
        id: 'create-billing',
        label: '관리비 부과하기',
        path: 'billing/create',
        available: false
      },
      {
        id: 'billing-items',
        label: '부과 항목 관리',
        path: 'billing/items',
        available: false
      },
    ]
  },
  {
    id: 'payments',
    label: '입금 관리',
    icon: 'card',
    children: [
      {
        id: 'matching',
        label: '입금 확인·매칭',
        path: 'payments/matching',
        available: false
      },
      {
        id: 'arrears',
        label: '미납 관리',
        path: 'payments/arrears',
        available: false
      },
    ]
  },
  {
    id: 'banking',
    label: '통장 거래',
    icon: 'bank',
    children: [
      {
        id: 'transactions',
        label: '거래 내역',
        path: 'banking/transactions',
        available: false
      },
      {
        id: 'upload',
        label: '엑셀 업로드',
        path: 'banking/upload',
        available: false
      },
    ]
  },
  {
    id: 'expenses',
    label: '지출 관리',
    icon: 'expense',
    children: [
      {
        id: 'expense-list',
        label: '지출 내역',
        path: 'expenses',
        available: false
      },
      {
        id: 'expense-categories',
        label: '지출 분류 관리',
        path: 'expenses/categories',
        available: false
      },
    ]
  },
  {
    id: 'accounting',
    label: '회계',
    icon: 'chart',
    children: [
      {
        id: 'journals',
        label: '전표 조회',
        path: 'accounting/journals',
        available: false
      },
      {
        id: 'ledger',
        label: '계정별 원장',
        path: 'accounting/ledger',
        available: false
      },
      {
        id: 'receivables',
        label: '세대별 미수 원장',
        path: 'accounting/receivables',
        available: false
      },
      {
        id: 'profit-loss',
        label: '손익 현황',
        path: 'accounting/profit-loss',
        available: false
      },
    ]
  },
  {
    id: 'closing',
    label: '정산 / 마감',
    icon: 'closing',
    children: [
      {
        id: 'monthly-closing',
        label: '월 마감',
        path: 'closing/monthly',
        available: false
      },
      {
        id: 'reconciliation',
        label: '통장 대사',
        path: 'closing/reconciliation',
        available: false
      },
      {
        id: 'reports',
        label: '보고서',
        path: 'closing/reports',
        available: false
      },
    ]
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
    available: false
  },
];
