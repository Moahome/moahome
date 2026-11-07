'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  ACCOUNT_GROUP_LABELS,
  acceptsAccountCode,
  changeAccountingAccountStatus,
  createAccountingAccount,
  deleteAccountingAccount,
  editAccountingAccount,
  getAccountingAccountHistory,
  getAccountPermissions,
  getAccountType,
  type AccountGroup,
  type AccountingAccountSetting
} from '@/features/accounting-accounts';
import { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { DataTable } from '@/shared/ui/data-table';
import {
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { RequestError } from '@/shared/ui/server-connection-error';
import { SummaryCard } from '@/shared/ui/summary-card';
import { LoadingState } from '@/shared/ui/state-message';
import styles from './accountEditor.module.css';

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNTING_ACCOUNT_PROTECTED: '기본 제공 과목의 보호된 항목은 변경할 수 없습니다.',
  ACCOUNTING_ACCOUNT_USED: '사용한 과목은 이름만 변경할 수 있으며 삭제할 수 없습니다.',
  ACCOUNTING_ACCOUNT_CONFLICT: '다른 변경이 저장됐습니다. 입력은 유지되며 창을 닫고 최신 과목을 다시 확인해주세요.',
  ACCOUNTING_CODE_CONFLICT: '같은 코드 또는 같은 분류의 과목명이 이미 있습니다.',
  ACCOUNTING_CODE_EXHAUSTED: '이 유형에 배정할 수 있는 코드가 없습니다.',
  INVALID_ACCOUNTING_ACCOUNT: '유형에 맞는 코드와 사용 가능한 과목을 확인해주세요.',
  ACCESS_DENIED: '계정과목을 변경할 권한이 없습니다.'
};

/** 과목의 보호·사용 여부에 따라 입력과 행동을 제한하고 실패 시 입력을 유지합니다. 서버에서도 같은 규칙을 검증합니다. */
export function AccountEditor({ propertyId, account, canManage, onClose, onSaved }: {
  propertyId: string;
  account: AccountingAccountSetting | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const session = useSession();
  const [editing, setEditing] = useState(!account);
  const [name, setName] = useState(account?.name ?? '');
  const [code, setCode] = useState(account?.code ?? '');
  const [group, setGroup] = useState<AccountGroup>(account?.group ?? 'OPERATING_EXPENSE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<'status' | 'delete' | null>(null);
  const permissions = account ? getAccountPermissions(account, canManage) : null;
  const history = useQuery({
    queryKey: ['accounting-account-history', session.data?.id, propertyId, account?.id, account?.revision],
    queryFn: ({ signal }) => getAccountingAccountHistory(propertyId, account!.id, signal),
    enabled: Boolean(account),
    retry: false,
    gcTime: 0
  });
  const codeError = code && !acceptsAccountCode(group, code) ? '선택한 유형에 맞는 세 자리 코드를 입력해주세요.' : '';
  let title = account ? '계정과목 상세' : '과목 추가';
  if (account && editing) title = '과목 수정';
  if (confirmation === 'delete') title = '과목 삭제';
  if (confirmation === 'status') title = account?.active ? '사용 중지' : '사용 재개';

  /** 확인한 최신 revision을 전송하고 저장·상태 변경·삭제가 성공했을 때만 목록을 갱신합니다. */
  async function save(action: 'save' | 'status' | 'delete') {
    if (busy || !canManage) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'delete' && account) await deleteAccountingAccount(propertyId, account.id, account.revision);
      else if (action === 'status' && account) await changeAccountingAccountStatus(propertyId, account.id, !account.active, account.revision);
      else if (account) await editAccountingAccount(propertyId, account.id, {
        name: name.trim(),
        code,
        group,
        expectedRevision: account.revision
      });
      else await createAccountingAccount(propertyId, {
        name: name.trim(),
        code: code || undefined,
        group
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? ERROR_MESSAGES[cause.code] ?? '저장하지 못했어요. 입력을 확인한 뒤 다시 시도해주세요.' : '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ClientModal
      className={styles.panel}
      aria-labelledby={'account-editor-title'}
      onClose={onClose}
      busy={busy}
    >
      <header>
        <h2
          id={'account-editor-title'}
        >
          {title}
        </h2>
        <Button
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'닫기'}
          disabled={busy}
          onClick={onClose}
        >
          <ServiceIcon
            name={'close'}
          />
        </Button>
      </header>
      {confirmation ? (
        <>
          <div
            className={styles.body}
          >
            <strong>
              {account?.code}
              {' '}
              ·
              {' '}
              {account?.name}
            </strong>
            {confirmation === 'delete' && (
              <p>
                이 과목을 삭제할까요? 사용 이력이 없는 추가 과목만 삭제할 수 있습니다.
              </p>
            )}
            {confirmation === 'status' && (
              <p>
                {account?.active ? '새 거래에서 선택할 수 없게 됩니다. 기존 거래와 손익·원장 내역은 유지됩니다.' : '새 거래에서 다시 선택할 수 있습니다.'}
              </p>
            )}
            {error && (
              <p
                className={styles.error}
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
              onClick={() => { setConfirmation(null); setError(''); }}
            >
              취소
            </Button>
            <Button
              tone={confirmation === 'delete' ? 'danger' : undefined}
              loading={busy}
              onClick={() => void save(confirmation)}
            >
              {confirmation === 'delete' ? '삭제' : title}
            </Button>
          </footer>
        </>
      ) : (
        <form
          onSubmit={(event) => { event.preventDefault(); if (!codeError && name.trim()) void save('save'); }}
        >
          <div
            className={styles.body}
          >
            {account && (
              <div
                className={styles.banner}
              >
                <ServiceIcon
                  name={'info'}
                />
                <p>
                  {account.defaultAccount ? '기본 제공 과목입니다. 이름·코드·분류는 변경할 수 없습니다.' : '직접 추가한 과목입니다.'}
                  {!account.defaultAccount && account.used && ' 사용한 과목은 이름만 변경할 수 있습니다.'}
                </p>
              </div>
            )}
            <Input
              label={'과목명'}
              value={name}
              maxLength={100}
              required
              readOnly={!editing}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
            <div
              className={styles.fields}
            >
              <Input
                label={'코드'}
                value={code}
                digitsOnly
                maxLength={3}
                required={Boolean(account)}
                readOnly={!editing || (Boolean(account) && !permissions?.editClassification)}
                disabled={busy}
                placeholder={'자동 배정'}
                error={editing ? codeError : undefined}
                description={!account ? '비워두면 유형에 맞는 코드를 자동 배정합니다.' : undefined}
                onChange={(event) => setCode(event.target.value)}
              />
              <Dropdown
                label={'유형·손익 분류'}
                value={group}
                required
                disabled={busy || !editing || (Boolean(account) && !permissions?.editClassification)}
                options={(Object.entries(ACCOUNT_GROUP_LABELS) as [AccountGroup, string][]).map(([value, label]) => ({
                  value,
                  label: ['ASSET', 'LIABILITY'].includes(value) ? label : `${getAccountType(value)} · ${label}`
                }))}
                onChange={(value) => setGroup(value as AccountGroup)}
              />
            </div>
            {account && !editing && (
              <>
                <div
                  className={styles.metadata}
                >
                  <SummaryCard
                    label={'사용 상태'}
                    value={account.active ? '사용 중' : '사용 중지'}
                    unit={''}
                    tone={account.active ? 'primary' : 'neutral'}
                    density={'compact'}
                    surface={'subtle'}
                    icon={(
                      <ServiceIcon
                        name={account.active ? 'check' : 'close'}
                      />
                    )}
                  />
                  <SummaryCard
                    label={'업무 사용'}
                    value={account.used ? '사용 이력 있음' : '사용 이력 없음'}
                    unit={''}
                    density={'compact'}
                    surface={'subtle'}
                    icon={(
                      <ServiceIcon
                        name={'document'}
                      />
                    )}
                  />
                </div>
                <section
                  className={styles.history}
                  aria-labelledby={'account-history-title'}
                >
                  <h3
                    id={'account-history-title'}
                  >
                    변경 이력
                  </h3>
                  {history.isPending && (
                    <LoadingState
                      layout={'inline'}
                      title={'변경 이력을 불러오고 있어요.'}
                    />
                  )}
                  {history.isError && (
                    <RequestError
                      error={history.error}
                      retrying={history.isFetching}
                      onRetry={() => void history.refetch()}
                    />
                  )}
                  {history.data && history.data.some((row) => row.revision > 0) && (
                    <DataTable
                      label={'계정과목 변경 이력'}
                      rows={history.data}
                      getRowKey={(row) => String(row.revision)}
                      minWidth={500}
                      columns={[
                        {
                          key: 'date',
                          header: '변경일',
                          render: (row) => new Intl.DateTimeFormat('sv-SE', {
                            timeZone: 'Asia/Seoul'
                          }).format(new Date(row.changedAt))
                        },
                        {
                          key: 'code',
                          header: '코드',
                          render: (row) => row.code
                        },
                        {
                          key: 'name',
                          header: '과목명',
                          render: (row) => row.name
                        },
                        {
                          key: 'group',
                          header: '분류',
                          render: (row) => ACCOUNT_GROUP_LABELS[row.group]
                        },
                        {
                          key: 'status',
                          header: '상태',
                          render: (row) => row.active ? '사용 중' : '사용 중지'
                        }
                      ]}
                      emptyState={'변경 이력이 없습니다.'}
                    />
                  )}
                  {history.data && !history.data.some((row) => row.revision > 0) && (
                    <div
                      className={styles['empty-history']}
                      role={'status'}
                    >
                      <ServiceIcon
                        name={'clock'}
                      />
                      <strong>
                        아직 변경 이력이 없습니다.
                      </strong>
                      <p>
                        변경이 발생하면 이 영역에 기록됩니다.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
            {error && (
              <p
                className={styles.error}
                role={'alert'}
              >
                {error}
              </p>
            )}
          </div>
          {(editing || permissions?.editName || permissions?.changeStatus || permissions?.delete) && (
            <footer>
              {editing && (
                <>
                  <Button
                    variant={'outline'}
                    disabled={busy}
                    onClick={() => { if (!account) onClose(); else { setEditing(false); setName(account.name); setCode(account.code); setGroup(account.group); setError(''); } }}
                  >
                    취소
                  </Button>
                  <Button
                    type={'submit'}
                    loading={busy}
                    disabled={!name.trim() || Boolean(codeError) || (Boolean(account) && !code)}
                  >
                    저장
                  </Button>
                </>
              )}
              {!editing && (
                <>
                  {permissions?.delete && (
                    <Button
                      variant={'outline'}
                      tone={'danger'}
                      onClick={() => { setConfirmation('delete'); setError(''); }}
                    >
                      삭제
                    </Button>
                  )}
                  {permissions?.changeStatus && (
                    <Button
                      variant={'outline'}
                      onClick={() => { setConfirmation('status'); setError(''); }}
                    >
                      {account?.active ? '사용 중지' : '재개'}
                    </Button>
                  )}
                  {permissions?.editName && (
                    <Button
                      onClick={() => setEditing(true)}
                    >
                      수정
                    </Button>
                  )}
                </>
              )}
            </footer>
          )}
        </form>
      )}
    </ClientModal>
  );
}
