'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/button';
import { ChiefAccountLink } from '../_components/chief-account-link/chiefAccountLink';
import { useResidentList } from '../resident-list-page/_hooks/useResidentList';
import { getResidentListError } from '../../model/residentList';

/** 모바일 직접 접근과 새로고침에도 같은 명부를 조회하고 공통 헤더의 목록 뒤로가기를 사용합니다. */
export function ChiefAccountLinkPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const { list, data } = useResidentList(propertyId);
  if (list.isPending) return (
    <p
      role={'status'}
    >
      주민 명부를 불러오고 있어요.
    </p>
  );
  if (list.isError) return (
    <div
      role={'alert'}
    >
      <p>
        {getResidentListError(list.error)}
      </p>
      <Button
        variant={'outline'}
        onClick={() => void list.refetch()}
      >
        다시 시도
      </Button>
    </div>
  );

  return (
    <ChiefAccountLink
      propertyId={propertyId}
      data={data}
      presentation={'page'}
      onClose={() => router.replace(`/manage/${propertyId}/residents`)}
      onLinked={() => router.replace(`/manage/${propertyId}/residents?accountLinked=true`)}
    />
  );
}
