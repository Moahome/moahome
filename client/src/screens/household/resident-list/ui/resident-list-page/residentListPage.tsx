'use client';

import {
  useEffect,
  useState
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { ResidentDetails } from '@/features/resident-management';
import { Button } from '@/shared/ui/button';
import { Pagination } from '@/shared/ui/pagination';
import { getResidentListError } from '../../model/residentList';
import { useResidentList } from './_hooks/useResidentList';
import { ResidentListSummary } from './_components/resident-list-summary/residentListSummary';
import { ResidentListFilters } from './_components/resident-list-filters/residentListFilters';
import { ResidentListTable } from './_components/resident-list-table/residentListTable';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { ListCard } from '@/shared/ui/list-card';
import { ResidentRegistrationModal } from './_components/resident-registration-modal/residentRegistrationModal';
import styles from './residentListPage.module.css';

/** 주민 조회·필터와 웹 등록 모달을 조합하고 모바일 등록은 독립 페이지로 연결합니다. */
export function ResidentListPage({
  propertyId,
  registered = false,
  deleted = false,
}: {
  propertyId: string;
  registered?: boolean;
  deleted?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [registering, setRegistering] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [message, setMessage] = useState(deleted ? '주민을 삭제했어요.' : registered ? '주민을 등록했어요.' : '');
  useEffect(() => {
    if (registered || deleted) window.history.replaceState(null, '', `/manage/${propertyId}/residents`);
  }, [registered, deleted, propertyId]);
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
            <Button
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
          role={'status'}
        >
          주민 목록을 불러오고 있어요.
        </div>
      )}
      {list.isError && (
        <div
          className={styles.state}
          role={'alert'}
        >
          <p>
            {getResidentListError(list.error)}
          </p>
          <Button
            variant={'outline'}
            onClick={() => void list.refetch()}
          >
            다시 시도
          </Button>
        </div>
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
    </section>
  );
}
