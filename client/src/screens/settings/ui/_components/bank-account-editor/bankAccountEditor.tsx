'use client';

import {
  useRef,
  useState,
  type FormEvent
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import {
  BankAccountCard,
  EMPTY_BANK_ACCOUNT,
  getBankAccountErrors,
  type BankAccountDraft
} from '@/entities/banking';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  bankAccountError,
  getBankAccounts,
  saveBankAccount,
  closeBankAccount,
  type ManagedBankAccount
} from '../../../api/bankAccountApi';
import styles from './bankAccountEditor.module.css';

/** 통장 원문은 이 설정 안에서만 조회하고 목록·추가·정정·사용 종료 후 관련 업무 캐시를 갱신합니다. */
export function BankAccountEditor({ propertyId, onClose, onSaved }: {
  propertyId: string; onClose: () => void; onSaved: () => void;
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
  const rows = accounts.data ?? [];
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
  async function endUse() {
    if (!closing || pending.current) return;
    pending.current = true;setBusy(true);setMessage('');
    try { await closeBankAccount(propertyId, closing);await refresh(); }
    catch (error) { setMessage(bankAccountError(error)); }
    finally { pending.current = false;setBusy(false); }
  }

  const title = editing ? (editing.original ? '통장 정보 정정' : '통장 추가') : '공동 납부계좌 관리';

  return (
    <ClientModal
      className={styles.modal}
      aria-label={'관리계좌'}
      onClose={onClose}
      busy={busy}
    >
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
            <>
              <p
                role={'alert'}
              >
                {bankAccountError(accounts.error)}
              </p>
              <Button
                variant={'outline'}
                onClick={() => void accounts.refetch()}
              >
                다시 시도
              </Button>
            </>
          )}
          {rows.map((account) => (
            <section
              key={account.accountId}
              className={styles['account-card']}
            >
              <h3>
                {account.alias || account.bankName}
                {account.isPrimary ? ' · 기본 납부계좌' : ''}
              </h3>
              <p>
                {`${account.bankName} ${account.accountNumber} · ${account.holderName}`}
              </p>
              <p>
                {account.status === 'ACTIVE' ? '사용 중' : '사용 종료 · 과거 내역 보존'}
              </p>
              {account.status === 'ACTIVE' && (
                <div
                  className={styles['account-actions']}
                >
                  <Button
                    variant={'outline'}
                    disabled={busy}
                    onClick={() => { setMessage('');setEditing({
                      id: account.accountId,
                      original: account
                    }); }}
                  >
                    정보 정정
                  </Button>
                  {!account.isPrimary && (
                    <Button
                      variant={'text'}
                      disabled={busy}
                      onClick={() => { setMessage('');setClosing(account); }}
                    >
                      사용 종료
                    </Button>
                  )}
                </div>
              )}
            </section>
          ))}
          {primary && (
            <Button
              variant={'outline'}
              disabled={busy}
              onClick={() => setEditing({
                id: crypto.randomUUID(),
                original: null
              })}
            >
              통장 추가
            </Button>
          )}
          {closing && (
            <section
              className={styles['account-card']}
            >
              <p>
                {`${closing.alias || closing.bankName} 통장의 사용을 종료할까요? 새 거래 등록은 중단하고 과거 내역은 보존합니다.`}
              </p>
              <div
                className={styles['account-actions']}
              >
                <Button
                  variant={'outline'}
                  disabled={busy}
                  onClick={() => setClosing(null)}
                >
                  취소
                </Button>
                <Button
                  disabled={busy}
                  loading={busy}
                  onClick={() => void endUse()}
                >
                  사용 종료 확인
                </Button>
              </div>
            </section>
          )}
          {message && (
            <p
              role={'alert'}
            >
              {message}
            </p>
          )}
        </div>
      )}
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
