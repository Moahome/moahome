'use client';

import { LoadingState } from '@/shared/ui/state-message';

import { RequestError } from '@/shared/ui/server-connection-error';

import {
  useEffect,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { useManagementContext } from '@/features/enter-service';
import { ChiefAccountLink } from '../_components/chief-account-link/chiefAccountLink';
import { ResidentDetails } from '@/features/resident-management';
import { Button } from '@/shared/ui/button';
import { Pagination } from '@/shared/ui/pagination';
import { useResidentList } from './_hooks/useResidentList';
import { ResidentListSummary } from './_components/resident-list-summary/residentListSummary';
import { ResidentListFilters } from './_components/resident-list-filters/residentListFilters';
import { ResidentListTable } from './_components/resident-list-table/residentListTable';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { ListCard } from '@/shared/ui/list-card';
import { ResidentRegistrationModal } from './_components/resident-registration-modal/residentRegistrationModal';
import { ResidentExportPreview } from '../_components/resident-export-preview/residentExportPreview';
import { getResidentExportSelectionKey } from '../../model/residentExport';
import styles from './residentListPage.module.css';

/** 주민 조회·필터와 웹 등록 모달을 조합하고 모바일 등록은 독립 페이지로 연결합니다. */
export function ResidentListPage({
  propertyId,
  registered = false,
  deleted = false,
  accountLinked = false,
}: {
  propertyId: string;
  registered?: boolean;
  deleted?: boolean;
  accountLinked?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const context = useManagementContext(session.data?.id, propertyId, false);
  const [linkingChief, setLinkingChief] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exportIds, setExportIds] = useState<string[] | null>(null);
  const [message, setMessage] = useState(accountLinked ? '관리소장 계정을 주민 명부에 연결했어요.' : deleted ? '주민을 삭제했어요.' : registered ? '주민을 등록했어요.' : '');
  useEffect(() => {
    if (registered || deleted || accountLinked) window.history.replaceState(null, '', `/manage/${propertyId}/residents`);
  }, [registered, deleted, accountLinked, propertyId]);
  const controller = useResidentList(propertyId);

  /** 실제 화면 폭에 따라 웹 모달과 모바일 등록 주소로 진입하며 입력 폼은 공유합니다. */
  function openRegistration() {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/residents/new`);
      return;
    }
    setRegistering(true);
  }

  /** 웹은 현재 목록 위 상세 모달을 열고 모바일은 헤더 뒤로가기가 있는 독립 페이지로 이동합니다. */
  function openDetail(residentId: string) {
    if (window.matchMedia('(max-width: 767px)').matches) {
      router.push(`/manage/${propertyId}/residents/${residentId}`);
      return;
    }
    setDetailId(residentId);
  }

  /** 저장 성공 뒤 서버 명부를 새로 읽어 카드·표를 갱신하며 기존 검색 조건은 유지합니다. */
  function registeredResident() {
    setRegistering(false);
    setMessage('주민을 등록했어요.');
    void queryClient.invalidateQueries({
      predicate: (query) => ['property-residents', 'property-units'].includes(String(query.queryKey[0]))
    });
  }
  const { list, data, view } = controller;

  /** 필터·정렬된 전체 결과를 고정해 웹 미리보기를 열고 모바일에는 ID만 일시 전달합니다. */
  function openExport() {
    if (!view.filtered.length || !session.data) return;
    const ids = view.filtered.map((row) => row.id);
    if (window.matchMedia('(max-width: 767px)').matches) {
      queryClient.setQueryData(getResidentExportSelectionKey(session.data.id, propertyId), ids);
      router.push(`/manage/${propertyId}/residents/export`);
      return;
    }
    setExportIds(ids);
  }

  return (
    <section
      className={styles.page}
      aria-labelledby={'resident-list-title'}
    >
      <ListHeader
        menu={'세대 관리'}
        title={'주민 목록'}
        description={'등록된 주민을 조회하고 동·호수와 대표 여부를 확인하세요.'}
        titleId={'resident-list-title'}
        actions={list.isSuccess && (
          <div
            className={styles.actions}
          >
            {context.data?.role === 'ADMIN' && !data.residents.some((resident) => resident.serviceRole === 'ADMIN' && resident.signupStatus === 'APPROVED') && (
              <Button
                variant={'outline'}
                className={styles['account-link']}
                onClick={() => {
                  if (window.matchMedia('(max-width: 767px)').matches) {
                    router.push(`/manage/${propertyId}/residents/account-link`);
                    return;
                  }
                  setLinkingChief(true);
                }}
              >
                내 계정 연결
              </Button>
            )}
            <Button
              variant={'outline'}
              tone={'excel'}
              onClick={() => router.push(`/manage/${propertyId}/residents/import`)}
              leadingIcon={(
                <ServiceIcon
                  name={'excel'}
                />
              )}
            >
              엑셀 업로드
            </Button>
            <Button
              onClick={openRegistration}
              leadingIcon={(
                <ServiceIcon
                  name={'plus'}
                />
              )}
            >
              주민 등록
            </Button>
          </div>
        )}
      />
      {list.isPending && (
        <div
          className={styles.state}
        >
          <LoadingState
            title={'주민 목록을 불러오고 있어요.'}
          />
        </div>
      )}
      {list.isError && (
        <RequestError
          error={list.error}
          onRetry={() => void list.refetch({
            cancelRefetch: false
          })}
        />
      )}

      {list.isSuccess && (
        <>
          <ResidentListSummary
            residents={data.residents}
          />
          <ListCard>
            <ResidentListFilters
              hasBuildings={data.hasBuildings}
              buildings={data.buildings}
              filters={controller.filters}
              hasFilters={view.hasFilters}
              onChange={controller.changeFilters}
            />
            <ListToolbar
              unit={'명'}
              sizeLabel={'페이지당 주민 수'}
              total={view.filtered.length}
              pageSize={controller.pageSize}
              onSizeChange={controller.changePageSize}
              actions={(
                <Button
                  variant={'outline'}
                  tone={'excel'}
                  className={styles.download}
                  disabled={!view.filtered.length}
                  onClick={openExport}
                  leadingIcon={(
                    <ServiceIcon
                      name={'excel'}
                    />
                  )}
                >
                  엑셀 다운로드
                </Button>
              )}
            />
            <ResidentListTable
              residents={view.rows}
              onOpen={(row) => openDetail(row.id)}
              buildings={data.buildings}
              hasBuildings={data.hasBuildings}
              hasFilters={view.hasFilters}
            />
            <Pagination
              label={'주민 목록 페이지'}
              unit={'명'}
              total={view.filtered.length}
              page={view.currentPage}
              pageCount={view.pageCount}
              pageSize={controller.pageSize}
              onPageChange={controller.changePage}
            />
          </ListCard>
        </>
      )}
      {linkingChief && (
        <ChiefAccountLink
          propertyId={propertyId}
          data={data}
          onClose={() => setLinkingChief(false)}
          onLinked={() => { setLinkingChief(false); setMessage('관리소장 계정을 주민 명부에 연결했어요.'); }}
        />
      )}
      {registering && (
        <ResidentRegistrationModal
          propertyId={propertyId}
          onClose={() => setRegistering(false)}
          onRegistered={registeredResident}
        />
      )}
      {detailId && (
        <ResidentDetails
          key={detailId}
          propertyId={propertyId}
          residentId={detailId}
          canPromote={context.data?.role === 'ADMIN'}
          onClose={() => setDetailId(null)}
          onDeleted={() => { setDetailId(null); setMessage('주민을 삭제했어요.'); }}
        />
      )}
      {message && (
        <Toast
          message={message}
          onClose={() => setMessage('')}
        />
      )}
      {exportIds && (
        <ResidentExportPreview
          propertyId={propertyId}
          residentIds={exportIds}
          onClose={() => setExportIds(null)}
        />
      )}
    </section>
  );
}
