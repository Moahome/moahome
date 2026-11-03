'use client';

import {
  ManualExpenseForm,
  ManualReceiptForm
} from '@/entities/banking';
import { useState } from 'react';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DetailActions } from '@/shared/ui/detail-actions';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { RegistrationAccount } from '../../../model/bankAccountTypes';
import { getOpeningToday } from '../../../model/openingBalances';
import type { RegistrationManualTransaction } from '../../../model/registrationBankTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../../../model/unitSetupTypes';
import styles from './registrationTransactionEditor.module.css';

/** PC 모달과 모바일 페이지가 같은 공용 입출금 폼·초안 수정·삭제를 사용합니다. */
export function RegistrationTransactionEditor({ account, record, direction, units, buildings, presentation = 'modal', onSave, onDelete, onClose }: {
  account: RegistrationAccount;
  record?: RegistrationManualTransaction;
  direction: 'INCOME' | 'EXPENSE';
  units: UnitDraft[];
  buildings: BuildingDraft[];
  presentation?: 'modal' | 'page';
  onSave: (record: Omit<RegistrationManualTransaction, 'id' | 'accountClientId'>) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'detail' | 'edit' | 'delete'>(record ? 'detail' : 'edit');
  const labels = units.map((unit) => ({
    id: unit.clientId,
    label: `${buildings.find((building) => building.clientId === unit.buildingClientId)?.name ?? ''} ${unit.unitNumber}${unit.unitNumber.endsWith('호') ? '' : '호'}`.trim()
  }));
  const targets = buildings.map((building) => ({
    id: building.clientId,
    label: building.name
  }));
  const title = `${direction === 'INCOME' ? '입금' : '출금'} ${record ? '수정' : '등록'}`;
  if (record && mode !== 'edit') {
    const heading = `${direction === 'INCOME' ? '입금' : '출금'} ${mode === 'delete' ? '삭제' : '상세'}`;
    const content = (
      <>
        <header
          className={styles.header}
        >
          {presentation === 'page' ? (
            <h1
              id={'registration-transaction-title'}
            >
              {heading}
            </h1>
          ) : (
            <h2
              id={'registration-transaction-title'}
            >
              {heading}
            </h2>
          )}
          {presentation === 'modal' && (
            <Button
              variant={'ghost'}
              iconOnly
              aria-label={'입출금 상세 닫기'}
              onClick={onClose}
              leadingIcon={(
                <ServiceIcon
                  name={'close'}
                />
              )}
            />
          )}
        </header>
        {mode === 'delete' ? (
          <>
            <p>
              이 입출금 내역을 삭제할까요?
            </p>
            <footer
              className={styles.actions}
            >
              <Button
                variant={'outline'}
                tone={'neutral'}
                onClick={() => setMode('detail')}
              >
                취소
              </Button>
              <Button
                variant={'outline'}
                tone={'danger'}
                onClick={onDelete}
              >
                삭제
              </Button>
            </footer>
          </>
        ) : (
          <>
            <dl
              className={styles.fields}
            >
              <div>
                <dt>
                  통장
                </dt>
                <dd>
                  {account.bankName}
                  {account.alias ? ` · ${account.alias}` : ''}
                </dd>
              </div>
              <div>
                <dt>
                  거래일
                </dt>
                <dd>
                  {record.date}
                </dd>
              </div>
              <div>
                <dt>
                  {direction === 'INCOME' ? '입금자명' : '지출명'}
                </dt>
                <dd>
                  {record.payer}
                </dd>
              </div>
              <div>
                <dt>
                  금액
                </dt>
                <dd>
                  {formatWon(BigInt(record.amount))}
                </dd>
              </div>
              {record.unitClientId && (
                <div>
                  <dt>
                    세대
                  </dt>
                  <dd>
                    {labels.find((unit) => unit.id === record.unitClientId)?.label ?? '세대 확인 필요'}
                  </dd>
                </div>
              )}
              {record.category && direction === 'INCOME' && (
                <div>
                  <dt>
                    입금 항목
                  </dt>
                  <dd>
                    {record.category}
                  </dd>
                </div>
              )}
              {buildings.length > 0 && record.allocation && (
                <div>
                  <dt>
                    배분
                  </dt>
                  <dd>
                    {record.allocation.allocations.map((share) => `${share.label} ${formatWon(BigInt(share.amount || '0'))}`).join(' · ')}
                  </dd>
                </div>
              )}
              {record.note && (
                <div>
                  <dt>
                    메모
                  </dt>
                  <dd>
                    {record.note}
                  </dd>
                </div>
              )}
            </dl>
            <DetailActions
              presentation={presentation}
              onClose={onClose}
              onEdit={() => setMode('edit')}
              onDelete={() => setMode('delete')}
            />
          </>
        )}
      </>
    );
    return presentation === 'page' ? (
      <section
        className={styles.page}
      >
        {content}
      </section>
    ) : (
      <ClientModal
        className={styles.modal}
        onClose={onClose}
        aria-labelledby={'registration-transaction-title'}
      >
        {content}
      </ClientModal>
    );
  }
  function save(value: Omit<RegistrationManualTransaction, 'id' | 'accountClientId'>) {
    onSave(value);
    if (record) setMode('detail');
  }
  const cancelEdit = record ? () => setMode('detail') : undefined;
  if (direction === 'INCOME') return (
    <ManualReceiptForm
      title={title}
      presentation={presentation}
      accounts={[{
        id: account.clientId,
        label: `${account.bankName} ${account.alias ?? ''}`.trim(),
        isPrimary: true
      }]}
      units={labels}
      buildings={targets}
      asOf={getOpeningToday()}
      onClose={onClose}
      onCancel={cancelEdit}
      initialValue={record ? {
        accountId: account.clientId,
        purpose: record.purpose,
        date: record.date,
        amount: record.amount,
        payer: record.payer,
        unitId: record.unitClientId,
        category: record.category,
        note: record.note,
        incomeAllocation: record.allocation
      } : undefined}
      onSubmit={async (value) => { save({
        direction: 'INCOME',
        date: value.date,
        amount: value.amount,
        payer: value.payer,
        purpose: value.purpose,
        unitClientId: value.unitId,
        category: value.category,
        note: value.note,
        allocation: value.incomeAllocation
      }); return null; }}
    />
  );
  return (
    <ManualExpenseForm
      title={title}
      presentation={presentation}
      accounts={[{
        id: account.clientId,
        bankName: account.bankName,
        last4: account.accountNumber.slice(-4),
        alias: account.alias,
        isPrimary: true,
        status: 'ACTIVE'
      }]}
      buildings={targets}
      asOf={getOpeningToday()}
      initialAccountId={account.clientId}
      onClose={onClose}
      onCancel={cancelEdit}
      initialValue={record ? {
        accountId: account.clientId,
        date: record.date,
        amount: record.amount,
        category: record.category ?? record.payer,
        note: record.note ?? '',
        mode: record.allocation?.mode ?? 'PROPERTY',
        allocations: record.allocation?.allocations ?? []
      } : undefined}
      onSubmit={async (value) => { save({
        direction: 'EXPENSE',
        date: value.date,
        amount: value.amount,
        payer: value.category,
        purpose: 'OTHER',
        category: value.category,
        note: value.note,
        allocation: {
          category: value.category,
          note: value.note,
          mode: value.mode,
          saveAsRule: false,
          allocations: value.allocations
        }
      }); return null; }}
    />
  );
}
