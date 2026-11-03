'use client';

import { getBankAccountLabel } from '@/entities/banking';


import {
  useEffect,
  useRef,
  useState
} from 'react';
import {
  correctInitialBalances,
  openingBalanceError,
  type OpeningWorkspace
} from '@/features/billing-management';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import {
  AmountInput,
  Input
} from '@/shared/ui/form-controls';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './openingBalances.module.css';

/** 초기 기준만 정정하며 실패에는 입력·요청 ID를 유지하고 모바일에서는 독립 페이지로 표시합니다. */
export function InitialBalanceEditor({ data, page = false, onClose, onSaved }: {
  data: OpeningWorkspace;
  page?: boolean;
  onClose: () => void;
  onSaved: (saved: OpeningWorkspace) => void;
}) {
  const cutoff = data.batch?.cutoffDate ?? '';
  const [accounts, setAccounts] = useState(data.accounts.filter((account) => account.initialBalance !== false));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const allowed = data.initialCorrectionAllowed === true && data.batch?.status === 'CONFIRMED';
  const content = (
    <>
      {!page && (
        <header
          className={styles['section-heading']}
        >
          <h2
            id={'initial-balance-title'}
          >
            초기 기준 정정
          </h2>
          <Button
            iconOnly
            variant={'ghost'}
            aria-label={'초기 기준 정정 닫기'}
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
        className={styles.editor}
        noValidate
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending.current || !allowed || !data.batch) return;
          if (!cutoff || !reason.trim() || [...reason.trim()].length > 500 || accounts.some((a) => !/^[0-9]{1,15}$/.test(a.amount))) {
            setError('기준일, 시작 금액과 정정 사유를 확인해주세요.'); return;
          }
          const payload = {
            revision: data.batch.revision,
            cutoffDate: cutoff,
            reason: reason.trim(),
            accounts: accounts.map(({ accountId, amount }) => ({
              accountId,
              amount
            }))
          };
          const body = JSON.stringify(payload);
          if (request.current?.body !== body) request.current = {
            body,
            id: crypto.randomUUID()
          };
          pending.current = true; setBusy(true); setError('');
          try {
            const saved = await correctInitialBalances(data.propertyId, data.batch.id, {
              id: request.current.id,
              ...payload
            });
            if (active.current) onSaved(saved);
          } catch (failure) {
            if (active.current) setError(openingBalanceError(failure));
          } finally {
            pending.current = false;
            if (active.current) setBusy(false);
          }
        }}
      >
        <p>
          {data.correctionDeadline ? `${data.correctionDeadline}까지 초기 기준을 정정할 수 있습니다.` : '초기 기준 정정 기간을 확인할 수 없습니다.'}
        </p>
        {!allowed && (
          <p
            role={'status'}
          >
            초기 기준 정정이 잠겨 있습니다.
          </p>
        )}
        <fieldset
          className={styles['correction-fields']}
          disabled={busy || !allowed}
        >
          <CalendarPicker
            label={'초기 기준일'}
            value={cutoff}
            required
            disabled
            onChange={() => {}}
          />
          <p>
            기준일 변경은 통장 관리의 초기 잔액 정정에서 관리비 부과·동별 보유금과 함께 처리합니다.
          </p>
          {accounts.map((account) => (
            <AmountInput
              key={account.accountId}
              label={`${getBankAccountLabel(account)} 시작 잔액`}
              value={account.amount}
              onChange={(value) => setAccounts((rows) => rows.map((row) => row.accountId === account.accountId ? {
                ...row,
                amount: value
              } : row))}
            />
          ))}
          <Input
            label={'정정 사유'}
            value={reason}
            required
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </fieldset>
        {error && (
          <p
            className={styles.error}
            role={'alert'}
          >
            {error}
          </p>
        )}
        <div
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </Button>
          {allowed && (
            <Button
              type={'submit'}
              loading={busy}
              disabled={!allowed}
            >
              정정 저장
            </Button>
          )}
        </div>
      </form>
    </>
  );
  if (page) return content;
  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'initial-balance-title'}
      busy={busy}
      onClose={onClose}
    >
      {content}
    </ClientModal>
  );
}
