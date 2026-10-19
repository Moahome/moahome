import { useSession } from '@/entities/session';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getResidents } from '../../../api/residentApi';
import type { ResidentList } from '../../../api/residentApiTypes';
import {
  EMPTY_RESIDENT_FILTERS,
  getResidentListView
} from '../../../model/residentList';
import type { ResidentFilters } from '../../../model/residentListTypes';

/** 계정·관리대상별 명부를 조회하고 화면 이탈 시 캐시를 제거하며 필터 변경 시 첫 페이지로 돌아갑니다. */
export function useResidentList(propertyId: string) {
  const session = useSession();
  const list = useQuery({
    queryKey: ['property-residents', session.data?.id, propertyId],
    queryFn: () => getResidents(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false
  });
  const [filters, setFilters] = useState(EMPTY_RESIDENT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const data: ResidentList = list.data ?? {
    propertyId,
    hasBuildings: false,
    buildings: [],
    residents: []
  };

  return {
    list,
    data,
    filters,
    pageSize,
    view: getResidentListView(data, filters, page, pageSize),
    changeFilters: (next: ResidentFilters) => {
      setFilters(next);
      setPage(1);
    },
    changePage: setPage,
    changePageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    }
  };
}
