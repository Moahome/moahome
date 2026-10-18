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
  BankAccountFields,
  getBankAccountErrors,
  type BankAccountDraft
} from '@/entities/banking';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  bankAccountError,
  correctBankAccount,
  getBankAccount,
  type BankAccountSettings
} from '../../../api/bankAccountApi';
import styles from './bankAccountEditor.module.css';

/** 모달을 닫으면 계좌 원문 캐시를 폐기하고 조회 실패에는 입력 대신 재시도를 제공합니다. */
export function BankAccountEditor({ propertyId, onClose, onSaved }: {
  propertyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const session = useSession();
  const account = useQuery({
    queryKey: ['bank-account-settings', session.data?.id, propertyId],
    queryFn: () => getBankAccount(propertyId),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false
  });

  if (account.data) return (
    <AccountForm
      propertyId={propertyId}
      original={account.data}
      onClose={onClose}
      onSaved={onSaved}
    />
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-label={'계좌 변경'}
      onClose={onClose}
    >
      <header
        className={styles.header}
      >
        <h2>
          계좌 변경
        </h2>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'계좌 변경 닫기'}
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
        {account.isPending ? (
          <p
            role={'status'}
          >
            계좌 정보를 불러오는 중이에요.
          </p>
        ) : (
          <>
            <p
              role={'alert'}
            >
              {bankAccountError(account.error)}
            </p>
            <Button
              variant={'outline'}
              onClick={() => void account.refetch()}
            >
              다시 시도
            </Button>
          </>
        )}
      </div>
    </ClientModal>
  );
}

/** 기존 계좌의 정보만 정정하고 저장 실패에는 입력을 유지하며 성공 후 관련 표시를 갱신합니다. */
function AccountForm({ propertyId, original, onClose, onSaved }: {
  propertyId: string;
  original: BankAccountSettings;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<BankAccountDraft>(() => ({
    ...original,
    isPrimary: true
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const valid = Object.keys(getBankAccountErrors(draft)).length === 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await correctBankAccount(propertyId, original, draft);
      onSaved();
      void cache.invalidateQueries({
        predicate: (query) => query.queryKey.includes(propertyId)
          && ['payment-workspace', 'banking-workspace', 'banking-balances', 'billing-workspace'].includes(String(query.queryKey[0]))
      });
    } catch (error) {
      setMessage(bankAccountError(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <ClientModal
      className={styles.modal}
      aria-label={'계좌 변경'}
      onClose={onClose}
      busy={busy}
    >
      <header
        className={styles.header}
      >
        <h2>
          계좌 변경
        </h2>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'계좌 변경 닫기'}
          onClick={onClose}
          disabled={busy}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <form
        onSubmit={submit}
        noValidate
        autoComplete={'off'}
      >
        <div
          className={styles.body}
        >
          <p>
            기존 계좌의 은행·계좌번호·예금주를 정정합니다. 연결된 거래와 잔고는 유지됩니다.
          </p>
          <fieldset
            className={styles.fields}
            disabled={busy}
          >
            <BankAccountFields
              account={draft}
              onChange={setDraft}
            />
          </fieldset>
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
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type={'submit'}
            disabled={!valid || busy}
            loading={busy}
          >
            변경 저장
          </Button>
        </footer>
      </form>
    </ClientModal>
  );
}
