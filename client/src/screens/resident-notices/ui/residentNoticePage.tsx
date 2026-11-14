'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition
} from 'react';
import {
  useRouter,
  useSearchParams
} from 'next/navigation';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  NoticeAttachments,
  NoticeEditor
} from '@/entities/notice';
import { ApiError } from '@/shared/api';
import { goBackToRoute } from '@/shared/lib/navigation-history';
import { BrandMark } from '@/shared/ui/brand-mark';
import { Button } from '@/shared/ui/button';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import { Input } from '@/shared/ui/form-controls';
import { ListCard } from '@/shared/ui/list-card';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import { RequestError } from '@/shared/ui/server-connection-error';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import {
  exchangeNoticeLink,
  getResidentNoticeContext,
  getResidentNotice,
  getResidentNotices,
  readResidentNoticeAsset
} from '../api/residentNoticeApi';
import type { ResidentNoticeSummary } from '../api/residentNoticeApiTypes';
import { NoticeBanner } from './_components/notice-banner/noticeBanner';
import styles from './residentNoticePage.module.css';

const DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** 주민 화면은 관리자 레이아웃과 세션 복원을 사용하지 않으며 링크의 건물 범위를 먼저 확인합니다. */
export function ResidentNoticePage({ propertyId, noticeId }: { propertyId?: string; noticeId?: string }) {
  const router = useRouter();
  const base = `/notices/${propertyId}`;
  const context = useQuery({
    queryKey: ['resident-notices', 'context'],
    queryFn: ({ signal }) => getResidentNoticeContext(signal),
    enabled: Boolean(propertyId),
    retry: false,
    gcTime: 0,
    refetchInterval: 30_000
  });
  function returnToList() {
    if (!goBackToRoute(base, (href) => router.replace(href))) router.push(base);
  }
  const permitted = Boolean(propertyId && context.data?.propertyId === propertyId && !context.isError);
  /** 진입과 읽기 오류를 먼저 처리해 허용되지 않은 본문을 렌더링하지 않습니다. */
  function renderContent() {
    if (!propertyId) return (
      <NoticeEntrance />
    );
    if (context.isPending) return (
      <LoadingState />
    );
    if (context.isError) return (
      <ResidentNoticeError
        error={context.error}
        onRetry={() => void context.refetch()}
      />
    );
    if (!permitted) return (
      <StateMessage
        variant={'forbidden'}
        title={'이 링크로 열람할 수 없는 건물이에요'}
        description={'관리사무소에서 안내받은 링크로 다시 접속해주세요.'}
      />
    );
    if (noticeId) return (
      <ResidentNoticeArticle
        key={noticeId}
        propertyId={propertyId}
        noticeId={noticeId}
        onBack={returnToList}
      />
    );
    return (
      <ResidentNoticeList
        propertyId={propertyId}
      />
    );
  }
  return (
    <div
      className={styles.page}
    >
      <div
        className={styles.shell}
      >
        <header
          className={styles.header}
        >
          {noticeId && permitted && (
            <Button
              className={styles['mobile-back']}
              variant={'ghost'}
              iconOnly
              aria-label={'공지사항 목록'}
              onClick={returnToList}
            >
              <ServiceIcon
                name={'arrow'}
                size={20}
                style={{
                  transform: 'rotate(180deg)'
                }}
              />
            </Button>
          )}
          <div
            className={styles.brand}
          >
            <BrandMark />
            <strong>
              모아홈
            </strong>
          </div>
          <nav
            className={styles.navigation}
            aria-label={'주민 메뉴'}
          >
            <span
              aria-current={'page'}
            >
              공지사항
            </span>
          </nav>
          {permitted && (
            <span
              className={styles.property}
            >
              {context.data?.name}
            </span>
          )}
        </header>
        <main
          className={styles.main}
        >
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

/** 링크의 토큰을 주소에서 지우고 자동 교환해 별도 확인 화면 없이 공지 목록을 엽니다. */
function NoticeEntrance() {
  const router = useRouter();
  const cache = useQueryClient();
  const captured = useRef(false);
  const [entry, setEntry] = useState<{ ready: boolean; token: string }>({
    ready: false,
    token: ''
  });
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    window.history.replaceState(window.history.state, '', window.location.pathname);
    startTransition(() => setEntry({
      ready: true,
      token
    }));
  }, []);
  const context = useQuery({
    queryKey: ['resident-notices', 'entrance'],
    /** 재사용 가능한 링크를 POST로 교환하며 응답 유실에도 같은 메모리 토큰으로 재시도합니다. */
    queryFn: async () => {
      if (entry.token) {
        await exchangeNoticeLink(entry.token);
        // 진행 중인 자동 진입 조회는 유지하고 이전 건물의 주민 캐시만 지웁니다.
        cache.removeQueries({
          queryKey: ['resident-notices'],
          predicate: (query) => query.queryKey[1] !== 'entrance'
        });
      }
      return getResidentNoticeContext();
    },
    enabled: entry.ready,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0
  });
  useEffect(() => {
    if (context.data) router.replace(`/notices/${context.data.propertyId}`);
  }, [context.data, router]);
  if (context.isError) return (
    <ResidentNoticeError
      error={context.error}
      onRetry={() => void context.refetch()}
    />
  );
  return (
    <LoadingState
      title={'공지사항을 불러오고 있어요.'}
    />
  );
}

