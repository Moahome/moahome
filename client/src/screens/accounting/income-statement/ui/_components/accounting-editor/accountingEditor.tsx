'use client';

import { useState } from 'react';
import { formatInteger } from '@/shared/lib/format';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  createAccountingAccount,
  reviewAccountingExpense,
  reviewAccountingRevenue
} from '../../../api/incomeStatementApi';
import type {
  AccountingExpense,
  AccountingRevenueItem,
  IncomeStatementWorkspace
} from '../../../api/incomeStatementApiTypes';
import styles from './accountingEditor.module.css';

export type AccountingEditorTarget = { kind: 'expense'; value: AccountingExpense }
  | { kind: 'revenue'; value: AccountingRevenueItem };

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNTING_REVIEW_CONFLICT: '다른 확인 내역이 저장됐습니다. 최신 회계 자료를 다시 확인해주세요.',
  ACCOUNTING_SETTINGS_CONFLICT: '저장한 회계 시작 기준은 직접 덮어쓸 수 없습니다.',
  ACCOUNTING_SOURCE_NOT_FOUND: '삭제되었거나 현재 유효하지 않은 원천입니다. 최신 자료를 다시 확인해주세요.',
  ACCOUNTING_SETUP_REQUIRED: '회계 시작 기준을 먼저 설정해주세요.',
  ACCOUNTING_EXTERNAL_REVIEW_REQUIRED: '외부 부담·회수 권리의 회계 처리를 먼저 확인해주세요.',
  INVALID_ACCOUNTING_ACCOUNT: '선택한 계정과목을 확인해주세요.',
  INVALID_ACCOUNTING_TRANSFER: '같은 날짜·금액과 동별 배분의 상대 입금을 선택해주세요.',
  ACCOUNTING_BILLING_REQUIRED: '첫 관리비 부과 이후 자동 연결됩니다.',
  INVALID_ACCOUNTING_REQUEST: '회계 입력 내용을 확인해주세요.'
};

