'use client';

import {
  usePathname,
  useRouter,
  useSearchParams
} from 'next/navigation';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { Dropdown } from '@/shared/ui/form-controls';
import { ListToolbar } from '@/shared/ui/list-toolbar';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { IncomeStatementWorkspace } from '../../../api/incomeStatementApiTypes';
import type { AccountingEditorTarget } from '../accounting-editor/accountingEditor';
import styles from './accountingChecks.module.css';

/** 남은 미수금이 0원인 이유를 회수 상태로 함께 표시합니다. */
function getReceivableStatus(received: string, remaining: string) {
  if (BigInt(remaining) === BigInt(0)) return '회수 완료';
  if (BigInt(received) > BigInt(0)) return '일부 회수';
  return '미회수';
}

/** 미반영 자료를 먼저 보여주며 목록 탐색은 손익·다운로드의 전체 합계에 영향을 주지 않습니다. */
export function AccountingChecks({ data, onEdit, onSource, onClose, presentation = 'modal' }: {
  data: IncomeStatementWorkspace;
  presentation?: 'modal' | 'page';
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
  const managementAccount = data.accounts.find((account) => account.systemKey === 'MANAGEMENT_REVENUE');
  const recognizedRevenue = data.revenueItems.filter((value) => value.recognized);
  const rows: { id: string; name: string; context: string; date?: string; amount: string; status: string; path: string; target?: AccountingEditorTarget; actionLabel?: string; pending: boolean; recovered?: boolean }[] = [
    ...(recognizedRevenue.length ? [{
      id: `account:${managementAccount?.id ?? 'management-revenue'}`,
      name: [managementAccount?.code, managementAccount?.name ?? '관리비수입'].filter(Boolean).join(' '),
      context: `${data.range.startMonth} ~ ${data.range.endMonth} 부과 합계`,
      amount: recognizedRevenue.reduce((sum, item) => sum + BigInt(item.amount), BigInt(0)).toString(),
      status: '수익 반영',
      path: `/billing/monthly?tab=history&month=${data.range.startMonth}`,
      pending: false
    }] : []),
    ...data.revenueItems.filter((value) => !value.recognized).map((value) => ({
      id: `revenue:${value.id}`,
      name: value.name,
      context: value.sourceContext ?? `${data.range.startMonth} ~ ${data.range.endMonth} 부과 합계`,
      amount: value.amount,
      status: '수익 성격 확인 필요',
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
      context: `거래일 ${value.date}`,
      date: value.date,
      amount: value.amount,
      status: value.accountId ? `${data.accounts.filter((account) => account.id === value.accountId).map((account) => [account.code, account.name].filter(Boolean).join(' ')).join('')} · ${value.recognitionMonth ?? value.date.slice(0, 7)}` : '과목 확인 필요',
      path: `/banking/transactions/${value.transactionId}`,
      target: {
        kind: 'expense' as const,
        value
      },
      pending: data.issues.some((issue) => issue.expenseId === value.id)
    })),
    ...(data.otherIncomes ?? []).map((value) => ({
      id: `income:${value.id}`,
      name: value.name,
      context: `거래일 ${value.date}`,
      date: value.date,
      amount: value.amount,
      status: data.accounts.filter((account) => account.id === value.accountId)
        .map((account) => [account.code, account.name].filter(Boolean).join(' ')).join(' ') || '901 영업외수익',
      path: `/banking/receipts/${value.id}`,
      pending: false
    })),
    ...(data.households ?? []).flatMap((value) => [{
      id: `receivable:${value.unitId}`,
      name: `102 미수금 · ${value.label}`,
      context: `${data.range.endMonth} 월말 잔액`,
      amount: value.receivable,
      status: '미납 자동 연결',
      path: value.path,
      pending: false
    }, {
      id: `advance:${value.unitId}`,
      name: `201 선수금 · ${value.label}`,
      context: `${data.range.endMonth} 월말 잔액`,
      amount: value.advance,
      status: '선입금 자동 연결',
      path: value.path,
      pending: false
    }].filter((row) => BigInt(row.amount) > BigInt(0))),
    ...(data.receivables ?? []).filter((value) => value.date.slice(0, 7) >= data.range.startMonth
      && value.date.slice(0, 7) <= data.range.endMonth).map((value) => ({
      id: `receivable:${value.id}`,
      name: `${value.accountCode} 미수금 · ${value.name}`,
      context: `거래일 ${value.date} · ${value.counterparty}`,
      date: value.date,
      amount: value.remaining,
      status: getReceivableStatus(value.received, value.remaining),
      recovered: BigInt(value.remaining) === BigInt(0),
      path: value.path,
      pending: false
    })),
    ...data.issues.filter((issue) => !issue.expenseId && !issue.revenueItemId).map((issue) => ({
      id: issue.id,
      name: issue.sourceName ?? issue.label,
      context: issue.sourceContext?.match(/거래일 \d{4}-\d{2}-\d{2}/)?.[0] ?? issue.sourceContext ?? '',
      date: issue.sourceContext?.match(/거래일 (\d{4}-\d{2}-\d{2})/)?.[1],
      amount: issue.amount,
      status: issue.label,
      path: issue.path,
      actionLabel: issue.code === 'OTHER_INCOME_BUILDING_REQUIRED' ? '동 지정'
        : issue.code.startsWith('CHARGE_') ? '부과 내역' : undefined,
      pending: true
    }))
  ];
  // 날짜가 있는 원천은 종류와 관계없이 최신 거래부터 표시하고 기간 부과 합계는 그 뒤에 둡니다.
  const filtered = rows.filter((row) => status === 'all' || row.pending)
    .sort((left, right) => (right.date ?? '').localeCompare(left.date ?? ''));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const content = (
    <>
      {presentation === 'modal' && (
        <header
          className={styles.header}
        >
          <span
            className={styles['heading-icon']}
            aria-hidden={'true'}
          >
            <ServiceIcon
              name={'chart'}
            />
          </span>
          <div>
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
      )}
      <div
        className={styles.body}
      >
        <div
          className={styles.notice}
        >
          <ServiceIcon
            name={'info'}
          />
          <div>
            <strong>
              확인되지 않은 금액은 손익에 포함하지 않습니다.
            </strong>
            <p>
              계정과목을 확인해주세요.
            </p>
          </div>
        </div>
        <Dropdown
          label={'반영 상태'}
          aria-label={'손익 반영 상태'}
          value={status}
          options={[{
            value: 'all',
            label: '전체'
          }, {
            value: 'pending',
            label: '확인 필요'
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
        <div
          className={styles.cards}
          role={'list'}
          aria-label={'손익 반영 자료'}
        >
          {visible.map((row) => (
            <article
              className={styles.card}
              key={row.id}
              role={'listitem'}
              aria-label={row.name}
            >
              <button
                type={'button'}
                className={styles['card-source']}
                onClick={() => onSource(row.path)}
                aria-label={`${row.name} 내역`}
              >
                <span
                  className={styles['source-icon']}
                  aria-hidden={'true'}
                >
                  <ServiceIcon
                    name={'document'}
                  />
                </span>
                <span
                  className={styles['source-copy']}
                >
                  <strong>
                    {row.name}
                  </strong>
                  {row.context && <span>
                    {row.context}
                  </span>}
                </span>
              </button>
              <div
                className={styles['card-footer']}
              >
                <strong
                  className={styles.money}
                  data-negative={BigInt(row.amount) < BigInt(0)}
                >
                  {formatInteger(row.amount)}
                  원
                </strong>
                <span
                  className={styles.badge}
                  data-pending={row.pending}
                  data-recovered={row.recovered}
                >
                  {row.pending && (
                    <ServiceIcon
                      name={'info'}
                    />
                  )}
                  {row.recovered && (
                    <ServiceIcon
                      name={'check'}
                    />
                  )}
                  {row.status}
                </span>
                {data.canManage && (row.target || row.actionLabel) && (
                  <Button
                    size={'sm'}
                    className={styles.action}
                    aria-label={`${row.name} ${row.actionLabel ?? '매칭'}`}
                    onClick={() => {
                      if (row.target) onEdit(row.target);
                      else onSource(row.path);
                    }}
                  >
                    {row.actionLabel ?? '매칭'}
                  </Button>
                )}
              </div>
            </article>
          ))}
          {!visible.length && (
            <p
              className={styles.empty}
            >
              확인할 자료가 없습니다.
            </p>
          )}
        </div>
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
    </>
  );

  if (presentation === 'page') return (
    <section
      className={`${styles.panel} ${styles.page}`}
      aria-label={'손익 반영 자료'}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={`${styles.panel} ${styles.modal}`}
      aria-labelledby={'income-sources-title'}
      onClose={onClose}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
