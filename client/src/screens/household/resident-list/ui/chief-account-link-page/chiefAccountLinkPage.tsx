'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { RequestError } from '@/shared/ui/server-connection-error';

import { useRouter } from 'next/navigation';
import { ChiefAccountLink } from '../_components/chief-account-link/chiefAccountLink';
import { useResidentList } from '../resident-list-page/_hooks/useResidentList';

/** 모바일 직접 접근과 새로고침에도 같은 명부를 조회하고 공통 헤더의 목록 뒤로가기를 사용합니다. */
export function ChiefAccountLinkPage({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const { list, data } = useResidentList(propertyId);
  if (list.isPending) return (
    <LoadingState
      title={'주민 명부를 불러오고 있어요.'}
    />
  );
  if (list.isError) return (
    <RequestError
      error={list.error}
      onRetry={() => void list.refetch({
        cancelRefetch: false
      })}
    />
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
