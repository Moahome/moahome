'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/entities/session';
import {
  ReportDownloadProvider,
  ReportDownloadModal
} from '@/shared/ui/report-download';
import { getMonthRangeQuery } from '@/shared/lib/month-range';
import { getDateRangeQuery } from '@/shared/lib/date-range';
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
  const session = useSession();
  return (
    <ReportDownloadProvider
      key={`${session.data?.id}:${propertyId}`}
    >
      <ManagementShellContent
        propertyId={propertyId}
      >
        {children}
      </ManagementShellContent>
    </ReportDownloadProvider>
  );
}

function ManagementShellContent({ propertyId, children }: { propertyId: string; children: ReactNode }) {
  const pathname = usePathname();
  const basePath = `/manage/${propertyId}`;
  const searchParams = useSearchParams();
  const ledgerBuilding = searchParams.get('buildingId');
  const ledgerMonth = searchParams.get('month') ?? searchParams.get('endMonth');
  const ledgerPeriod = getMonthRangeQuery(searchParams);
  const ledgerAccount = searchParams.get('account');
  if (/^[0-9a-f-]{36}$/i.test(ledgerAccount ?? '')) ledgerPeriod.set('account', ledgerAccount!);
  // 원장 진입 문맥만 허용해 다른 관리대상이나 임의 URL로 돌아가지 않게 합니다.
  const fromBalance = searchParams.get('from') === 'balance'
    && /^[0-9a-f-]{36}$/i.test(ledgerBuilding ?? '') && /^\d{4}-(0[1-9]|1[0-2])$/.test(ledgerMonth ?? '')
    && (pathname.startsWith(`${basePath}/banking/receipts/`) || pathname.startsWith(`${basePath}/banking/transactions/`));
  const fromExpenses = searchParams.get('from') === 'expenses'
    && pathname.startsWith(`${basePath}/banking/transactions/`);
  const expenseQuery = getDateRangeQuery(searchParams);
  if (/^[0-9a-f-]{36}$/i.test(ledgerAccount ?? '')) expenseQuery.set('account', ledgerAccount!);
  const mobileBack = fromExpenses ? {
    href: `${basePath}/banking/expenses${expenseQuery.size ? `?${expenseQuery}` : ''}`,
    label: '지출 내역으로 돌아가기',
    title: '지출 상세'
  } : fromBalance ? {
    href: `${basePath}/banking/balances/${ledgerBuilding}?${ledgerPeriod}`,
    label: '동별 상세 원장으로 돌아가기',
    title: '거래 상세'
  } : getMobileBack(pathname, basePath, ledgerMonth, ledgerAccount, getMonthRangeQuery(searchParams), getDateRangeQuery(searchParams));

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
      <ReportDownloadModal />
    </ManagementLayout>
  );
}

