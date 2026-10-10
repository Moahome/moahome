import { RESIDENT_RELATION_OPTIONS } from '@/entities/resident';
import { DataTable } from '@/shared/ui/data-table';
import type { ImportRow } from '../../../api/residentImportApi';
import styles from './importTable.module.css';

export const IMPORT_STATUS_LABELS = {
  READY: '등록 가능',
  DUPLICATE: '중복 제외',
  ERROR: '오류',
  SUCCESS: '등록 성공',
  NOT_SELECTED: '선택 안 함'
};

/** 검증과 완료가 같은 표를 쓰며 등록 가능한 행만 선택할 수 있도록 합니다. */
export function ImportTable({
  rows,
  selected,
  onSelect,
  disabled,
  completed
}: {
  rows: ImportRow[];
  selected: number[];
  onSelect: (rowNumber: number) => void;
  disabled: boolean;
  completed: boolean;
}) {
  return (
    <DataTable
      label={completed ? '주민 등록 결과' : '업로드 주민 목록'}
      rows={rows}
      getRowKey={(row) => String(row.rowNumber)}
      emptyState={'조건에 맞는 행이 없어요.'}
      minWidth={900}
      columns={[
        ...(!completed ? [{
          key: 'select',
          header: '선택',
          width: 60,
          render: (row: ImportRow) => (
            <input
              type={'checkbox'}
              aria-label={`${row.rowNumber}행 등록 선택`}
              checked={selected.includes(row.rowNumber)}
              disabled={disabled || row.status !== 'READY'}
              onChange={() => onSelect(row.rowNumber)}
              className={styles.checkbox}
            />
          )
        }] : []),
        {
          key: 'building',
          header: '동',
          render: (row) => (
            <span
              className={styles['single-line']}
            >
              {row.building || '—'}
            </span>
          )
        },
        {
          key: 'unit',
          header: '호수',
          render: (row) => row.unitNumber || '—'
        },
        {
          key: 'name',
          header: '주민명',
          render: (row) => row.name || '—',
          rowHeader: true
        },
        {
          key: 'relation',
          header: '주민 구분',
          render: (row) => RESIDENT_RELATION_OPTIONS.find((option) => option.value === row.relationType)?.label ?? '—'
        },
        {
          key: 'phone',
          header: '연락처',
          render: (row) => (
            <span
              className={styles['single-line']}
            >
              {row.phoneLast4 ? `•••• ${row.phoneLast4}` : '—'}
            </span>
          )
        },
        {
          key: 'status',
          header: completed ? '등록 결과' : '검증 결과',
          render: (row) => (
            <span
              className={styles.badge}
              data-status={row.status}
            >
              {IMPORT_STATUS_LABELS[row.status]}
              {row.representative ? ' · 대표' : ''}
            </span>
          )
        },
        {
          key: 'reason',
          header: '안내',
          render: (row) => (
            <span
              className={styles.reason}
            >
              {row.reason}
            </span>
          )
        }
      ]}
    />
  );
}
