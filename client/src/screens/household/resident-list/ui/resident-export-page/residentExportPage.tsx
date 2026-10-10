'use client';

import {
  useEffect,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { getResidentExportSelectionKey } from '../../model/residentExport';
import { ResidentExportPreview } from '../_components/resident-export-preview/residentExportPreview';

/** 모바일 다운로드는 독립 주소로 제공하고 전체 번호·이름·검색어를 URL이나 저장소로 전달하지 않습니다. */
export function ResidentExportPage({
  propertyId
}: {
  propertyId: string;
}) {
  const session = useSession();
  if (!session.data) return (
    <p
      role={'status'}
    >
      다운로드 권한을 확인하고 있어요.
    </p>
  );

  return (
    <ExportSelection
      key={`${session.data.id}:${propertyId}`}
      propertyId={propertyId}
      userId={session.data.id}
    />
  );
}

/** 목록이 전달한 ID를 일시 상태로 옮기며 새로고침·직접 접근 시 다운로드 범위를 임의로 넓히지 않습니다. */
function ExportSelection({
  propertyId,
  userId
}: {
  propertyId: string;
  userId: string;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const [ids] = useState(() => client.getQueryData<string[]>(getResidentExportSelectionKey(userId, propertyId)) ?? []);
  useEffect(() => {
    client.removeQueries({
      queryKey: getResidentExportSelectionKey(userId, propertyId),
      exact: true
    });
  }, [client, userId, propertyId]);
  const onClose = () => router.replace(`/manage/${propertyId}/residents`);
  if (!ids.length) return (
    <section>
      <p>
        주민 목록에서 엑셀 다운로드를 다시 선택해주세요.
      </p>
      <Button
        variant={'outline'}
        onClick={onClose}
      >
        주민 목록
      </Button>
    </section>
  );

  return (
    <ResidentExportPreview
      propertyId={propertyId}
      residentIds={ids}
      presentation={'page'}
      onClose={onClose}
    />
  );
}