/** 직접 접근에서도 같은 관리대상 안의 목록·상세로 돌아가는 모바일 헤더를 구성합니다. */
function getMobileBack(pathname: string, basePath: string, month: string | null, account: string | null, period: URLSearchParams, datePeriod: URLSearchParams) {
  const periodSuffix = period.size ? `?${period}` : '';
  const downloadPath = pathname.match(/\/(banking\/(?:monthly|balances|expenses)|payments\/monthly|closing\/monthly)\/download$/);
  if (downloadPath) {
    const downloadQuery = new URLSearchParams(downloadPath[1] === 'banking/expenses' ? datePeriod : period);
    if (/^[0-9a-f-]{36}$/i.test(account ?? '')) downloadQuery.set('account', account!);
    return {
      href: `${basePath}/${downloadPath[1]}${downloadQuery.size ? `?${downloadQuery}` : ''}`,
      label: '뒤로가기',
      title: '다운로드'
    };
  }
  // 전체 입금 내역은 직접 접근·새로고침 후에도 같은 조회월·세대의 수납 상세로 돌아갑니다.
  const receiptsPath = pathname.match(/\/(banking|payments)\/monthly\/(\d{4}-(?:0[1-9]|1[0-2]))\/([0-9a-f-]{36})\/receipts$/i);
  if (receiptsPath) return {
    href: `${basePath}/${receiptsPath[1]}/monthly/${receiptsPath[2]}/${receiptsPath[3]}${periodSuffix}`,
    label: '수납 상세로 돌아가기',
    title: '전체 입금 내역'
  };
  if (pathname === `${basePath}/settings/accounts`) return {
    href: `${basePath}/settings`,
    label: '설정으로 돌아가기',
    title: '계좌 관리'
  };
  const transactionQuery = new URLSearchParams(datePeriod);
  if (/^[0-9a-f-]{36}$/i.test(account ?? '')) transactionQuery.set('account', account!);
  const transactionSuffix = transactionQuery.size ? `?${transactionQuery}` : '';
  const balanceQuery = new URLSearchParams(period);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) balanceQuery.set('month', month!);
  if (/^[0-9a-f-]{36}$/i.test(account ?? '')) balanceQuery.set('account', account!);
  if (pathname.startsWith(`${basePath}/banking/balances/`)) {
    const panelTitle = pathname.endsWith('/banking/balances/details/initial') ? '초기 잔액 정정' : pathname.endsWith('/banking/balances/details/account') ? '통장 상세' : '동별 잔고·정산';
    return {
      href: `${basePath}/banking/balances${balanceQuery.size ? `?${balanceQuery}` : ''}`,
      label: '동별 잔고·정산으로 돌아가기',
      title: pathname.startsWith(`${basePath}/banking/balances/details/`) ? panelTitle : '동별 상세 원장'
    };
  }
  if (pathname === `${basePath}/banking/manual`) return {
    href: `${basePath}/banking/transactions${transactionSuffix}`,
    label: '통장 거래로 돌아가기',
    title: '수동 입금 등록'
  };
  if (pathname === `${basePath}/banking/manual-expense`) return {
    href: `${basePath}/banking/transactions${transactionSuffix}`,
    label: '통장 거래로 돌아가기',
    title: '수동 지출 등록'
  };
  if (pathname === `${basePath}/banking/upload`) return {
    href: `${basePath}/banking/transactions${transactionSuffix}`,
    label: '통장 거래로 돌아가기',
    title: '거래내역 가져오기'
  };
  if (pathname.startsWith(`${basePath}/banking/monthly/`)) return {
    href: `${basePath}/banking/monthly${periodSuffix}`,
    label: '월별 수납 현황으로 돌아가기',
    title: '수납 상세'
  };
  if (pathname.startsWith(`${basePath}/banking/receipts/`) || pathname.startsWith(`${basePath}/banking/transactions/`)) return {
    href: `${basePath}/banking/transactions${transactionSuffix}`,
    label: '통장 거래로 돌아가기',
    title: '거래 상세'
  };
  if (pathname.startsWith(`${basePath}/join-requests/`) || pathname.startsWith(`${basePath}/invitations/`)) return {
    href: `${basePath}/invitations`,
    label: '승인 관리로 돌아가기',
    title: '가입 요청 확인'
  };
  if (pathname.startsWith(`${basePath}/payments/monthly/`)) return {
    href: `${basePath}/payments/monthly${periodSuffix}`,
    label: '월별 수납 현황으로 돌아가기',
    title: '수납 상세'
  };
  if (pathname.startsWith(`${basePath}/payments/matching/`)) return {
    href: `${basePath}/payments/matching${transactionSuffix}`,
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
  if (pathname === `${basePath}/billing/monthly/opening-upload` || pathname === `${basePath}/billing/monthly/initial-correction`) return {
    href: `${basePath}/billing/monthly?tab=opening`,
    label: '기존 잔액 인계로 돌아가기',
    title: pathname.endsWith('/initial-correction') ? '초기 기준 정정' : '엑셀 업로드'
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
