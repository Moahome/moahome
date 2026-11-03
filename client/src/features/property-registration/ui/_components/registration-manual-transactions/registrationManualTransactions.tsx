'use client';


import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { DataTable } from '@/shared/ui/data-table';
import { Pagination } from '@/shared/ui/pagination';
import { StateMessage } from '@/shared/ui/state-message';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { RegistrationAccount } from '../../../model/bankAccountTypes';
import type { RegistrationManualTransaction } from '../../../model/registrationBankTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../../../model/unitSetupTypes';
import { RegistrationTransactionEditor } from '../registration-transaction-editor/registrationTransactionEditor';
import styles from './registrationManualTransactions.module.css';

/** 기존 입금 모달과 지출 배분 입력으로 입출금 초안을 만들고 최종 등록에서 함께 저장합니다. */
export function RegistrationManualTransactions({ account, records, units, buildings, onChange, onOpenPage }: {
  onOpenPage?: (accountId: string, direction: 'INCOME' | 'EXPENSE', transactionId?: string) => void;
  account: RegistrationAccount;
  records: RegistrationManualTransaction[];
  units: UnitDraft[];
  buildings: BuildingDraft[];
  onChange: (records: RegistrationManualTransaction[]) => void;
}) {
  const [direction, setDirection] = useState<'INCOME' | 'EXPENSE' | null>(null);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState('');
  const current = records.filter((record) => record.accountClientId === account.clientId);
  const pageCount = Math.max(1, Math.ceil(current.length / 10));
  const currentPage = Math.min(page, pageCount);
  const labels = units.map((unit) => ({
    id: unit.clientId,
    label: `${buildings.find((building) => building.clientId === unit.buildingClientId)?.name ?? ''} ${unit.unitNumber}${unit.unitNumber.endsWith('호') ? '' : '호'}`.trim()
  }));
  function openEditor(nextDirection: 'INCOME' | 'EXPENSE', record?: RegistrationManualTransaction) {
    if (window.matchMedia('(max-width: 767px)').matches && onOpenPage) {
      onOpenPage(account.clientId, nextDirection, record?.id);
      return;
    }
    setEditingId(record?.id ?? crypto.randomUUID());
    setDirection(nextDirection);
  }
  function save(record: Omit<RegistrationManualTransaction, 'id' | 'accountClientId'>) {
    const next = {
      ...record,
      id: editingId,
      accountClientId: account.clientId
    };
    const editing = records.some((entry) => entry.id === editingId);
    onChange(editing ? records.map((entry) => entry.id === editingId ? next : entry) : [...records, next]);
    if (!editing) setDirection(null);
  }

  return (
    <details
      className={styles.section}
      aria-label={'직접 입력한 입출금 내역'}
    >
      <summary>
        입출금 내역 (선택)
      </summary>
      <div
        className={styles.body}
      >
        <div
          className={styles.heading}
        >
          <p>
            확인한 입금과 출금을 등록해주세요. 기준일까지의 거래는 시작 잔액에 다시 더하거나 빼지 않습니다.
          </p>
          <div
            className={styles.actions}
          >
            <Button
              type={'button'}
              variant={'outline'}
              onClick={() => openEditor('INCOME')}
            >
              입금 등록
            </Button>
            <Button
              type={'button'}
              variant={'outline'}
              onClick={() => openEditor('EXPENSE')}
            >
              출금 등록
            </Button>
          </div>
        </div>
        <DataTable
          label={'직접 입력한 입출금'}
          rows={current.slice((currentPage - 1) * 10, currentPage * 10)}
          getRowKey={(record) => record.id}
          onRowClick={(record) => openEditor(record.direction, record)}
          emptyState={(
            <StateMessage
              variant={'empty-data'}
              layout={'inline'}
              title={'아직 등록된 입출금 내역이 없어요.'}
              description={'입금 또는 출금을 등록하면 이곳에서 확인할 수 있어요.'}
            />
          )}
          columns={[
            {
              key: 'date',
              header: '거래일',
              render: (record) => record.date
            },
            {
              key: 'direction',
              header: '구분',
              render: (record) => record.direction === 'INCOME' ? '입금' : '출금'
            },
            {
              key: 'payer',
              header: '입금자·지출명',
              render: (record) => record.payer
            },
            {
              key: 'unit',
              header: '처리 내용',
              render: (record) => record.unitClientId ? labels.find((unit) => unit.id === record.unitClientId)?.label ?? '세대 확인 필요' : record.category ?? ''
            },
            {
              key: 'amount',
              header: '금액',
              render: (record) => formatWon(BigInt(record.amount) * (record.direction === 'EXPENSE' ? BigInt(-1) : BigInt(1)))
            },

          ]}
        />
        <Pagination
          label={'직접 입력한 거래'}
          unit={'건'}
          total={current.length}
          page={currentPage}
          pageCount={pageCount}
          pageSize={10}
          onPageChange={setPage}
        />
        {direction && createPortal((
          <RegistrationTransactionEditor
            key={editingId}
            account={account}
            direction={direction}
            record={records.find((record) => record.id === editingId)}
            units={units}
            buildings={buildings}
            onSave={save}
            onClose={() => setDirection(null)}
            onDelete={records.some((record) => record.id === editingId) ? () => { onChange(records.filter((record) => record.id !== editingId)); setDirection(null); } : undefined}
          />
        ), document.body)}
      </div>
    </details>
  );
}
