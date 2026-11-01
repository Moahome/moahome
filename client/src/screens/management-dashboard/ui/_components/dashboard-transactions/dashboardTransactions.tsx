import { formatWon } from '@/shared/lib/format';
import { DataTable } from '@/shared/ui/data-table';
import type { DashboardReport } from '../../../model/dashboardTypes';
import { DashboardPanel } from '../dashboard-panel/dashboardPanel';
import styles from './dashboardTransactions.module.css';

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: '확정',
  PENDING: '확인 필요',
  ON_HOLD: '보류',
  CANCELED: '재검토',
  LINKED: '연결됨',
  TRANSFER: '내부 이체',
  TRANSFER_PENDING: '이체 연결 대기'
};

export function DashboardTransactions({ report, href, onOpen }: {
  report: DashboardReport;
  href: string;
  onOpen: (row: DashboardReport['recent'][number]) => void;
}) {
  return (
    <DashboardPanel
      title={'최근 통장 거래'}
      href={href}
    >
      <div
        className={styles.transactions}
      >
        <DataTable
          label={'최근 통장 거래'}
          rows={report.recent}
          getRowKey={(row) => row.id}
          minWidth={680}
          onRowClick={onOpen}
          emptyState={'선택한 월에 등록된 거래가 없어요.'}
          columns={[
            {
              key: 'date',
              header: '거래일시',
              render: (row) => (
                <span>
                  {row.date.replaceAll('-', '.')}
                  {' '}
                  {row.time?.slice(0, 5) ?? ''}
                </span>
              )
            },
            {
              key: 'account',
              header: '통장',
              render: (row) => report.accounts.find((account) => account.id === row.accountId)?.label ?? '관리 통장'
            },
            {
              key: 'label',
              header: '내용',
              render: (row) => (
                <span
                  title={row.payer}
                >
                  {row.label}
                </span>
              )
            },
            {
              key: 'amount',
              header: '금액',
              align: 'right',
              render: (row) => (
                <strong
                  className={styles.amount}
                  data-income={row.direction === 'INCOME'}
                >
                  {row.direction === 'INCOME' ? '+' : '-'}
                  {formatWon(row.amount)}
                </strong>
              )
            },
            {
              key: 'status',
              header: '상태',
              align: 'center',
              render: (row) => (
                <span
                  className={styles.badge}
                  data-confirmed={['CONFIRMED', 'TRANSFER', 'LINKED'].includes(row.status)}
                >
                  {STATUS_LABELS[row.status] ?? '확인 필요'}
                </span>
              )
            }
          ]}
        />
      </div>
    </DashboardPanel>
  );
}
