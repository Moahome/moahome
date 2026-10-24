'use client';

import { StateMessage } from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';

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
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import {
  Input,
  Dropdown
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { RequestReview } from './_components/request-review/requestReview';
import styles from './approvalManagementPage.module.css';
import { InvitationCorrections } from './_components/invitation-corrections/invitationCorrections';

/** 실제 신청만 승인 관리에서 검색·페이지로 나누어 확인하고 명부의 주민을 선택한 승인만 계정과 권한에 반영합니다. */
export function ApprovalManagementPage({
  propertyId,
  requestId
}: {
  propertyId: string;
  requestId?: string;
}) {
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
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filtered = (query.data?.requests ?? []).filter((row) => (status === 'ALL' || row.status === status)
    && `${row.requesterName} ${row.applicantName ?? ''} ${row.unitLabel} ${row.phoneLast4 ?? ''} ${row.candidates.map((candidate) => candidate.name).join(' ')}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [notice, setNotice] = useState('');
  const selected = query.data?.requests.find((r) => r.id === (requestId ?? selectedId));
  const close = () => requestId ? router.replace(`/manage/${propertyId}/invitations`) : setSelectedId('');
  /** 실제 신청을 검토한 성공 결과만 반영하고 미연결 명부도 함께 갱신합니다. */
  async function review(request: SignupRequest, resident: string | null) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      client.setQueryData(key, await reviewSignupRequest(propertyId, request, resident));
      void client.invalidateQueries({
        predicate: (q) => ['property-residents', 'property-members', 'unlinked-residents'].includes(String(q.queryKey[0]))
      });
      setNotice(resident ? '가입 요청을 승인했어요.' : '가입 요청을 거절했어요.');
      close();
    } catch (error) {
      setNotice(memberManagementError(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  /** 모바일은 헤더 뒤로가기가 있는 상세로, PC는 동일 목록 위 확인 모달로 이동합니다. */
  function open(request: SignupRequest) {
    if (window.matchMedia('(max-width: 767px)').matches) router.push(`/manage/${propertyId}/invitations/${request.id}`);
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
        title={'승인 관리'}
        titleId={'signup-requests-title'}
        description={'신청 계정과 실제 주민을 확인한 뒤 가입을 승인하세요.'}

      />
      {query.isPending && (
        <p
          role={'status'}
        >
          가입 요청을 불러오고 있어요.
        </p>
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch({
            cancelRefetch: false
          })}
        />
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
          <div
            className={styles.filters}
          >
            <Input
              aria-label={'가입 신청 검색'}
              placeholder={'신청 계정·주민 이름·동·호수·연락처 끝 4자리 검색'}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              leadingIcon={(
                <ServiceIcon
                  name={'search'}
                />
              )}
            />
            <Dropdown
              aria-label={'신청 상태 필터'}
              value={status}
              options={[
                {
                  value: 'ALL',
                  label: '전체 상태'
                },
                {
                  value: 'PENDING',
                  label: '승인 대기'
                },
                {
                  value: 'APPROVED',
                  label: '승인 완료'
                },
                {
                  value: 'REJECTED',
                  label: '거절'
                },
                {
                  value: 'CANCELED',
                  label: '취소'
                }
              ]}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
            <Button
              variant={'outline'}
              leadingIcon={(
                <ServiceIcon
                  name={'reset'}
                />
              )}
              disabled={!search && status === 'ALL'}
              onClick={() => {
                setSearch('');
                setStatus('ALL');
                setPage(1);
              }}
            >
              초기화
            </Button>
          </div>
          <ListToolbar
            total={filtered.length}
            unit={'건'}
            sizeLabel={'페이지당 가입 신청 수'}
            pageSize={pageSize}
            onSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
          <DataTable
            label={'가입 요청 목록'}
            rows={rows}
            getRowKey={(r) => r.id}
            onRowClick={open}
            minWidth={650}
            emptyState={(
              <StateMessage
                variant={search.trim() || status !== 'ALL' ? 'no-results' : 'empty-data'}
                layout={'inline'}
                title={search.trim() || status !== 'ALL' ? '검색 조건에 맞는 가입 요청이 없어요' : '아직 가입 요청이 없어요'}
                description={search.trim() || status !== 'ALL' ? '검색어나 필터를 변경해주세요.' : '주민 참여 링크를 공유하면 신청한 주민을 여기에서 확인할 수 있어요.'}
              />
            )}
            columns={[
              {
                key: 'name',
                header: '신청 이름',
                rowHeader: true,
                render: (r) => r.applicantName ?? r.requesterName
              },
              {
                key: 'unit',
                header: '동·호수',
                render: (r) => r.unitLabel
              },
              {
                key: 'phone',
                header: '연락처',
                render: (r) => r.phoneLast4 ? `•••• ${r.phoneLast4}` : '미등록'
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
          <Pagination
            label={'승인 관리 페이지'}
            unit={'건'}
            total={filtered.length}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </ListCard>
      )}
      {!requestId && (
        <InvitationCorrections
          key={`${search}:${status}`}
          propertyId={propertyId}
          search={search}
          status={status}
        />
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
