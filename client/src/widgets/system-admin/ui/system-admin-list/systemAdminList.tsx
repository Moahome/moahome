'use client';
import {
  useState,
  type ReactNode
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  Input,
  Dropdown
} from '@/shared/ui/form-controls';
import { DataTable } from '@/shared/ui/data-table';
import { ListHeader } from '@/shared/ui/list-header';
import { Pagination } from '@/shared/ui/pagination';
import { RequestError } from '@/shared/ui/server-connection-error';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { getSystemMembers } from '../../api/systemAdminApi';
import { SystemAdminShell } from '../_components/system-admin-shell/systemAdminShell';
import { MemberEditor } from '../_components/member-editor/memberEditor';
import { getMemberStatusLabel } from '../_utils/memberStatus';
import styles from './systemAdminList.module.css';

export function SystemAdminList({ administrators = false, header }: { administrators?: boolean; header: ReactNode }) {
  return (
    <SystemAdminShell
      administrators={administrators}
      header={header}
    >
      <MemberList
        administrators={administrators}
      />
    </SystemAdminShell>
  );
}

/** 검색·페이지 조건을 URL에 유지하고 PC 상세 모달과 모바일 상세 경로를 구분합니다. */
function MemberList({ administrators }: { administrators: boolean }) {
  const session = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryText = searchParams.get('query') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const size = [10, 20, 50].includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : 20;
  const [search, setSearch] = useState(queryText);
  const [selected, setSelected] = useState('');
  const filters = {
    query: queryText,
    administrators,
    page,
    size
  };
  const query = useQuery({
    queryKey: ['system-admin-users', session.data?.id, filters],
    queryFn: ({ signal }) => getSystemMembers(filters, signal),
    retry: false,
    gcTime: 0
  });
  function navigate(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) { if (value) params.set(key, value); else params.delete(key); }
    router.push(`${administrators ? '/admin/administrators' : '/admin'}?${params}`);
  }
  return (
    <div
      className={styles.workspace}
    >
      <ListHeader
        menu={'시스템 관리'}
        title={administrators ? '관리자 목록' : '회원 관리'}
        titleId={'system-admin-title'}
        description={administrators ? '시스템 관리자로 지정된 계정을 확인합니다.' : '회원의 관리대상 생성 권한과 시스템 역할을 관리합니다.'}
      />
      <form
        className={styles.filters}
        onSubmit={(event) => { event.preventDefault(); navigate({
          query: search.trim(),
          page: '1'
        }); }}
      >
        <Input
          label={'회원 검색'}
          placeholder={'이름 또는 전체 계정 ID'}
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          type={'submit'}
        >
          검색
        </Button>
        <Dropdown
          label={'표시 개수'}
          value={String(size)}
          onChange={(value) => navigate({
            size: value,
            page: '1'
          })}
          options={[10, 20, 50].map((value) => ({
            value: String(value),
            label: `${value}명씩`
          }))}
        />
      </form>
      {query.isPending && (
        <LoadingState
          title={'회원 목록을 불러오고 있어요.'}
        />
      )}
      {query.isError && (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && (
        <section
          className={styles.card}
        >
          <DataTable
            label={administrators ? '시스템 관리자' : '회원 관리'}
            rows={query.data.users}
            getRowKey={(row) => row.id}
            minWidth={720}
            onRowClick={(row) => {
              if (window.matchMedia('(max-width: 767px)').matches) { router.push(`/admin/members/${row.id}`); return; }
              setSelected(row.id);
            }}
            emptyState={(
              <StateMessage
                layout={'inline'}
                title={'조건에 맞는 회원이 없습니다.'}
                description={'검색 조건을 확인해주세요.'}
              />
            )}
            columns={[
              {
                key: 'name',
                header: '회원 이름',
                render: (row) => row.displayName,
                rowHeader: true
              },
              {
                key: 'id',
                header: '계정 ID',
                render: (row) => (
                  <span
                    className={styles.identifier}
                  >
                    {row.id}
                  </span>
                )
              },
              {
                key: 'status',
                header: '계정 상태',
                render: (row) => getMemberStatusLabel(row.status)
              },
              {
                key: 'role',
                header: '시스템 역할',
                render: (row) => row.systemRole === 'ADMIN' ? '시스템 관리자' : '일반 회원'
              },
              {
                key: 'permission',
                header: '생성 권한',
                render: (row) => (
                  <span
                    className={styles.permission}
                    data-allowed={row.canCreateProperty}
                  >
                    {row.canCreateProperty ? '허용' : '미허용'}
                  </span>
                )
              }
            ]}
          />
          <div
            className={styles.pagination}
          >
            <Pagination
              label={'회원 목록 페이지'}
              unit={'명'}
              total={query.data.total}
              page={page}
              pageCount={query.data.pageCount}
              pageSize={size}
              onPageChange={(value) => navigate({
                page: String(value)
              })}
            />
          </div>
        </section>
      )}
      {selected && (
        <ClientModal
          className={styles.modal}
          aria-labelledby={'system-member-title'}
          onClose={() => setSelected('')}
        >
          <header
            className={styles.heading}
          >
            <h2
              id={'system-member-title'}
            >
              회원 상세
            </h2>
            <Button
              variant={'ghost'}
              iconOnly
              aria-label={'회원 상세 닫기'}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
              onClick={() => setSelected('')}
            />
          </header>
          <MemberEditor
            userId={selected}
          />
        </ClientModal>
      )}
    </div>
  );
}
