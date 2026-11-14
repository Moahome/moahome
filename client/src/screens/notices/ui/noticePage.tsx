'use client';

import { useState } from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import { Input } from '@/shared/ui/form-controls';
import { ListHeader } from '@/shared/ui/list-header';
import { ListCard } from '@/shared/ui/list-card';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { getNotices } from '../api/noticeApi';
import type { NoticeSummary } from '../model/noticeTypes';
import type { NoticePageProps } from '../model/noticeTypes';
import { NoticeArticle } from './_components/notice-article/noticeArticle';
import { NoticeAccessLink } from './_components/notice-access-link/noticeAccessLink';
import styles from './noticePage.module.css';

/** 게시글 번호는 고정 여부와 관계없이 유지하고 제목의 배지와 행 배경으로 고정를 구분합니다. */
export function NoticePage(props: NoticePageProps) {
  const search = useSearchParams();
  if (props.mode && props.mode !== 'list') {
    return (
      <section
        className={styles.page}
      >
        <NoticeArticle
          {...props}
        />
      </section>
    );
  }

  return (
    <NoticeListPage
      key={`${props.propertyId}:${search.get('query') ?? ''}`}
      propertyId={props.propertyId}
    />
  );
}

function NoticeListPage({ propertyId }: { propertyId: string }) {
  const session = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const base = `/manage/${propertyId}/notices`;
  const rawPage = Number(search.get('page') ?? '1');
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const query = search.get('query') ?? '';
  const field = search.get('field') === 'content' ? 'content' : 'title';
  const [input, setInput] = useState(query);
  const notices = useQuery({
    queryKey: ['notices', session.data?.id, propertyId, page, query, field],
    queryFn: ({ signal }) => getNotices(propertyId, page, query, field, signal),
    enabled: Boolean(session.data),
    retry: false
  });

  /** 검색과 페이지를 주소에 보관해 상세에서 돌아오거나 새로고침해도 같은 목록을 엽니다. */
  function changeSearch(nextPage: number, nextQuery = query, nextField = field) {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set('page', String(nextPage));
    if (nextQuery) params.set('query', nextQuery);
    if (nextField !== 'title') params.set('field', nextField);
    router.push(`${base}${params.size ? `?${params}` : ''}`, {
      scroll: false
    });
  }

  const columns: DataTableColumn<NoticeSummary>[] = [
    {
      key: 'number',
      header: '번호',
      width: 86,
      align: 'center',
      render: (row) => row.number
    },
    {
      key: 'title',
      header: '제목',
      rowHeader: true,
      render: (row) => (
        <span
          className={styles['notice-title']}
        >

          <span>
            {row.title}
          </span>
        </span>
      )
    },
    {
      key: 'createdAt',
      header: '작성일',
      width: 148,
      align: 'center',
      render: (row) => new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(row.createdAt))
    },
    {
      key: 'views',
      header: '조회수',
      width: 98,
      align: 'center',
      render: (row) => row.views.toLocaleString('ko-KR')
    }
  ];

  return (
    <section
      className={styles.page}
      aria-labelledby={'notices-title'}
    >
      <ListHeader
        menu={''}
        title={'공지사항'}
        titleId={'notices-title'}
        description={'건물의 공지사항을 등록하고 관리합니다.'}
        actionsClassName={styles['list-actions']}
        actions={(
          <>
            <NoticeAccessLink
              propertyId={propertyId}
            />
            <Button
              className={styles['write-button']}
              onClick={() => router.push(`${base}/new`)}
              leadingIcon={(
                <ServiceIcon
                  name={'plus'}
                />
              )}
            >
              공지 작성
            </Button>
          </>
        )}
      />
      <ListCard>
        <form
          className={styles.search}
          role={'search'}
          onSubmit={(event) => {
            event.preventDefault();
            changeSearch(1, input.trim(), 'title');
          }}
        >
          <Input
            aria-label={'공지 제목 검색'}
            placeholder={'공지 제목 검색'}
            value={input}
            maxLength={100}
            onChange={(event) => setInput(event.target.value)}
            leadingIcon={(
              <ServiceIcon
                name={'search'}
              />
            )}
          />
          <Button
            type={'submit'}
            variant={'outline'}
          >
            검색
          </Button>
        </form>
        {notices.isPending && (
          <LoadingState
            title={'공지사항을 불러오고 있어요.'}
          />
        )}
        {notices.isError && (
          <RequestError
            error={notices.error}
            retrying={notices.isFetching}
            onRetry={() => void notices.refetch()}
          />
        )}
        {notices.data && !notices.isError && (
          <>
            <ListToolbar
              total={notices.data.total}
              unit={'건'}
              pageSize={10}
              sizeLabel={'공지 표시 개수'}
            />
            <DataTable
              label={'공지사항'}
              className={styles.board}
              rows={notices.data.items}
              columns={columns}
              getRowKey={(row) => row.id}
              getRowClassName={(row) => row.important ? styles['important-row'] : undefined}
              minWidth={0}
              onRowClick={(row) => router.push(`${base}/${row.id}`)}
              emptyState={(
                <StateMessage
                  variant={query ? 'no-results' : 'empty-notice'}
                  layout={'inline'}
                />
              )}
            />
            <Pagination
              showCount={false}
              label={'공지사항 페이지'}
              unit={'건'}
              total={notices.data.total}
              page={page}
              pageCount={notices.data.pageCount}
              pageSize={10}
              onPageChange={(next) => changeSearch(next)}
            />
          </>
        )}
      </ListCard>
    </section>
  );
}
