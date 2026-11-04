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
import { MonthPicker } from '@/shared/ui/month-picker';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  configureAccounting,
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

export type AccountingEditorTarget = { kind: 'setup' }
  | { kind: 'expense'; value: AccountingExpense }
  | { kind: 'revenue'; value: AccountingRevenueItem };

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNTING_REVIEW_CONFLICT: '다른 확인 내역이 저장됐습니다. 최신 회계 자료를 다시 확인해주세요.',
  ACCOUNTING_SETTINGS_CONFLICT: '저장한 회계 시작 기준은 직접 덮어쓸 수 없습니다.',
  ACCOUNTING_SOURCE_NOT_FOUND: '삭제되었거나 현재 유효하지 않은 원천입니다. 최신 자료를 다시 확인해주세요.',
  ACCOUNTING_SETUP_REQUIRED: '회계 시작 기준을 먼저 설정해주세요.',
  ACCOUNTING_EXTERNAL_REVIEW_REQUIRED: '외부 부담·회수 권리의 회계 처리를 먼저 확인해주세요.',
  INVALID_ACCOUNTING_ACCOUNT: '선택한 비용 과목을 확인해주세요.',
  INVALID_ACCOUNTING_REQUEST: '회계 입력 내용을 확인해주세요.'
};

/** 관리자가 명시한 기준만 저장하며 실패 시 입력을 유지하고 기존 원천의 금액·날짜는 수정하지 않습니다. */
export function AccountingEditor({ propertyId, data, target, onClose, onSaved }: {
  propertyId: string;
  data: IncomeStatementWorkspace;
  target: AccountingEditorTarget;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const expense = target.kind === 'expense' ? target.value : null;
  const revenue = target.kind === 'revenue' ? target.value : null;
  const accounts = data.accounts.filter((account) => account.group.endsWith('Expense'));
  const [month, setMonth] = useState(expense?.recognitionMonth ?? '');
  const [fiscalStart, setFiscalStart] = useState('');
  const [accountId, setAccountId] = useState(expense?.accountId ?? (accounts.length ? '' : 'new'));
  const [accountName, setAccountName] = useState('');
  const [accountGroup, setAccountGroup] = useState<'OPERATING_EXPENSE' | 'OTHER_EXPENSE'>('OPERATING_EXPENSE');
  const [nature, setNature] = useState(revenue && revenue.revision > 0 ? (revenue.recognized ? 'general' : 'review') : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = target.kind === 'setup' ? '회계 시작 기준' : expense ? '지출 분류' : '수익 분류';
  const ready = target.kind === 'setup' ? Boolean(month && fiscalStart)
    : Boolean(reason.trim() && (expense ? month && accountId && (accountId !== 'new' || accountName.trim()) : nature));

  /** 과목 추가와 지출 확인은 순서대로 요청하고 재시도는 서버의 명칭·버전 중복 방지 규칙을 따릅니다. */
  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      if (target.kind === 'setup') {
        await configureAccounting(propertyId, {
          startMonth: month,
          fiscalYearStartMonth: Number(fiscalStart)
        });
      } else if (expense) {
        const selected = accountId === 'new'
          ? await createAccountingAccount(propertyId, {
            name: accountName.trim(),
            group: accountGroup
          }) : accountId;
        await reviewAccountingExpense(propertyId, expense.id, {
          accountId: selected,
          recognitionMonth: month,
          expectedRevision: expense.revision,
          reason: reason.trim()
        });
      } else if (revenue) {
        await reviewAccountingRevenue(propertyId, revenue.id, {
          recognized: nature === 'general',
          expectedRevision: revenue.revision,
          reason: reason.trim()
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

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'accounting-editor-title'}
      onClose={onClose}
      busy={busy}
    >
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
          aria-label={'분류 닫기'}
          disabled={busy}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <form
        onSubmit={(event) => { event.preventDefault(); void save(); }}
      >
        <div
          className={styles.body}
        >
          {target.kind === 'setup' ? (
            <>
              <p>
                기존 인계 미수·선입금·통장 잔액을 신규 수익으로 만들지 않습니다. 저장한 시작 기준은 직접 덮어쓸 수 없으니 확인 후 저장해주세요.
              </p>
              <MonthPicker
                label={'회계 시작 월'}
                required
                variant={'input'}
                placeholder={'월 선택'}
                value={month}
                disabled={busy}
                onChange={setMonth}
              />
              <Dropdown
                label={'회계연도 시작 월'}
                value={fiscalStart}
                disabled={busy}
                options={Array.from({
                  length: 12
                }, (_, index) => ({
                  value: String(index + 1),
                  label: `${index + 1}월`
                }))}
                onChange={setFiscalStart}
              />
            </>
          ) : (
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
                    label={'비용 과목'}
                    value={accountId}
                    disabled={busy}
                    options={[...accounts.map((account) => ({
                      value: account.id,
                      label: account.name
                    })), {
                      value: 'new',
                      label: '새 비용 과목'
                    }]}
                    onChange={setAccountId}
                  />
                  {accountId === 'new' && (
                    <>
                      <Input
                        label={'과목명'}
                        value={accountName}
                        maxLength={100}
                        disabled={busy}
                        onChange={(event) => setAccountName(event.target.value)}
                      />
                      <Dropdown
                        label={'보고서 분류'}
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
                  <MonthPicker
                    label={'비용 귀속 월'}
                    required
                    variant={'input'}
                    placeholder={'월 선택'}
                    value={month}
                    disabled={busy}
                    onChange={setMonth}
                  />
                  <p>
                    실제 출금일과 비용 귀속 월은 다를 수 있습니다. 이 확인은 기존 출금·부담 배분을 변경하지 않습니다.
                  </p>
                </>
              ) : (
                <>
                  <Dropdown
                    label={'항목 성격'}
                    value={nature}
                    disabled={busy}
                    options={[{
                      value: 'general',
                      label: '일반 관리비수익'
                    }, {
                      value: 'review',
                      label: '예치·적립 등 별도 확인'
                    }]}
                    onChange={setNature}
                  />
                  <p>
                    같은 부과 항목의 확정 청구에 적용합니다. 일반 관리비는 부과월의 수익에 반영하고, 예치·적립 성격은 별도 확인 대상으로 남깁니다.
                  </p>
                </>
              )}
              <Input
                label={'변경 사유'}
                value={reason}
                maxLength={500}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </>
          )}
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
            저장
          </Button>
        </footer>
      </form>
    </ClientModal>
  );
}
