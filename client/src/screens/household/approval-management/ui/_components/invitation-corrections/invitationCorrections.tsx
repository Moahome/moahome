'use client';

import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';

import {
  useRef,
  useState
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { useManagementContext } from '@/features/enter-service';
import {
  getResidentInvitations,
  reviewResidentInvitation,
  memberManagementError,
  type ResidentInvitation
} from '@/features/member-management';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { ListCard } from '@/shared/ui/list-card';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import styles from './invitationCorrections.module.css';

/** 개인 초대의 정정 대기는 기존 일반 신청과 출처를 구분하고 명부 수정 권한이 있는 관리자만 검토합니다. */
export function InvitationCorrections({ propertyId, search, status }: { propertyId: string; search: string; status: string }) {
  const session = useSession();
  const client = useQueryClient();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const key = ['resident-invitations', session.data?.id, propertyId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getResidentInvitations(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const rows = (query.data?.invitations ?? []).filter((row) => ['CHANGE_REQUESTED', 'APPROVED', 'REJECTED'].includes(row.status)
    && (status === 'ALL' || (status === 'PENDING' ? row.status === 'CHANGE_REQUESTED' : row.status === status))
    && `${row.name} ${row.requestedName ?? ''} ${row.unitLabel} ${row.phoneLast4 ?? ''} ${row.requestedPhoneLast4 ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  async function review(row: ResidentInvitation, action: 'approve' | 'reject') {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice('');
    try {
      client.setQueryData(key, await reviewResidentInvitation(propertyId, row.id, row.revision, action));
      void client.invalidateQueries({
        predicate: (q) => ['property-residents', 'property-units', 'unlinked-residents'].includes(String(q.queryKey[0]))
      });
      setNotice(action === 'approve' ? '명부를 정정하고 주민 가입을 승인했어요.' : '정정 요청을 거절했어요. 명부는 변경하지 않았습니다.');
    } catch (failure) { setNotice(memberManagementError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  if (query.isPending) return (
    <LoadingState
      title={'개인 초대 요청을 불러오고 있어요.'}
    />
  );
  if (query.isError) return (
    <RequestError
      error={query.error}
      onRetry={() => void query.refetch({
        cancelRefetch: false
      })}
    />
  );
  return (
    <ListCard>
      <h2
        className={styles.title}
      >
        개인 초대 가입·정정
      </h2>
      <ListToolbar
        total={rows.length}
        unit={'건'}
        sizeLabel={'페이지당 개인 초대 요청 수'}
        pageSize={size}
        onSizeChange={(value) => { setSize(value); setPage(1); }}
      />
      <DataTable
        label={'개인 초대 승인 목록'}
        rows={rows.slice((current - 1) * size, current * size)}
        getRowKey={(row) => row.id}
        minWidth={850}
        emptyState={(
          <StateMessage
            variant={search.trim() || status !== 'ALL' ? 'no-results' : 'empty-data'}
            layout={'inline'}
            title={'개인 초대 가입·정정 내역이 없어요.'}
          />
        )}
        columns={[
          {
            key: 'name',
            header: '명부 이름',
            rowHeader: true,
            render: (row) => row.name
          },
          {
            key: 'unit',
            header: '동·호수',
            render: (row) => row.unitLabel
          },
          {
            key: 'new-name',
            header: '정정 요청 이름',
            render: (row) => row.requestedName ?? '—'
          },
          {
            key: 'phone',
            header: '연락처',
            render: (row) => row.phoneLast4 ? `•••• ${row.phoneLast4}` : '미등록'
          },
          {
            key: 'new-phone',
            header: '정정 요청 연락처',
            render: (row) => row.phoneAction === 'SET' ? `•••• ${row.requestedPhoneLast4}` : row.phoneAction === 'REMOVE' ? '연락처 없음' : '유지'
          },
          {
            key: 'status',
            header: '상태',
            render: (row) => ({
              CHANGE_REQUESTED: '정정 승인 대기',
              APPROVED: '가입 완료',
              REJECTED: '거절',
              ISSUED: '발급',
              EXPIRED: '만료',
              REVOKED: '철회'
            })[row.status]
          },
          {
            key: 'actions',
            header: '처리',
            render: (row) => {
              if (row.status !== 'CHANGE_REQUESTED') return '—';
              if (!context.data) return '권한 확인 중';
              return (
                <div
                  className={styles.actions}
                >
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    disabled={busy}
                    onClick={() => void review(row, 'approve')}
                  >
                    정정 후 가입 승인
                  </Button>
                  <Button
                    size={'sm'}
                    variant={'outline'}
                    tone={'danger'}
                    disabled={busy}
                    onClick={() => void review(row, 'reject')}
                  >
                    거절
                  </Button>
                </div>
              );
            }
          }
        ]}
      />
      <Pagination
        label={'개인 초대 승인 페이지'}
        unit={'건'}
        total={rows.length}
        page={current}
        pageCount={pages}
        pageSize={size}
        onPageChange={setPage}
      />
      {notice && (
        <p
          role={'status'}
        >
          {notice}
        </p>
      )}
    </ListCard>
  );
}
