'use client';

import {
  useRef,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  getSignupRequests,
  reviewSignupRequest,
  type SignupRequest
} from '@/features/membership-requests';
import { memberManagementError } from '@/features/member-management';
import { ListHeader } from '@/shared/ui/list-header';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { ListCard } from '@/shared/ui/list-card';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { RequestReview } from './_components/request-review/requestReview';
import styles from './joinRequestsPage.module.css';

/** 가입 신청은 전용 메뉴에서 확인하고 명부의 주민을 선택한 승인만 계정과 권한에 반영합니다. */
export function JoinRequestsPage({ propertyId, requestId }: { propertyId: string; requestId?: string }) {
  const session = useSession();
  const client = useQueryClient();
  const router = useRouter();
  const key = ['membership-requests', session.data?.id, propertyId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getSignupRequests(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [notice, setNotice] = useState('');
  const selected = query.data?.requests.find((r) => r.id === (requestId ?? selectedId));
  const close = () => requestId ? router.replace(`/manage/${propertyId}/join-requests`) : setSelectedId('');
  async function review(request: SignupRequest, resident: string | null) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      client.setQueryData(key, await reviewSignupRequest(propertyId, request, resident));
      void client.invalidateQueries({
        predicate: (q) => ['property-residents', 'property-members'].includes(String(q.queryKey[0]))
      });
      setNotice(resident ? '가입 요청을 승인했어요.' : '가입 요청을 거절했어요.'); close();
    } catch (error) { setNotice(memberManagementError(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  function open(request: SignupRequest) {
    if (window.matchMedia('(max-width: 767px)').matches) router.push(`/manage/${propertyId}/join-requests/${request.id}`);
    else setSelectedId(request.id);
  }
  if (requestId && selected) return (
    <RequestReview
      request={selected}
      presentation={'page'}
      busy={busy}
      onClose={close}
      onApprove={(id) => void review(selected, id)}
      onReject={() => void review(selected, null)}
    />
  );

  return (
    <section
      className={styles.page}
    >
      <ListHeader
        menu={'세대 관리'}
        title={'가입 요청'}
        titleId={'signup-requests-title'}
        description={'신청 계정과 실제 주민을 확인한 뒤 가입을 승인하세요.'}
        actions={(
          <Button
            className={styles['participation-link']}
            variant={'outline'}
            onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/join/${propertyId}`).then(() => setNotice('주민 참여 링크를 복사했어요.')).catch(() => setNotice('참여 링크를 복사할 수 없어요.'))}
          >
            주민 참여 링크 복사
          </Button>
        )}
      />
      {query.isPending && (
        <p
          role={'status'}
        >
          가입 요청을 불러오고 있어요.
        </p>
      )}
      {query.isError && (
        <div>
          <p
            role={'alert'}
          >
            {memberManagementError(query.error)}
          </p>
          <Button
            onClick={() => void query.refetch()}
          >
            다시 시도
          </Button>
        </div>
      )}
      {requestId && query.data && !selected && (
        <p
          role={'alert'}
        >
          가입 요청을 찾을 수 없어요.
        </p>
      )}
      {query.data && !requestId && (
        <ListCard>
          <DataTable
            label={'가입 요청 목록'}
            rows={query.data.requests}
            getRowKey={(r) => r.id}
            onRowClick={open}
            minWidth={650}
            emptyState={(
              <div
                className={styles['empty-state']}
              >
                <ServiceIcon
                  name={'users'}
                />
                <strong>
                  아직 가입 요청이 없어요
                </strong>
                <p>
                  주민 참여 링크를 공유하면 신청한 주민을 여기에서 확인할 수 있어요.
                </p>
              </div>
            )}
            columns={[
              {
                key: 'name',
                header: '신청 계정',
                rowHeader: true,
                render: (r) => r.requesterName
              },
              {
                key: 'unit',
                header: '동·호수',
                render: (r) => r.unitLabel
              },
              {
                key: 'phone',
                header: '연락처',
                render: (r) => `•••• ${r.phoneLast4}`
              },
              {
                key: 'date',
                header: '신청일',
                render: (r) => new Date(r.requestedAt).toLocaleDateString('ko-KR')
              },
              {
                key: 'status',
                header: '상태',
                render: (r) => (
                  <span
                    className={styles.status}
                    data-status={r.status}
                  >
                    {({
                      PENDING: '승인 대기',
                      APPROVED: '승인 완료',
                      REJECTED: '거절',
                      CANCELED: '취소'
                    })[r.status]}
                  </span>
                )
              }
            ]}
          />
        </ListCard>
      )}
      {!requestId && selected && (
        <RequestReview
          key={selected.id}
          request={selected}
          presentation={'modal'}
          busy={busy}
          onClose={close}
          onApprove={(id) => void review(selected, id)}
          onReject={() => void review(selected, null)}
        />
      )}
      {notice && (
        <Toast
          message={notice}
          onClose={() => setNotice('')}
        />
      )}
    </section>
  );
}

