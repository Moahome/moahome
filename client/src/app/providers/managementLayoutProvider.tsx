'use client';

import { useManagementMobileBack } from './_hooks/useManagementMobileBack';

import type { ReactNode } from 'react';
import { useSession } from '@/entities/session';
import {
  ReportDownloadProvider,
  ReportDownloadModal
} from '@/shared/ui/report-download';
import { ManagementLayout } from '@/widgets/management-layout';
import { ServiceHeader } from '@/widgets/service-header';

/** 라우터 경계에서 두 위젯을 조합해 같은 레이어 간 직접 참조 없이 헤더 슬롯을 연결합니다. */
export function ManagementLayoutProvider({
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
      <ManagementLayoutContent
        propertyId={propertyId}
      >
        {children}
      </ManagementLayoutContent>
    </ReportDownloadProvider>
  );
}

function ManagementLayoutContent({
  propertyId,
  children
}: { propertyId: string;
children: ReactNode }) {
  const mobileBack = useManagementMobileBack(propertyId);

  return (
    <ManagementLayout
      propertyId={propertyId}
      header={({
        mobileContent
      }) => (
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
