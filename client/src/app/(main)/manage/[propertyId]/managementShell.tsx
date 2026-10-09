'use client';

import type { ReactNode } from 'react';
import { ManagementLayout } from '@/widgets/management-layout';
import { ServiceHeader } from '@/widgets/service-header';

/** 라우터 경계에서 두 위젯을 조합해 같은 레이어 간 직접 참조 없이 헤더 슬롯을 연결합니다. */
export function ManagementShell({ propertyId, children }: { propertyId: string; children: ReactNode }) {
  return (
    <ManagementLayout
      propertyId={propertyId}
      header={({ mobileContent }) => (
        <ServiceHeader
          homeHref={`/manage/${propertyId}/dashboard`}
          homeLabel={'대시보드'}
          mobileContent={mobileContent}
        />
      )}
    >
      {children}
    </ManagementLayout>
  );
}