/** 기존 지출 날짜를 재사용해 계정과목만 매칭하고 실패 시 선택을 유지합니다. */
export function AccountingEditor({ propertyId, data, target, onClose, onSaved, presentation = 'modal' }: {
  propertyId: string;
  presentation?: 'modal' | 'page';
  data: IncomeStatementWorkspace;
  target: AccountingEditorTarget;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const expense = target.kind === 'expense' ? target.value : null;
  const revenue = target.kind === 'revenue' ? target.value : null;
  // API 반환·등록 순서와 관계없이 비용 과목은 코드 오름차순으로 선택합니다.
  const accounts = data.accounts.filter((account) => account.group.endsWith('Expense')
    || (account.group === 'asset' && account.code === '103' && expense?.transferCandidates !== undefined))
    .sort((left, right) => (left.code ?? '999').localeCompare(right.code ?? '999', 'ko', {
      numeric: true
    }) || left.name.localeCompare(right.name, 'ko'));
  const [accountId, setAccountId] = useState(expense?.accountId ?? (accounts.length ? '' : 'new'));
  const [counterpartPaymentId, setCounterpartPaymentId] = useState(expense?.transferPaymentId ?? '');
  const isTransfer = accounts.find((account) => account.id === accountId)?.code === '103';
  const [accountName, setAccountName] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [accountGroup, setAccountGroup] = useState<'OPERATING_EXPENSE' | 'OTHER_EXPENSE'>('OPERATING_EXPENSE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = expense ? '지출 매칭' : '수익 매칭';
  const ready = Boolean(expense ? accountId && (accountId !== 'new' || accountName.trim())
    && (!isTransfer || counterpartPaymentId) : revenue);

  /** 과목 추가와 지출 확인은 순서대로 요청하고 재시도는 서버의 명칭·버전 중복 방지 규칙을 따릅니다. */
  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      if (expense) {
        const selected = accountId === 'new'
          ? await createAccountingAccount(propertyId, {
            name: accountName.trim(),
            group: accountGroup,
            code: accountCode || undefined
          }) : accountId;
        await reviewAccountingExpense(propertyId, expense.id, {
          accountId: selected,
          expectedRevision: expense.revision,
          ...(isTransfer ? {
            counterpartPaymentId
          } : {}),
          // 이전 서버도 같은 원본 날짜로 저장하도록 요청 형식만 호환하고 별도 입력은 받지 않습니다.
          recognitionMonth: expense.date.slice(0, 7),
          reason: '계정과목 매칭'
        });
      } else if (revenue) {
        await reviewAccountingRevenue(propertyId, revenue.id, {
          recognized: true,
          expectedRevision: revenue.revision,
          reason: '계정과목 매칭'
        });
      }
      await onSaved();
      onClose();
    } catch (error) {
      setError(error instanceof ApiError ? ERROR_MESSAGES[error.code] ?? '회계 확인 내용을 저장하지 못했습니다. 입력을 유지한 채 다시 시도해주세요.'
        : '회계 확인 내용을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const content = (
    <>
      {presentation === 'modal' && (
        <header>
          <h2
            id={'accounting-editor-title'}
          >
            {title}
          </h2>
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'매칭 닫기'}
            disabled={busy}
            onClick={onClose}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
          />
        </header>
      )}
      <form
        onSubmit={(event) => { event.preventDefault(); void save(); }}
      >
        <div
          className={styles.body}
        >
          <>
            <div
              className={styles.source}
            >
              <strong>
                {expense?.name ?? revenue?.name}
              </strong>
              <span>
                {formatInteger(expense?.amount ?? revenue?.amount ?? '0')}
                원
              </span>
              {expense && <small>
                {'출금일 '}
                {expense.date}
              </small>}
            </div>
            {expense ? (
              <>
                <Dropdown
                  label={'계정과목'}
                  required
                  value={accountId}
                  disabled={busy}
                  options={[...accounts.map((account) => ({
                    value: account.id,
                    label: [account.code, account.name].filter(Boolean).join(' ')
                  })), {
                    value: 'new',
                    label: '새 비용 과목'
                  }]}
                  onChange={(value) => {
                    setAccountId(value);
                    const candidate = expense.transferCandidates?.length === 1 ? expense.transferCandidates[0].paymentId : '';
                    setCounterpartPaymentId(expense.transferPaymentId ?? candidate);
                  }}
                />
                {isTransfer && (
                  <>
                    <Dropdown
                      label={'상대 입금'}
                      required
                      value={counterpartPaymentId}
                      disabled={busy}
                      options={(expense.transferCandidates ?? []).map((candidate) => ({
                        value: candidate.paymentId,
                        label: `${candidate.accountName} · ${candidate.name} · ${formatInteger(candidate.amount)}원`
                      }))}
                      onChange={setCounterpartPaymentId}
                    />
                    <p>
                      이미 등록된 두 거래를 연결합니다. 통장 잔액·동별 배분은 유지하고 양쪽 모두 수익·비용에서 제외합니다.
                    </p>
                    {!expense.transferCandidates?.length && (
                      <p
                        role={'alert'}
                      >
                        같은 날짜·금액·동별 배분의 다른 통장 입금이 없습니다. 통장 거래 내역을 확인해주세요.
                      </p>
                    )}
                  </>
                )}
                {accountId === 'new' && (
                  <>
                    <Input
                      label={'계정 코드'}
                      value={accountCode}
                      placeholder={'미입력 시 814~899 자동 배정'}
                      maxLength={3}
                      inputMode={'numeric'}
                      disabled={busy}
                      onChange={(event) => setAccountCode(event.target.value.replace(/\D/g, ''))}
                    />
                    <Input
                      label={'과목명'}
                      required
                      value={accountName}
                      maxLength={100}
                      disabled={busy}
                      onChange={(event) => setAccountName(event.target.value)}
                    />
                    <Dropdown
                      label={'보고서 분류'}
                      required
                      value={accountGroup}
                      disabled={busy}
                      options={[{
                        value: 'OPERATING_EXPENSE',
                        label: '운영비용'
                      }, {
                        value: 'OTHER_EXPENSE',
                        label: '영업외비용'
                      }]}
                      onChange={(value) => setAccountGroup(value as 'OPERATING_EXPENSE' | 'OTHER_EXPENSE')}
                    />
                  </>
                )}
              </>
            ) : (
              <Input
                label={'계정과목'}
                value={'401 관리비수입'}
                readOnly
              />
            )}
          </>
          {error && (
            <p
              role={'alert'}
            >
              {error}
            </p>
          )}
        </div>
        <footer>
          <Button
            variant={'outline'}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type={'submit'}
            disabled={!ready}
            loading={busy}
          >
            매칭
          </Button>
        </footer>
      </form>
    </>
  );

  if (presentation === 'page') return (
    <section
      className={`${styles.panel} ${styles.page}`}
      aria-label={title}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.panel}
      aria-labelledby={'accounting-editor-title'}
      onClose={onClose}
      busy={busy}
    >
      {content}
    </ClientModal>
  );
}