function ResidentNoticeError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (!error || (error instanceof ApiError && error.status === 401)) return (
    <StateMessage
      variant={'forbidden'}
      title={'안내받은 링크로 접속해주세요'}
      description={'링크가 회수되었거나 열람 시간이 지났을 수 있어요. 관리사무소에서 받은 링크를 다시 열어주세요.'}
    />
  );
  return (
    <RequestError
      error={error}
      onRetry={onRetry}
    />
  );
}

function ResidentNoticeList({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const rawPage = Number(search.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000 ? rawPage : 1;
  const query = search.get('query') ?? '';
  return (
    <ResidentNoticeListContent
      key={`${propertyId}:${query}:${page}`}
      propertyId={propertyId}
      page={page}
      query={query}
      onNavigate={(nextPage, nextQuery) => {
        const params = new URLSearchParams();
        if (nextPage > 1) params.set('page', String(nextPage));
        if (nextQuery) params.set('query', nextQuery);
        router.push(`/notices/${propertyId}${params.size ? `?${params}` : ''}`, {
          scroll: false
        });
      }}
    />
  );
}

function ResidentNoticeListContent({ propertyId, page, query, onNavigate }: {
  propertyId: string; page: number; query: string; onNavigate: (page: number, query: string) => void;
}) {
  const router = useRouter();
  const [input, setInput] = useState(query);
  const list = useQuery({
    queryKey: ['resident-notices', propertyId, page, query],
    queryFn: ({ signal }) => getResidentNotices(propertyId, page, query, signal),
    retry: false,
    gcTime: 0,
    refetchInterval: 30_000
  });
  const columns: DataTableColumn<ResidentNoticeSummary>[] = [
    {
      key: 'title',
      header: '제목',
      rowHeader: true,
      render: (row) => (
        <span
          className={styles['notice-title']}
        >
          {row.important && (
            <span
              className={styles.badge}
            >
              중요
            </span>
          )}
          <span>
            {row.title}
          </span>
        </span>
      )
    },
    {
      key: 'date',
      header: '작성일',
      width: 150,
      align: 'right',
      render: (row) => (
        <time
          dateTime={row.createdAt}
        >
          {DATE.format(new Date(row.createdAt))}
        </time>
      )
    }
  ];
  return (
    <section
      className={styles.list}
      aria-labelledby={'resident-notices-title'}
    >
      <NoticeBanner />
      <ListCard
        className={styles['list-card']}
      >
        <form
          className={styles.search}
          role={'search'}
          onSubmit={(event) => { event.preventDefault(); onNavigate(1, input.trim()); }}
        >
          <Input
            aria-label={'공지 제목 검색'}
            placeholder={'공지 제목 검색'}
            maxLength={100}
            value={input}
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
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ResidentNoticeError
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : (
          <>
            <ListToolbar
              total={list.data.total + list.data.importantItems.length}
              unit={'건'}
              sizeLabel={'표시 개수'}
              pageSize={10}
            />
            {list.data.importantItems.length > 0 && (
              <section
                className={styles['important-panel']}
                aria-labelledby={'important-notices-title'}
              >
                <header
                  className={styles['section-heading']}
                >
                  <ServiceIcon
                    name={'notice'}
                    size={26}
                  />
                  <div>
                    <h2
                      id={'important-notices-title'}
                    >
                      중요 공지
                    </h2>
                    <p>
                      입주민께 꼭 필요한 주요 안내입니다.
                    </p>
                  </div>
                </header>
                <DataTable
                  className={styles['important-table']}
                  label={'중요 공지사항'}
                  rows={list.data.importantItems}
                  columns={columns}
                  minWidth={0}
                  getRowKey={(row) => row.id}
                  onRowClick={(row) => router.push(`/notices/${propertyId}/${row.id}`)}
                  emptyState={null}
                />
              </section>
            )}
            <section
              className={styles['all-notices']}
              aria-labelledby={'all-notices-title'}
            >
              <header
                className={styles['section-heading']}
              >
                <div>
                  <h2
                    id={'all-notices-title'}
                  >
                    전체 공지
                  </h2>
                  <p>
                    새로운 소식과 안내를 최신순으로 확인하세요.
                  </p>
                </div>
              </header>
              <DataTable
                className={styles.table}
                label={'주민 공지사항'}
                rows={list.data.items}
                columns={columns}
                minWidth={0}
                getRowKey={(row) => row.id}
                onRowClick={(row) => router.push(`/notices/${propertyId}/${row.id}`)}
                emptyState={(
                  <StateMessage
                    variant={query ? 'no-results' : 'empty-notice'}
                    layout={'inline'}
                    title={query ? '일반 공지 검색 결과가 없어요' : '아직 등록된 일반 공지가 없어요'}
                  />
                )}
              />
            </section>
            <Pagination
              label={'공지사항 페이지'}
              unit={'건'}
              total={list.data.total}
              page={page}
              pageCount={list.data.pageCount}
              pageSize={10}
              showCount={false}
              onPageChange={(next) => onNavigate(next, query)}
            />
          </>
        )}
      </ListCard>
    </section>
  );
}

function ResidentNoticeArticle({ propertyId, noticeId, onBack }: { propertyId: string; noticeId: string; onBack: () => void }) {
  const notice = useQuery({
    queryKey: ['resident-notices', propertyId, noticeId],
    queryFn: ({ signal }) => getResidentNotice(propertyId, noticeId, signal),
    retry: false,
    gcTime: 0,
    refetchInterval: 30_000
  });
  const readAsset = useCallback((reference: string, signal?: AbortSignal) => readResidentNoticeAsset(propertyId, noticeId, reference, signal), [propertyId, noticeId]);
  if (notice.isPending) return (
    <LoadingState />
  );
  if (notice.isError) return (
    <ResidentNoticeError
      error={notice.error}
      onRetry={() => void notice.refetch()}
    />
  );
  return (
    <article
      className={styles.article}
      aria-labelledby={'resident-notice-title'}
    >
      <ListCard>
        <header
          className={styles['article-header']}
        >
          {notice.data.important && (
            <span
              className={styles.badge}
            >
              <ServiceIcon
                name={'notice'}
                size={16}
              />
              중요
            </span>
          )}
          <h1
            id={'resident-notice-title'}
          >
            {notice.data.title}
          </h1>
          <div
            className={styles['article-meta']}
          >
            <span>
              작성자
              {' '}
              {notice.data.authorName}
            </span>
            <time
              dateTime={notice.data.createdAt}
            >
              <ServiceIcon
                name={'calendar'}
                size={17}
              />
              작성일
              {' '}
              {DATE.format(new Date(notice.data.createdAt))}
            </time>
          </div>
        </header>
        <NoticeEditor
          key={notice.data.content}
          initialContent={notice.data.content}
          readOnly
          readAsset={readAsset}
        />
        <NoticeAttachments
          content={notice.data.content}
          readAsset={readAsset}
        />
      </ListCard>
      <div
        className={styles['desktop-back']}
      >
        <Button
          variant={'outline'}
          leadingIcon={(
            <ServiceIcon
              name={'arrow'}
              size={20}
              style={{
                transform: 'rotate(180deg)'
              }}
            />
          )}
          onClick={onBack}
        >
          목록
        </Button>
      </div>
    </article>
  );
}
