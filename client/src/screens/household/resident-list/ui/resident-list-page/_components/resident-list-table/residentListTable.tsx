import {
  RESIDENT_RELATION_OPTIONS,
  RESIDENT_SIGNUP_OPTIONS
} from '@/entities/resident';
import { MEMBER_ROLE_LABELS } from '@/features/member-management';
import {
  DataTable,
  type DataTableColumn
} from '@/shared/ui/data-table';
import type {
  ResidentList,
  ResidentRow
} from '../../../../api/residentApiTypes';
import { getResidentUnitLabel } from '../../../../lib/residentLabel';
import styles from './residentListTable.module.css';

/** 한 세대의 여러 주민을 각각 표시하며 대표 여부를 가입 상태와 구분합니다. */
export function ResidentListTable({
  residents,
  buildings,
  hasBuildings,
  hasFilters,
  onOpen,
}: {
  residents: ResidentRow[];
  buildings: ResidentList['buildings'];
  hasBuildings: boolean;
  hasFilters: boolean;
  onOpen: (row: ResidentRow) => void;
}) {
  const buildingNames = new Map(buildings.map((building) => [building.id, building.name]));
  const columns: DataTableColumn<ResidentRow>[] = [
    {
      key: 'name',
      header: '주민명',
      rowHeader: true,
      render: (row) => (
        <button
          type={'button'}
          className={styles['name-button']}
          aria-label={`${row.name} 상세 보기`}
          onClick={() => onOpen(row)}
        >
          {row.name}
        </button>
      )
    },
    {
      key: 'phone',
      header: '연락처',
      render: (row) => row.phoneLast4 ? `•••• ${row.phoneLast4}` : '—'
    },
    {
      key: 'unit',
      header: '동·호수',
      render: (row) => getResidentUnitLabel(row, buildingNames, hasBuildings)
    },
    {
      key: 'relation',
      header: '주민 구분',
      render: (row) => RESIDENT_RELATION_OPTIONS.find((option) => option.value === row.relationType)?.label ?? '—'
    },
    {
      key: 'representative',
      header: '대표 주민',
      render: (row) => row.representative ? (
        <span
          className={styles.representative}
        >
          대표
        </span>
      ) : '—'
    },
    {
      key: 'serviceRole',
      header: '역할',
      render: (row) => row.serviceRole && row.serviceRole !== 'CONFLICT' ? MEMBER_ROLE_LABELS[row.serviceRole] : row.serviceRole === 'CONFLICT' ? '권한 확인 필요' : '—'
    },
    {
      key: 'signupStatus',
      header: '가입 상태',
      render: (row) => (
        <span
          className={styles['signup-status']}
          data-status={row.signupStatus}
        >
          {RESIDENT_SIGNUP_OPTIONS.find((option) => option.value === row.signupStatus)?.label}
        </span>
      )
    }
  ];

  return (
    <DataTable
      label={'주민 목록'}
      rows={residents}
      columns={columns}
      getRowKey={(row) => row.id}
      minWidth={760}
      onRowClick={onOpen}
      emptyState={hasFilters ? '검색 결과가 없어요.' : '등록된 주민이 없어요.'}
    />
  );
}
