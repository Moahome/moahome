import { Fragment } from 'react';
import type {
  CSSProperties,
  ReactNode
} from 'react';
import styles from './dataTable.module.css';

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number;
  rowHeader?: boolean;
}

/** 업무별 열·셀을 받아 표·스크롤·빈 목록을 제공하며 행 클릭을 전달한 표에만 클릭 표현을 적용합니다. */
export function DataTable<Row>({
  label,
  rows,
  columns,
  getRowKey,
  emptyState,
  minWidth = 640,
  onRowClick,
  expandedRowKey,
  renderExpandedRow,
}: {
  label: string;
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  getRowKey: (row: Row) => string;
  emptyState: ReactNode;
  minWidth?: number;
  onRowClick?: (row: Row) => void;
  expandedRowKey?: string | null;
  renderExpandedRow?: (row: Row) => ReactNode;
}) {
  return (
    <div
      className={styles.scroll}
      tabIndex={0}
      role={'region'}
      aria-label={`${label} 표 스크롤`}
      style={{
        '--table-min-width': `${minWidth}px`
      } as CSSProperties}
    >
      <table
        className={styles.table}
        aria-label={label}
        data-empty={!rows.length}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope={'col'}
                style={{
                  width: column.width,
                  textAlign: column.align
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment
              key={getRowKey(row)}
            >
              <tr
                data-clickable={Boolean(onRowClick)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (event) => {
                // 상세 버튼 없이도 행에 초점을 맞춰 Enter·Space로 동일한 상세를 엽니다.
                  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
                  event.preventDefault();
                  onRowClick(row);
                } : undefined}
                onClick={onRowClick ? (event) => {
                // 셀 안의 버튼·입력 조작은 해당 컨트롤만 실행하고 행 클릭으로 중복 처리하지 않습니다.
                  if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, label')) return;
                  onRowClick(row);
                } : undefined}
              >
                {columns.map((column) => {
                  const Cell = column.rowHeader ? 'th' : 'td';

                  return (
                    <Cell
                      key={column.key}
                      scope={column.rowHeader ? 'row' : undefined}
                      style={{
                        textAlign: column.align
                      }}
                    >
                      {column.render(row)}
                    </Cell>
                  );
                })}
              </tr>
              {renderExpandedRow && (
                <tr
                  className={styles['expanded-row']}
                  data-open={expandedRowKey === getRowKey(row)}
                >
                  <td
                    colSpan={columns.length}
                  >
                    <div
                      className={styles['expanded-content']}
                      aria-hidden={expandedRowKey !== getRowKey(row)}
                      inert={expandedRowKey !== getRowKey(row)}
                    >
                      <div>
                        {renderExpandedRow(row)}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!rows.length && (
            <tr>
              <td
                colSpan={columns.length}
                className={styles.empty}
              >
                {emptyState}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
