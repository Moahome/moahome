'use client';

import { RequestError } from '@/shared/ui/server-connection-error';

import {
  BankAccountCard,
  BankIcon,
  EMPTY_BANK_ACCOUNT,
  getBankAccountErrors,
  type BankAccountDraft
} from '@/entities/banking';
import { UnitDeleteConfirmation } from '@/entities/property';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ListCard } from '@/shared/ui/list-card';
import { ListHeader } from '@/shared/ui/list-header';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  useRef,
  useState,
  type FormEvent
} from 'react';
import {
  bankAccountError,
  closeBankAccount,
  getBankAccounts,
  saveBankAccount
} from '../../../api/bankAccountApi';
import type { ManagedBankAccount } from '../../../api/bankAccountApiTypes';
import styles from './bankAccountEditor.module.css';

/** 통장 원문은 이 설정 안에서만 조회하고 목록·추가·정정·사용 종료 후 관련 업무 캐시를 갱신합니다. */
export function BankAccountEditor({ propertyId, onClose, onSaved, presentation = 'modal' }: {
  propertyId: string; onClose: () => void; onSaved: () => void;
  presentation?: 'modal' | 'page';
}) {
  const session = useSession();
  const cache = useQueryClient();
  const accounts = useQuery({
    queryKey: ['bank-account-settings', session.data?.id, propertyId],
    queryFn: () => getBankAccounts(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false
  });
  const [editing, setEditing] = useState<{ id: string; original: ManagedBankAccount | null } | null>(null);
  const [closing, setClosing] = useState<ManagedBankAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState('');
  // 삭제한 통장은 설정 목록에서 숨기되 서버 원본과 과거 거래 연결은 유지합니다.
  const rows = (accounts.data ?? []).filter((account) => account.status !== 'CLOSED');
  const primary = rows.find((row) => row.isPrimary && row.status === 'ACTIVE');

  /** 설정 저장은 과거 거래를 이동하지 않으며 열린 업무 화면이 최신 통장 목록을 다시 읽게 합니다. */
  async function refresh() {
    await accounts.refetch();
    await cache.invalidateQueries({
      predicate: (query) => query.queryKey.includes(propertyId)
      && ['payment-workspace', 'banking-workspace', 'banking-balances', 'billing-workspace'].includes(String(query.queryKey[0]))
    });
    setEditing(null);setClosing(null);onSaved();
  }
  /** 삭제 확인한 통장의 사용을 종료하고 과거 거래는 보존한 채 목록과 업무 캐시를 갱신합니다. */
  async function endUse() {
    if (!closing || pending.current) return;
    pending.current = true;setBusy(true);setMessage('');
    try { await closeBankAccount(propertyId, closing);await refresh(); }
    catch (error) { setMessage(bankAccountError(error)); }
    finally { pending.current = false;setBusy(false); }
  }

  const title = editing ? (editing.original ? '통장 수정' : '통장 추가') : '공동 납부계좌 관리';

  const header = presentation === 'page' ? (
    <ListHeader
      menu={'설정'}
      title={title}
      titleId={'bank-account-title'}
      description={'통장을 추가하고 기본 납부계좌와 사용 상태를 관리하세요.'}
    />
  ) : (
    <header
      className={styles.header}
    >
      <h2>
        {title}
      </h2>
      <Button
        variant={'ghost'}
        iconOnly
        aria-label={'관리계좌 닫기'}
        disabled={busy}
        onClick={onClose}
        leadingIcon={(
          <ServiceIcon
            name={'close'}
          />
        )}
      />
    </header>
  );

  const content = (
    <>
      {editing && primary ? (
        <AccountForm
          key={editing.id}
          propertyId={propertyId}
          id={editing.id}
          original={editing.original}
          primaryId={primary.accountId}
          onCancel={() => setEditing(null)}
          onSaved={refresh}
          onBusy={setBusy}
        />
      ) : (
        <div
          className={styles.body}
        >
          <p>
            통장은 필요한 만큼 추가하고 용도는 별칭으로 자유롭게 구분하세요. 기본 납부계좌는 하나만 지정합니다.
          </p>
          {accounts.isPending && (
            <p
              role={'status'}
            >
              관리계좌를 불러오는 중이에요.
            </p>
          )}
          {accounts.isError && (
            <RequestError
              error={accounts.error}
              onRetry={() => void accounts.refetch({
                cancelRefetch: false
              })}
            />
          )}
          <div
            className={styles['account-list']}
          >
            {rows.map((account) => (
              <section
                key={account.accountId}
                className={styles['account-card']}
              >
                <span
                  className={styles['bank-icon']}
                  aria-hidden
                >
                  <BankIcon
                    bankCode={account.bankCode}
                  />
                </span>
                <div
                  className={styles['account-identity']}
                >
                  <h3>
                    {account.alias || account.bankName}
                    {account.isPrimary ? ' · 기본 납부계좌' : ''}
                  </h3>
                  <p>
                    {`${account.bankName} ${account.accountNumber} · ${account.holderName}`}
                  </p>
                </div>
                <div
                  className={styles['account-footer']}
                >
                  {account.status === 'ACTIVE' && (
                    <div
                      className={styles['account-actions']}
                    >
                      <Button
                        size={'sm'}
                        variant={'text'}
                        tone={'success'}
                        disabled={busy}
                        onClick={() => { setMessage('');setClosing(null);setEditing({
                          id: account.accountId,
                          original: account
                        }); }}
                      >
                        수정
                      </Button>
                      {!account.isPrimary && (
                        <Button
                          size={'sm'}
                          variant={'text'}
                          tone={'danger'}
                          disabled={busy}
                          onClick={() => { setMessage('');setClosing(account); }}
                        >
                          삭제
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
          {primary && (
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => { setMessage('');setClosing(null);setEditing({
                id: crypto.randomUUID(),
                original: null
              }); }}
            >
              통장 추가
            </Button>
          )}
          {message && !closing && (
            <p
              role={'alert'}
            >
              {message}
            </p>
          )}
        </div>
      )}
      {closing && (
        <UnitDeleteConfirmation
          label={closing.alias || closing.bankName}
          title={'통장 삭제 확인'}
          description={'삭제한 통장은 목록에서 숨기고 과거 거래 내역은 보존합니다.'}
          busy={busy}
          errorMessage={message}
          onClose={() => { setMessage('');setClosing(null); }}
          onConfirm={() => void endUse()}
        />
      )}
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
      aria-label={'관리계좌'}
    >
      {header}
      <ListCard>
        {content}
      </ListCard>
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-label={'관리계좌'}
      onClose={onClose}
      busy={busy}
    >
      {header}
      {content}
    </ClientModal>
  );
}

/** 추가 요청 ID·조회 버전·입력은 저장 실패에도 유지해 중복 생성과 오래된 정보 덮어쓰기를 막습니다. */
function AccountForm({ propertyId, id, original, primaryId, onCancel, onSaved, onBusy }: {
  propertyId: string; id: string; original: ManagedBankAccount | null; primaryId: string;
  onCancel: () => void; onSaved: () => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState<BankAccountDraft>(() => original ? {
    ...original,
    alias: original.alias ?? ''
  } : {
    ...EMPTY_BANK_ACCOUNT,
    isPrimary: false
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const valid = Object.keys(getBankAccountErrors(draft)).length === 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending.current) return;
    pending.current = true;setBusy(true);onBusy(true);setMessage('');
    try { await saveBankAccount(propertyId, id, original, draft, primaryId);await onSaved(); }
    catch (error) { setMessage(bankAccountError(error)); }
    finally { pending.current = false;setBusy(false);onBusy(false); }
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      autoComplete={'off'}
    >
      <div
        className={styles.body}
      >
        <p>
          {original ? '같은 통장의 오입력만 정정합니다. 실제로 다른 통장은 목록에서 추가해주세요.' : '새 통장의 잔액은 거래내역에서 확인하기 전까지 미확인으로 표시합니다. 동별 보유금을 자동으로 늘리지 않습니다.'}
        </p>
        <BankAccountCard
          title={original ? original.alias || original.bankName : '새 통장'}
          account={draft}
          onChange={setDraft}
          onPrimaryChange={(checked) => { if (!original?.isPrimary || checked) setDraft({
            ...draft,
            isPrimary: checked
          }); }}
          disabled={busy}
        />
        {message && (
          <p
            role={'alert'}
          >
            {message}
          </p>
        )}
      </div>
      <footer
        className={styles.actions}
      >
        <Button
          variant={'outline'}
          disabled={busy}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button
          type={'submit'}
          disabled={!valid || busy}
          loading={busy}
        >
          {original ? '변경 저장' : '통장 추가'}
        </Button>
      </footer>
    </form>
  );
}
