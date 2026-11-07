'use client';

import { useState } from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  ACCOUNT_GROUP_LABELS,
  getAccountingAccounts,
  getAccountType,
  type AccountingAccountSetting
} from '@/features/accounting-accounts';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { ListCard } from '@/shared/ui/list-card';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { FilterTabs } from '@/shared/ui/filter-tabs';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { RequestError } from '@/shared/ui/server-connection-error';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { Toast } from '@/shared/ui/toast';
import { AccountEditor } from './_components/account-editor/accountEditor';
import styles from './accountingAccountsPage.module.css';

/** 서버의 권한·과목 목록을 기준으로 검색·분류·페이지 이동을 제공하고 변경 후 관련 조회를 갱신합니다. */
export function AccountingAccountsPage({ propertyId }: { propertyId: string }) {
  const session = useSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['accounting-accounts', session.data?.id, propertyId],
    queryFn: ({ signal }) => getAccountingAccounts(propertyId, signal),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [search, setSearch] = useState('');
  const [type, setType] = useState('전체');
  const [status, setStatus] = useState('all');
  const [pageSize, setPageSize] = useState(10);
  const [requestedPage, setPage] = useState(1);
  const [selection, setSelection] = useState<{ account: AccountingAccountSetting | null } | null>(null);
  const [saved, setSaved] = useState(false);
  const accounts = query.data?.accounts ?? [];
  const keyword = search.trim().toLocaleLowerCase('ko');
  const filtered = accounts.filter((row) => (!keyword || `${row.code} ${row.name}`.toLocaleLowerCase('ko').includes(keyword))
    && (type === '전체' || getAccountType(row.group) === type)
    && (status === 'all' || row.active === (status === 'active')));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(requestedPage, pageCount);

  /** 목록뿐 아니라 기존 지출 선택과 손익·원장의 표시명·선택 목록도 다음 조회에서 함께 갱신합니다. */
  async function onSaved() {
    setSelection(null);
    setSaved(true);
    await Promise.all(['accounting-accounts', 'income-statement', 'account-ledger', 'banking-workspace', 'payables'].map((key) => cache.invalidateQueries({
      queryKey: [key, session.data?.id, propertyId]
    })));
  }

  if (query.isPending) return (
    <LoadingState
      title={'계정과목을 불러오고 있어요.'}
    />
  );
  if (query.isError) return (
    <RequestError
      error={query.error}
      retrying={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  );

  return (
    <section
      className={styles.page}
      aria-labelledby={'accounts-title'}
    >
      <ListHeader
        menu={'회계·정산'}
        title={'계정과목 설정'}
        titleId={'accounts-title'}
        description={'관리대상에 사용할 계정과목과 사용 상태를 관리합니다.'}
        actions={query.data?.canManage && !query.isError && (
          <Button
            leadingIcon={(
              <ServiceIcon
                name={'plus'}
              />
            )}
            onClick={() => setSelection({
              account: null
            })}
          >
            과목 추가
          </Button>
        )}
      />
      {query.data && (
        <ListCard>
          <div
            className={styles.list}
          >
            <FilterTabs
              label={'계정과목 사용 상태'}
              value={status}
              onChange={(value) => { setStatus(value); setPage(1); }}
              items={[
                {
                  value: 'all',
                  label: '전체',
                  count: accounts.length
                },
                {
                  value: 'active',
                  label: '사용 중',
                  count: accounts.filter((row) => row.active).length
                },
                {
                  value: 'inactive',
                  label: '사용 중지',
                  count: accounts.filter((row) => !row.active).length
                }
              ]}
            />
            <div
              className={styles.filters}
            >
              <Input
                aria-label={'코드·과목명 검색'}
                placeholder={'코드 또는 과목명 검색'}
                value={search}
                leadingIcon={(
                  <ServiceIcon
                    name={'search'}
                  />
                )}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              />
              <Dropdown
                aria-label={'계정 유형'}
                value={type}
                options={['전체', '자산', '부채', '수익', '비용'].map((value) => ({
                  value,
                  label: value === '전체' ? '전체 유형' : value
                }))}
                onChange={(value) => { setType(value); setPage(1); }}
              />
            </div>
            <ListToolbar
              total={filtered.length}
              unit={'개'}
              sizeLabel={'계정과목 표시 개수'}
              pageSize={pageSize}
              onSizeChange={(value) => { setPageSize(value); setPage(1); }}
            />
            <DataTable
              label={'계정과목 목록'}
              rows={filtered.slice((page - 1) * pageSize, page * pageSize)}
              getRowKey={(row) => row.id}
              onRowClick={(account) => setSelection({
                account
              })}
              minWidth={720}
              columns={[
                {
                  key: 'code',
                  header: '코드',
                  width: 100,
                  render: (row) => (
                    <span
                      className={styles.code}
                    >
                      {row.code}
                    </span>
                  )
                },
                {
                  key: 'name',
                  header: '과목명',
                  rowHeader: true,
                  render: (row) => row.name
                },
                {
                  key: 'type',
                  header: '유형',
                  render: (row) => getAccountType(row.group)
                },
                {
                  key: 'group',
                  header: '손익 분류',
                  render: (row) => ['ASSET', 'LIABILITY'].includes(row.group) ? '—' : ACCOUNT_GROUP_LABELS[row.group]
                },
                {
                  key: 'source',
                  header: '제공 구분',
                  render: (row) => row.defaultAccount ? '기본 제공' : '직접 추가'
                },
                {
                  key: 'status',
                  header: '사용 상태',
                  render: (row) => (
                    <span
                      className={styles.status}
                      data-active={row.active}
                    >
                      {row.active ? '사용 중' : '사용 중지'}
                    </span>
                  )
                }
              ]}
              emptyState={(
                <StateMessage
                  variant={accounts.length ? 'no-results' : 'empty-data'}
                  layout={'inline'}
                  description={'검색어나 필터를 확인해주세요.'}
                />
              )}
            />
            <Pagination
              label={'계정과목 페이지'}
              unit={'개'}
              total={filtered.length}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageChange={setPage}
            />
            <p
              className={styles.notice}
            >
              {query.data.canManage ? '과목을 선택하면 상세 정보와 변경 이력을 확인할 수 있습니다.' : '계정과목은 조회만 가능합니다. 설정 변경은 담당자에게 요청해주세요.'}
            </p>
          </div>
        </ListCard>
      )}
      {selection && !query.isError && query.data && (
        <AccountEditor
          propertyId={propertyId}
          account={selection.account}
          canManage={query.data.canManage}
          onClose={() => setSelection(null)}
          onSaved={onSaved}
        />
      )}
      {saved && (
        <Toast
          message={'계정과목을 저장했어요.'}
          onClose={() => setSaved(false)}
        />
      )}
    </section>
  );
}
