'use client';

import {
  usePathname,
  useRouter,
  useSearchParams
} from 'next/navigation';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import { Dropdown } from '@/shared/ui/form-controls';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { IncomeStatementWorkspace } from '../../../api/incomeStatementApiTypes';
import type { AccountingEditorTarget } from '../accounting-editor/accountingEditor';
import styles from './accountingChecks.module.css';

/** 미반영 자료를 먼저 보여주며 목록 탐색은 손익·다운로드의 전체 합계에 영향을 주지 않습니다. */
export function AccountingChecks({ data, onEdit, onSource, onClose }: {
  data: IncomeStatementWorkspace;
  onEdit: (target: AccountingEditorTarget) => void;
  onSource: (path: string) => void;
  onClose: () => void;
}) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const status = search.get('sourceStatus') === 'all' ? 'all' : 'pending';
  const requestedSize = Number(search.get('sourceSize'));
  const pageSize = [10, 20, 50].includes(requestedSize) ? requestedSize : 10;
  const requestedPage = Number(search.get('sourcePage'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  /** 상세 이동 전 목록 상태를 현재 이력에 남겨 기기 뒤로가기로도 같은 위치를 복원합니다. */
  function changeList(next: { status?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams(search.toString());
    params.set('sourceStatus', next.status ?? status);
    params.set('sourcePage', String(next.page ?? page));
    params.set('sourceSize', String(next.pageSize ?? pageSize));
    router.replace(`${pathname}?${params}`, {
      scroll: false
    });
  }
  const rows: { id: string; name: string; amount: string; status: string; path: string; target?: AccountingEditorTarget; pending: boolean }[] = [
    ...data.revenueItems.map((value) => ({
      id: `revenue:${value.id}`,
      name: value.name,
      amount: value.amount,
      status: value.recognized ? '관리비수익' : '수익 성격 확인 필요',
      path: `/billing/monthly?tab=history&month=${data.range.startMonth}`,
      target: {
        kind: 'revenue' as const,
        value
      },
      pending: !value.recognized
    })),
    ...data.expenses.map((value) => ({
      id: `expense:${value.id}`,
      name: value.name,
      amount: value.amount,
      status: value.recognitionMonth ? `${data.accounts.find((account) => account.id === value.accountId)?.name ?? ''} · ${value.recognitionMonth}` : '과목·귀속 월 확인 필요',
      path: `/banking/transactions/${value.transactionId}`,
      target: {
        kind: 'expense' as const,
        value
      },
      pending: data.issues.some((issue) => issue.expenseId === value.id)
    })),
    ...data.issues.filter((issue) => !issue.expenseId && !issue.revenueItemId).map((issue) => ({
      id: issue.id,
      name: issue.label,
      amount: issue.amount,
      status: '확인 필요',
      path: issue.path,
      pending: true
    }))
  ];
  const filtered = rows.filter((row) => status === 'all' || row.pending);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'income-sources-title'}
      onClose={onClose}
      closeOnOutsideClick
    >
      <header
        className={styles.header}
      >
        <div>
          <p>
            손익계산서
          </p>
          <h2
            id={'income-sources-title'}
          >
            손익 반영 자료
          </h2>
        </div>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'손익 반영 자료 닫기'}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <div
        className={styles.body}
      >
        <p
          className={styles.description}
        >
          확인되지 않은 금액은 손익 합계에 포함하지 않습니다. 지출의 과목·귀속 월과 부과 항목의 수익 성격을 확인해주세요.
        </p>
        <div
          className={styles.filters}
        >
          <Dropdown
            aria-label={'손익 반영 상태'}
            value={status}
            options={[{
              value: 'pending',
              label: '확인 필요'
            }, {
              value: 'all',
              label: '전체'
            }]}
            onChange={(value) => changeList({
              status: value,
              page: 1
            })}
          />
          <ListToolbar
            total={filtered.length}
            unit={'건'}
            sizeLabel={'손익 반영 자료 표시 개수'}
            pageSize={pageSize}
            onSizeChange={(size) => changeList({
              pageSize: size,
              page: 1
            })}
          />
        </div>
        <DataTable
          label={'손익 반영 자료'}
          rows={visible}
          getRowKey={(row) => row.id}
          minWidth={680}
          emptyState={'확인할 자료가 없습니다.'}
          onRowClick={(row) => onSource(row.path)}
          columns={[
            {
              key: 'name',
              header: '항목',
              rowHeader: true,
              render: (row) => row.name
            },
            {
              key: 'amount',
              header: '금액',
              align: 'right',
              render: (row) => (
                <span
                  className={styles.money}
                  data-negative={BigInt(row.amount) < BigInt(0)}
                >
                  {formatInteger(row.amount)}
                  원
                </span>
              )
            },
            {
              key: 'status',
              header: '반영 기준',
              render: (row) => row.status
            },
            ...(data.canManage ? [{
              key: 'actions',
              header: '분류',
              render: (row: typeof rows[number]) => row.target ? (
                <Button
                  size={'sm'}
                  variant={'outline'}
                  aria-label={`${row.name} 분류`}
                  onClick={() => { if (row.target) onEdit(row.target); }}
                >
                  수정
                </Button>
              ) : '—'
            }] : [])
          ]}
        />
        <p
          className={styles.description}
        >
          행을 선택하면 기존 업무 내역을 엽니다. 귀속 월이 없는 지출은 출금일과 관계없이 확인 대상에 남습니다.
        </p>
        <Pagination
          label={'손익 반영 자료 페이지'}
          unit={'건'}
          total={filtered.length}
          page={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          onPageChange={(page) => changeList({
            page
          })}
        />
      </div>
    </ClientModal>
  );
}
