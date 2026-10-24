'use client';

import { RequestError } from '@/shared/ui/server-connection-error';

import { AllocationEditor } from '@/entities/banking';
import { useSession } from '@/entities/session';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  AmountInput,
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
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
  bankingError,
  createManualExpense,
  getBankingWorkspace
} from '../../api/bankingApi';
import type { ExpenseDraft } from '../../api/bankingApiTypes';
import {
  calculateExpenseAllocation,
  sortExpenseLabels
} from '../../model/expenseAllocation';
import styles from './manualExpense.module.css';

/** PC 모달과 모바일 페이지에서 같은 등록·배분·재시도를 사용하고 저장 성공 후 원장을 갱신합니다. */
export function ManualExpense({
  propertyId,
  initialAccountId,
  presentation = 'modal',
  onClose,
  onCreated
}: {
  propertyId: string;
  initialAccountId?: string;
  presentation?: 'modal' | 'page';
  onClose: () => void;
  onCreated: (id: string, date: string, accountId: string) => void;
}) {
  const session = useSession();
  const cache = useQueryClient();
  const queryKey = ['banking-workspace', session.data?.id, propertyId];
  const workspace = useQuery({
    queryKey,
    queryFn: () => getBankingWorkspace(propertyId),
    enabled: Boolean(session.data),
    retry: false
  });
  const [requestId] = useState(() => crypto.randomUUID());
  const [selectedAccount, setSelectedAccount] = useState(initialAccountId ?? '');
  const [enteredDate, setEnteredDate] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [edited, setEdited] = useState<ExpenseDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const data = workspace.data;
  const accounts = (data?.accounts ?? []).filter((account) => account.status === 'ACTIVE');
  const accountId = selectedAccount || accounts.find((account) => account.isPrimary)?.id || accounts[0]?.id || '';
  const date = enteredDate ?? data?.asOf ?? '';
  const draft: ExpenseDraft = edited ?? {
    category: '',
    note: '',
    mode: 'EQUAL',
    saveAsRule: false,
    allocations: sortExpenseLabels(data?.buildings ?? []).map((building) => ({
      buildingId: building.id,
      label: building.label,
      amount: '',
      percentage: ''
    }))
  };

  // 초과·미배분·원 미만 잔액과 필수 입력 오류는 등록 버튼 활성화와 제출 검증에 같은 계산을 사용합니다.
  const validAmount = /^[0-9]{1,15}$/.test(amount) && BigInt(amount) > BigInt(0);
  const split = calculateExpenseAllocation(validAmount ? amount : '0', draft);
  const canSubmit = Boolean(data && accounts.some((account) => account.id === accountId)
    && date && date <= data.asOf && validAmount && !split.error);

  /** 입력은 실패 시 그대로 두고 같은 요청 ID를 재사용해 응답 유실·중복 클릭에도 한 번만 반영합니다. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data || busyRef.current) return;
    if (!accounts.some((account) => account.id === accountId)) {
      setError('출금 통장을 선택해주세요.');
      return;
    }
    if (!date || date > data.asOf) {
      setError('오늘 또는 이전 출금일을 선택해주세요.');
      return;
    }
    if (!validAmount) {
      setError('0원보다 큰 출금액을 입력해주세요.');
      return;
    }
    if (split.error) {
      setError(split.error);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await cache.cancelQueries({
        queryKey
      });
      const saved = await createManualExpense(propertyId, {
        id: requestId,
        accountId,
        date,
        amount,
        category: draft.category.trim(),
        note: draft.note.trim(),
        mode: draft.mode,
        allocations: split.allocations
      });
      cache.setQueryData(queryKey, saved);
      void cache.invalidateQueries({
        queryKey: ['banking-balances', session.data?.id, propertyId]
      });
      onCreated(requestId, date, accountId);
    } catch (failure) {
      setError(bankingError(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const content = (
    <>
      {presentation === 'page' ? (
        <ListHeader
          menu={'통장 관리'}
          title={'수동 지출 등록'}
          titleId={'manual-expense-title'}
          description={'출금 정보와 부담할 동을 입력해주세요.'}
        />
      ) : (
        <header
          className={styles.header}
        >
          <div>
            <p>
              통장 관리
            </p>
            <h2
              id={'manual-expense-title'}
            >
              수동 지출 등록
            </h2>
          </div>
          <Button
            variant={'ghost'}
            iconOnly
            aria-label={'수동 지출 등록 닫기'}
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
      {workspace.isPending ? (
        <p
          role={'status'}
        >
          지출 등록 정보를 불러오고 있어요.
        </p>
      ) : !data ? (
        <RequestError
          error={workspace.error}
          onRetry={() => void workspace.refetch({
            cancelRefetch: false
          })}
        />
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className={styles.form}
        >
          <div
            className={styles.body}
          >
            <fieldset
              disabled={busy}
              className={styles.fields}
            >
              <section
                className={styles.section}
                aria-labelledby={'manual-expense-basics'}
              >
                <h3
                  id={'manual-expense-basics'}
                  className={styles['section-title']}
                >
                  <span>
                    1
                  </span>
                  기본 정보
                </h3>
                <div
                  className={styles.basics}
                >
                  <Dropdown
                    label={'출금 통장'}
                    required
                    value={accountId}
                    onChange={setSelectedAccount}
                    disabled={busy}
                    options={accounts.map((account) => ({
                      value: account.id,
                      label: `${account.bankName} ····${account.last4}${account.alias ? ` · ${account.alias}` : ''}`
                    }))}
                  />
                  <CalendarPicker
                    label={'출금일'}
                    variant={'input'}
                    value={date}
                    onChange={setEnteredDate}
                    required
                  />
                  <Input
                    label={'지출명'}
                    value={draft.category}
                    onChange={(event) => setEdited({
                      ...draft,
                      category: event.target.value
                    })}
                    maxLength={100}
                    placeholder={'예: 공용 전기료'}
                    required
                  />
                  <AmountInput
                    label={'출금액'}
                    trailingContent={'원'}
                    value={amount}
                    onChange={setAmount}
                    required
                  />
                </div>
                {!draft.category.trim() && (
                  <p
                    className={styles.warning}
                    role={'status'}
                  >
                    <span
                      aria-hidden={'true'}
                    >
                      !
                    </span>
                    지출명을 입력해주세요.
                  </p>
                )}
              </section>
              <AllocationEditor
                total={validAmount ? amount : '0'}
                draft={draft}
                buildings={data.buildings}
                onChange={setEdited}
                disabled={busy}
                showDetails={false}
                showRule={false}
                sectioned
              />
              <section
                className={styles.section}
                aria-labelledby={'manual-expense-memo'}
              >
                <h3
                  id={'manual-expense-memo'}
                  className={styles['section-title']}
                >
                  <span>
                    4
                  </span>
                  메모
                </h3>
                <Input
                  aria-label={'메모'}
                  placeholder={'메모를 입력해주세요. (선택사항)'}
                  value={draft.note}
                  onChange={(event) => setEdited({
                    ...draft,
                    note: event.target.value
                  })}
                  maxLength={500}
                />
              </section>
            </fieldset>
            {error && (
              <p
                role={'alert'}
                className={styles.error}
              >
                {error}
              </p>
            )}
          </div>
          <footer
            className={styles.actions}
          >
            {presentation === 'modal' && (
              <Button
                variant={'outline'}
                disabled={busy}
                onClick={onClose}
              >
                취소
              </Button>
            )}
            <Button
              type={'submit'}
              loading={busy}
              disabled={busy || !canSubmit}
            >
              등록
            </Button>
          </footer>
        </form>
      )}
    </>
  );

  if (presentation === 'page') return (
    <section
      className={styles.page}
    >
      {content}
    </section>
  );

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={'manual-expense-title'}
      onClose={onClose}
      busy={busy}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
