'use client';

import { useRouter } from 'next/navigation';
import { ResidentDetails } from '@/features/resident-management';

/** 모바일 상세는 모달 없이 독립 주소에서 공통 상세·수정·삭제를 조합합니다. 권한은 각 서버 요청에서 확인합니다. */
export function ResidentDetailPage({ propertyId, residentId }: { propertyId: string; residentId: string }) {
  const router = useRouter();
  const listPath = `/manage/${propertyId}/residents`;

  return (
    <ResidentDetails
      propertyId={propertyId}
      residentId={residentId}
      presentation={'page'}
      onClose={() => router.replace(listPath)}
      onDeleted={() => router.replace(`${listPath}?deleted=1`)}
    />
  );
}
