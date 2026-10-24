'use client';

import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { RequestError } from '@/shared/ui/server-connection-error';

import {
  useState,
  useRef
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useManagementContext } from '@/features/enter-service';
import {
  issueResidentInvitation,
  openResidentInvitation,
  getResidentInvitations,
  reviewResidentInvitation,
  memberManagementError,
  type ResidentInvitationShare,
  type ResidentInvitation
} from '@/features/member-management';
import { InvitationShare } from './_components/invitation-share/invitationShare';
import { InvitationMenu } from './_components/invitation-menu/invitationMenu';
import { useSession } from '@/entities/session';
import {
  getSortedBuildings,
  getSortedUnits
} from '@/entities/property';
import { RESIDENT_RELATION_OPTIONS } from '@/entities/resident';
import {
  getUnlinkedResidents,
  type UnlinkedResident
} from '@/features/membership-requests';
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
import styles from './joinRequestsPage.module.css';

/** 계정 미연결 주민 전원을 검색·페이지로 나누며 실제 신청 여부를 추측해 승인 상태로 표시하지 않습니다. */
export function JoinRequestsPage({
  propertyId
}: {
  propertyId: string;
}) {
  const session = useSession();
  const client = useQueryClient();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const invitations = useQuery({
    queryKey: ['resident-invitations', session.data?.id, propertyId],
    queryFn: () => getResidentInvitations(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [issued, setIssued] = useState<{ value: ResidentInvitationShare; name: string; personal: boolean; resident?: UnlinkedResident } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const canIssue = Boolean(context.data);
  const query = useQuery({
    queryKey: ['unlinked-residents', session.data?.id, propertyId],
    queryFn: () => getUnlinkedResidents(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [search, setSearch] = useState('');
  const [relation, setRelation] = useState('ALL');
  const [building, setBuilding] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [notice, setNotice] = useState('');
  // 주민 목록과 같은 공용 정렬로 동·호수를 먼저 정렬하고 같은 세대는 이름·ID로 안정적으로 표시합니다.
  const byName = [...(query.data?.residents ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'ko')
    || left.residentId.localeCompare(right.residentId));
  const buildingNames = [...new Set(byName.flatMap((row) => row.buildingName === null ? [] : [row.buildingName]))];
  const buildings = getSortedBuildings(buildingNames.map((name) => ({
    clientId: name,
    name
  })));
  // 명부 갱신으로 선택한 동이 사라지면 숨겨진 필터가 목록을 계속 가리지 않도록 전체 동으로 표시합니다.
  const selectedBuilding = buildingNames.includes(building) ? building : '';
  const hasFilters = Boolean(search || relation !== 'ALL' || selectedBuilding);
  const sorted = [
    ...getSortedUnits(byName.filter((row) => row.unitNumber !== null).map((row) => ({
      ...row,
      buildingClientId: row.buildingName,
      unitNumber: row.unitNumber!
    })), buildings, buildings.length > 0),
    ...byName.filter((row) => row.unitNumber === null)
  ];
  const filtered = sorted.filter((row) => (relation === 'ALL' || row.relationType === relation)
    && (!selectedBuilding || row.buildingName === selectedBuilding)
    && `${row.name} ${row.phoneLast4 ?? ''} ${unitLabel(row)}`.toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** 실제 발급이 성공한 뒤에만 코드를 표시하며 개인 초대는 선택한 주민 ID로 서버에서 검증합니다. */
  async function issue(resident?: UnlinkedResident) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const value = await issueResidentInvitation(propertyId, resident?.residentId);

      setIssued({
        value,
        name: resident?.name ?? '주민',
        personal: Boolean(resident),
        resident
      });
      void invitations.refetch();
    } catch (failure) { setNotice(memberManagementError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  /** 다시 열기는 재발급과 분리해 기존 전달 링크와 최초 만료 시각을 유지합니다. */
  async function open(resident: UnlinkedResident, invitation: ResidentInvitation) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const value = await openResidentInvitation(propertyId, invitation.id);
      setIssued({
        value,
        name: resident.name,
        personal: true,
        resident
      });
    } catch (failure) { setNotice(memberManagementError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function revoke(invitation: ResidentInvitation) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      client.setQueryData(['resident-invitations', session.data?.id, propertyId], await reviewResidentInvitation(propertyId, invitation.id, invitation.revision, 'revoke'));
      setNotice('개인 초대를 철회했어요.');
    } catch (failure) { setNotice(memberManagementError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }

  return (
    <section
      className={styles.page}
      aria-labelledby={'signup-requests-title'}
    >
      <ListHeader
        menu={'세대 관리'}
        title={'가입 요청'}
        titleId={'signup-requests-title'}
        description={'미연결 주민에게 개인 초대를 보내거나 전체 주민용 초대코드를 발급하세요.'}
        actions={canIssue && (
          <div
            className={styles['header-actions']}
          >
            <Button
              className={styles['participation-link']}
              variant={'outline'}
              disabled={busy}
              onClick={() => void issue()}
            >
              전체 초대코드 발급
            </Button>

          </div>
        )}
      />
      {query.isPending && (
        <LoadingState
          title={'미연결 주민을 불러오고 있어요.'}
        />
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch({
            cancelRefetch: false
          })}
        />
      )}

      {query.data && (
        <ListCard>
          <div
            className={styles.filters}
            data-has-buildings={buildings.length > 0}
          >
            <Input
              aria-label={'미연결 주민 검색'}
              placeholder={'이름·연락처 끝 4자리·동·호수 검색'}
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
            {buildings.length > 0 && (
              <Dropdown
                aria-label={'동 필터'}
                value={selectedBuilding}
                options={[{
                  value: '',
                  label: '전체 동'
                }, ...buildings.map((item) => ({
                  value: item.name,
                  label: item.name
                }))]}
                onChange={(value) => {
                  setBuilding(value);
                  setPage(1);
                }}
              />
            )}
            <Dropdown
              aria-label={'주민 구분 필터'}
              value={relation}
              options={[{
                value: 'ALL',
                label: '전체 주민 구분'
              }, ...RESIDENT_RELATION_OPTIONS]}
              onChange={(value) => {
                setRelation(value);
                setPage(1);
              }}
            />
            <Button
              variant={'outline'}
              disabled={!hasFilters}
              onClick={() => {
                setSearch('');
                setRelation('ALL');
                setBuilding('');
                setPage(1);
              }}
              leadingIcon={(
                <ServiceIcon
                  name={'reset'}
                />
              )}
            >
              초기화
            </Button>
          </div>
          <ListToolbar
            total={filtered.length}
            unit={'명'}
            sizeLabel={'페이지당 미연결 주민 수'}
            pageSize={pageSize}
            onSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
          <DataTable
            label={'미연결 주민 목록'}
            rows={rows}
            getRowKey={(row) => row.residentId}
            minWidth={800}
            emptyState={(
              <StateMessage
                variant={hasFilters ? 'no-results' : 'empty-data'}
                layout={'inline'}
                title={hasFilters ? '검색 조건에 맞는 주민이 없어요' : '미연결 주민이 없어요'}
                description={hasFilters ? '검색어나 필터를 변경해주세요.' : '등록된 주민 중 계정이 연결되지 않은 주민이 여기에 표시됩니다.'}
              />
            )}
            columns={[
              {
                key: 'name',
                header: '이름',
                rowHeader: true,
                render: (row) => row.name
              },
              {
                key: 'unit',
                header: '동·호수',
                render: unitLabel
              },
              {
                key: 'relation',
                header: '주민 구분',
                render: (row) => RESIDENT_RELATION_OPTIONS.find((option) => option.value === row.relationType)?.label ?? '—'
              },
              {
                key: 'phone',
                header: '연락처',
                render: (row) => row.phoneLast4 ? `•••• ${row.phoneLast4}` : '미등록'
              },
              {
                key: 'status',
                header: '연결 상태',
                render: () => (
                  <span
                    className={styles.status}
                  >
                    미연결
                  </span>
                )
              },
              {
                key: 'invite',
                header: '개인 초대',
                render: (row) => {
                  if (!canIssue) return '관리소장 발급';
                  const current = invitations.data?.invitations.find((item) => item.residentId === row.residentId && ['ISSUED', 'CHANGE_REQUESTED'].includes(item.status));
                  return (
                    <InvitationMenu
                      name={row.name}
                      active={Boolean(current)}
                      reviewing={current?.status === 'CHANGE_REQUESTED'}
                      disabled={busy || row.unitNumber === null}
                      onOpen={() => { if (current) void open(row, current); }}
                      onIssue={() => void issue(row)}
                      onRevoke={() => { if (current) void revoke(current); }}
                    />
                  );
                }
              }
            ]}
          />
          <Pagination
            label={'미연결 주민 페이지'}
            unit={'명'}
            total={filtered.length}
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </ListCard>
      )}
      {issued && (
        <InvitationShare
          key={issued.value.id}
          issued={issued.value}
          onRestored={() => { void invitations.refetch(); }}
          name={issued.name}
          personal={issued.personal}
          propertyId={propertyId}
          onClose={() => setIssued(null)}
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

/** 현재 세대가 없는 주민도 목록에서 제외하지 않고 소속 없음으로 구분합니다. */
function unitLabel(resident: UnlinkedResident) {
  if (resident.unitNumber === null) return '소속 없음';

  return `${resident.buildingName ? `${resident.buildingName} ` : ''}${resident.unitNumber}호`;
}
