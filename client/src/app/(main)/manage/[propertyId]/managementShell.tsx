'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
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
  const mobileBack = getMobileBack(pathname, basePath);

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
function getMobileBack(pathname: string, basePath: string) {
  if (pathname === `${basePath}/residents/new`) return {
    href: `${basePath}/residents`,
    label: '주민 목록으로 돌아가기',
    title: '주민 등록'
  };
  if (!pathname.startsWith(`${basePath}/households/`)) return undefined;
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
