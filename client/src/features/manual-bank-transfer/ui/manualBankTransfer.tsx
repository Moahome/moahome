'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  TransferAllocationEditor,
  calculateTransferAllocation,
  type ManualTransferSeed,
  type TransferAllocationPart
} from '@/entities/banking';
import { useSession } from '@/entities/session';
import { capturePropertyQueryScope } from '@/entities/property';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import {
  AmountInput,
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { formatWon } from '@/shared/lib/format';
import {
  createManualBankTransfer,
  getManualTransferFunds,
  manualTransferError
} from '../api/manualBankTransferApi';
import styles from './manualBankTransfer.module.css';

/** 기존 입금·지출 모달의 본문에 이체 입력만 조합하며 모달 자체를 교체하지 않습니다. */
export function ManualBankTransfer({ propertyId, accounts, buildings, asOf, seed, children, onClose, onCreated, onBusyChange }: {
  propertyId: string;
  accounts: readonly { id: string; label: string }[];
  buildings: readonly { id: string; label: string }[];
  asOf: string;
  seed: ManualTransferSeed;
  children: ReactNode;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onCreated: (id: string, date: string, fromAccountId: string, toAccountId: string) => void;
}) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const session = useSession();
  const scope = capturePropertyQueryScope(session.data?.id, propertyId);
  const cache = useQueryClient();
  const [id] = useState(() => crypto.randomUUID());
  const [from, setFrom] = useState(seed.direction === 'EXPENSE' ? seed.accountId : '');
  const [to, setTo] = useState(seed.direction === 'INCOME' ? seed.accountId : '');
  const [date, setDate] = useState(seed.date || asOf);
  const [amount, setAmount] = useState(seed.amount);
  const [note, setNote] = useState(seed.note ?? '');
  const [parts, setParts] = useState<TransferAllocationPart[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const funds = useQuery({
    queryKey: ['banking-balances', session.data?.id, propertyId, 'manual-transfer', from, date],
    queryFn: ({ signal }) => getManualTransferFunds(propertyId, from, date, signal),
    enabled: Boolean(session.data && accounts.some((account) => account.id === from) && date && date <= asOf),
    retry: false,
    staleTime: 0,
    gcTime: 0
  });
  const limits = Object.fromEntries((funds.isFetching || funds.isError ? [] : funds.data?.buildings ?? []).map((value) => [value.buildingId, value.available]));
  const validAmount = /^[0-9]{1,15}$/.test(amount) && BigInt(amount) > BigInt(0);
  const allocation = calculateTransferAllocation(validAmount ? amount : '0', parts, buildings.length > 0, limits);
  const available = funds.isFetching || funds.isError ? null : funds.data?.accountAvailable;
  const exceeds = validAmount && available != null && BigInt(amount) > BigInt(available);
  const canSave = accounts.some((account) => account.id === from) && accounts.some((account) => account.id === to)
    && from !== to && date && date <= asOf && validAmount && !allocation.error && available != null && !exceeds;

  /** 응답 유실에도 같은 ID로 재시도하며 이전 관리대상으로 돌아온 응답이 현재 화면을 바꾸지 않게 합니다. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (pending.current || !canSave) return;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      await createManualBankTransfer(propertyId, {
        id,
        fromAccountId: from,
        toAccountId: to,
        date,
        amount,
        note: note.trim() || undefined,
        allocations: allocation.allocations
      });
      await Promise.all(['banking-workspace', 'banking-balances', 'payment-workspace', 'income-statement', 'monthly-settlement', 'dashboard'].map((key) => cache.invalidateQueries({
        queryKey: [key, session.data?.id, propertyId]
      })));
      const current = cache.getQueryData<{ id: string }>(['session', 'current-user']);
      if (mounted.current && current?.id === scope.userId && capturePropertyQueryScope(scope.userId, propertyId).revision === scope.revision) onCreated(id, date, from, to);
    } catch (failure) {
      setError(manualTransferError(failure));
      void funds.refetch();
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <form
      className={styles.form}
      onSubmit={(event) => { void submit(event); }}
    >
      <div
        className={styles.body}
      >
        <fieldset
          className={styles.inputs}
          disabled={busy}
        >
          {children}
          <div
            className={styles.fields}
          >
            <Dropdown
              label={'출금 통장'}
              required
              value={from}
              onChange={(value) => {
                setFrom(value);
                if (value === to) setTo('');
              }}
              options={accounts.map((account) => ({
                value: account.id,
                label: account.label
              }))}
            />
            <Dropdown
              label={'입금 통장'}
              required
              value={to}
              onChange={setTo}
              options={accounts.filter((account) => account.id !== from).map((account) => ({
                value: account.id,
                label: account.label
              }))}
            />
            <CalendarPicker
              label={'이체일'}
              required
              maxDate={asOf}
              value={date}
              onChange={setDate}
              variant={'input'}
            />
            <AmountInput
              label={'이체금액'}
              required
              value={amount}
              onChange={setAmount}
              trailingContent={'원'}
            />
          </div>
          {from && (
            <p
              className={styles.available}
            >
              {available == null ? '이체 가능 금액을 확인해주세요.' : (
                <>
                  {'통장 이체 가능 '}
                  <strong>
                    {formatWon(available)}
                  </strong>
                </>
              )}
            </p>
          )}
          {funds.isFetching && (
            <p
              role={'status'}
            >
              이체 가능 금액을 확인하고 있어요.
            </p>
          )}
          {funds.isError && (
            <p
              role={'alert'}
              className={styles.error}
            >
              이체 가능 금액을 불러오지 못했어요.
              <Button
                variant={'text'}
                onClick={() => { void funds.refetch(); }}
              >
                다시 시도
              </Button>
            </p>
          )}
          {exceeds && (
            <p
              role={'alert'}
              className={styles.error}
            >
              이체금액이 출금 통장의 보유금을 초과합니다.
            </p>
          )}
          {buildings.length > 0 && validAmount && (
            <TransferAllocationEditor
              key={'allocation'}
              total={amount}
              buildings={buildings}
              value={parts}
              onChange={setParts}
              disabled={busy}
              limits={limits}
            />
          )}
          <Input
            label={'메모'}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />
          {error && (
            <p
              role={'alert'}
              className={styles.error}
            >
              {error}
            </p>
          )}
        </fieldset>
      </div>
      <footer
        className={styles.actions}
      >
        <Button
          variant={'outline'}
          tone={'neutral'}
          disabled={busy}
          onClick={onClose}
        >
          취소
        </Button>
        <Button
          disabled={busy || !canSave}
          loading={busy}
          type={'submit'}
        >
          등록
        </Button>
      </footer>
    </form>
  );
}
