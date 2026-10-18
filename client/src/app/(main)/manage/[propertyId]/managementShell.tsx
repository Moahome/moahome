'use client';

import type { ReactNode } from 'react';
import {
  usePathname,
  useSearchParams
} from 'next/navigation';
import { ManagementLayout } from '@/widgets/management-layout';
import { ServiceHeader } from '@/widgets/service-header';

/** 라우터 경계에서 두 위젯을 조합해 같은 레이어 간 직접 참조 없이 헤더 슬롯을 연결합니다. */
export function ManagementShell({
  propertyId,
  children
}: {
  propertyId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = `/manage/${propertyId}`;
  const searchParams = useSearchParams();
  const ledgerBuilding = searchParams.get('buildingId');
  const ledgerMonth = searchParams.get('month');
  // 원장 진입 문맥만 허용해 다른 관리대상이나 임의 URL로 돌아가지 않게 합니다.
  const fromBalance = searchParams.get('from') === 'balance'
    && /^[0-9a-f-]{36}$/i.test(ledgerBuilding ?? '') && /^\d{4}-(0[1-9]|1[0-2])$/.test(ledgerMonth ?? '')
    && (pathname.startsWith(`${basePath}/banking/receipts/`) || pathname.startsWith(`${basePath}/banking/transactions/`));
  const mobileBack = fromBalance ? {
    href: `${basePath}/banking/balances/${ledgerBuilding}?month=${ledgerMonth}`,
    label: '동별 상세 원장으로 돌아가기',
    title: '거래 상세'
  } : getMobileBack(pathname, basePath, ledgerMonth);

  return (
    <ManagementLayout
      propertyId={propertyId}
      header={({ mobileContent }) => (
        <ServiceHeader
          homeHref={`/manage/${propertyId}/dashboard`}
          homeLabel={'대시보드'}
          mobileContent={mobileContent}
          mobileBack={mobileBack}
        />
      )}
    >
      {children}
    </ManagementLayout>
  );
}

/** 직접 접근에서도 같은 관리대상 안의 목록·상세로 돌아가는 모바일 헤더를 구성합니다. */
function getMobileBack(pathname: string, basePath: string, month: string | null) {
  if (pathname.startsWith(`${basePath}/banking/balances/`)) return {
    href: `${basePath}/banking/balances${/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') ? `?month=${month}` : ''}`,
    label: '동별 잔고·정산으로 돌아가기',
    title: pathname.startsWith(`${basePath}/banking/balances/details/`) ? '동별 잔고·정산' : '동별 상세 원장'
  };
  if (pathname === `${basePath}/banking/upload`) return {
    href: `${basePath}/banking/transactions`,
    label: '통장 거래로 돌아가기',
    title: '거래내역 가져오기'
  };
  if (pathname.startsWith(`${basePath}/banking/monthly/`)) return {
    href: `${basePath}/banking/monthly`,
    label: '월별 수납 현황으로 돌아가기',
    title: '수납 상세'
  };
  if (pathname.startsWith(`${basePath}/banking/receipts/`) || pathname.startsWith(`${basePath}/banking/transactions/`)) return {
    href: `${basePath}/banking/transactions`,
    label: '통장 거래로 돌아가기',
    title: '거래 상세'
  };
  if (pathname.startsWith(`${basePath}/join-requests/`)) return {
    href: `${basePath}/join-requests`,
    label: '가입 요청으로 돌아가기',
    title: '가입 요청 확인'
  };
  if (pathname.startsWith(`${basePath}/payments/monthly/`)) return {
    href: `${basePath}/payments/monthly`,
    label: '월별 수납 현황으로 돌아가기',
    title: '수납 상세'
  };
  if (pathname.startsWith(`${basePath}/payments/matching/`)) return {
    href: `${basePath}/payments/matching`,
    label: '입금 확인·매칭으로 돌아가기',
    title: '입금 상세'
  };
  if (pathname === `${basePath}/residents/export`) return {
    href: `${basePath}/residents`,
    label: '주민 목록으로 돌아가기',
    title: '엑셀 다운로드'
  };
  if (pathname === `${basePath}/residents/import`) return {
    href: `${basePath}/residents`,
    label: '주민 목록으로 돌아가기',
    title: '엑셀 업로드'
  };
  if (pathname === `${basePath}/residents/account-link`) return {
    href: `${basePath}/residents`,
    label: '주민 목록으로 돌아가기',
    title: '내 관리소장 계정 연결'
  };
  if (pathname === `${basePath}/residents/new`) return {
    href: `${basePath}/residents`,
    label: '주민 목록으로 돌아가기',
    title: '주민 등록'
  };
  if (pathname.startsWith(`${basePath}/residents/`)) return {
    href: `${basePath}/residents`,
    label: '주민 목록으로 돌아가기',
    title: '주민 상세'
  };
  if (pathname === `${basePath}/billing/monthly/settings`) return {
    href: `${basePath}/billing/monthly?tab=items`,
    label: '목록',
    title: '관리비 설정'
  };
  if (pathname.startsWith(`${basePath}/billing/monthly/`)) {
    const parts = pathname.slice(`${basePath}/billing/monthly/`.length).split('/');
    const history = parts[0] === 'history';
    const month = history ? parts[1] : parts[0];
    return {
      href: `${basePath}/billing/monthly?tab=${history ? 'history' : 'monthly'}&month=${month}`,
      label: '목록',
      title: history ? '부과 이력 상세' : '관리비 상세'
    };
  }
  if (!pathname.startsWith(`${basePath}/households/`)) return undefined;
  if (pathname === `${basePath}/households/buildings` || pathname === `${basePath}/households/automatic`) return {
    href: `${basePath}/households`,
    label: '세대 목록으로 돌아가기',
    title: pathname.endsWith('/buildings') ? '동 관리' : '세대 자동 입력'
  };
  if (pathname.endsWith('/edit')) return {
    href: pathname.slice(0, -5),
    label: '세대 상세로 돌아가기',
    title: '세대 수정'
  };

  return {
    href: `${basePath}/households`,
    label: '세대 목록으로 돌아가기',
    title: pathname.endsWith('/new') ? '세대 추가' : '세대 상세'
  };
}
