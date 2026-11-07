'use client';

import {
  type ReactNode,
  useRef,
  useState
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useSession } from '@/entities/session';
import { getSortedBuildings } from '@/entities/property';
import { getTodayDate } from '@/shared/lib/date-range';
import { formatInteger } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import { ClientModal } from '@/shared/ui/client-modal';
import { ListCard } from '@/shared/ui/list-card';
import { ListHeader } from '@/shared/ui/list-header';
import {
  AmountInput,
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { RequestError } from '@/shared/ui/server-connection-error';
import {
  LoadingState,
  StateMessage
} from '@/shared/ui/state-message';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  cancelPayable,
  cancelPayablePayment,
  createPayable,
  getPayables,
  settlePayable
} from '../api/payableApi';
import styles from './payableManager.module.css';

/** 등록·기존 출금 연결·연결 해제는 같은 원본을 다시 조회하고 관련 손익·원장을 함께 갱신합니다. */
export function PayableManager({ propertyId, payableId, presentation = 'modal', onClose, onCreated, children, onBusyChange }: {
  propertyId: string;
  payableId?: string;
  presentation?: 'modal' | 'page' | 'embedded';
  children?: ReactNode;
  onBusyChange?: (busy: boolean) => void;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const session = useSession();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['payables', session.data?.id, propertyId],
    queryFn: ({ signal }) => getPayables(propertyId, signal),
    enabled: Boolean(session.data),
    retry: false,
    gcTime: 0
  });
  const [requestId] = useState(() => crypto.randomUUID());
  const [paymentRequest, setPaymentRequest] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    date: getTodayDate(),
    name: '',
    counterparty: '',
    memo: '',
    amount: '',
    accountId: '',
    buildingId: ''
  });
  const [expenseId, setExpenseId] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const data = query.data;
  const item = data?.items.find((value) => value.id === payableId);
  const account = data?.accounts.find((value) => value.id === item?.accountId);
  const buildings = getSortedBuildings(data?.buildings ?? []);
  const candidates = data?.candidates.filter((candidate) => item && candidate.accountId === item.accountId
    && candidate.buildingId === item.buildingId && candidate.date >= item.date && BigInt(candidate.amount) <= BigInt(item.remaining)) ?? [];
  const money = (value: string) => `${formatInteger(BigInt(value))}원`;

  /** 실패 재시도는 요청 ID를 유지하며 성공 후에만 후보 선택·확인을 비웁니다. */
  async function perform(action: string) {
    if (working.current || !data?.canManage) return;
    if (action === 'create' && (!form.accountId || (data.hasBuildings && !form.buildingId))) {
      setError('비용 계정과목과 부담 동을 선택해주세요.'); return;
    }
    working.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      if (action === 'create') await createPayable(propertyId, {
        ...form,
        id: requestId,
        buildingId: form.buildingId || null
      });
      else if (action === 'settle' && payableId) await settlePayable(propertyId, payableId, paymentRequest, expenseId);
      else if (action === 'cancel' && payableId) await cancelPayable(propertyId, payableId);
      else if (action.startsWith('unlink:') && payableId) await cancelPayablePayment(propertyId, payableId, action.slice(7));
      await query.refetch();
      await Promise.all(['account-ledger', 'income-statement', 'monthly-settlement'].map((key) => cache.invalidateQueries({
        queryKey: [key, session.data?.id, propertyId]
      })));
      setConfirmation(null); setExpenseId(''); setPaymentRequest(crypto.randomUUID());
      if (action === 'create') { if (onCreated) onCreated(requestId); else onClose(); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '미지급 처리를 완료하지 못했습니다.'); }
    finally { working.current = false; setBusy(false); onBusyChange?.(false); }
  }

  const title = payableId ? '미지급 상세' : '미지급 등록';
  const content = (
    <div
      className={[styles.content, presentation === 'embedded' ? styles.embedded : ''].filter(Boolean).join(' ')}
    >
      {presentation === 'page' ? (
        <ListHeader
          className={styles['page-header']}
          menu={'회계·정산'}
          title={title}
          titleId={'payable-title'}
          description={payableId
            ? '미지급 내역과 지급 연결 이력을 확인합니다.'
            : '아직 지급하지 않은 비용을 등록합니다. 실제 출금은 등록되지 않으며, 지급 후 기존 지출을 연결합니다.'}
        />
      ) : presentation === 'modal' && (
        <header
          className={styles['modal-header']}
        >
          <h2
            id={'payable-title'}
          >
            {title}
          </h2>
          <Button
            variant={'ghost'}
            size={'sm'}
            iconOnly
            aria-label={'미지급 상세 닫기'}
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
      {children}
      {query.isFetching && !data ? (
        <LoadingState
          title={'미지급 내역을 불러오고 있어요.'}
        />
      ) : query.isError ? (
        <RequestError
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : data && !payableId ? data.canManage ? (
        <form
          className={styles.form}
          onSubmit={(event) => { event.preventDefault(); void perform('create'); }}
        >
          {presentation !== 'page' && (
            <p>
              아직 지급하지 않은 비용을 등록합니다. 실제 출금은 등록되지 않으며, 지급 후 기존 지출을 연결합니다.
            </p>
          )}
          <CalendarPicker
            label={'발생일'}
            value={form.date}
            maxDate={getTodayDate}
            required
            disabled={busy}
            onChange={(date) => setForm({
              ...form,
              date
            })}
          />
          <AmountInput
            label={'미지급 금액'}
            value={form.amount}
            required
            disabled={busy}
            onChange={(amount) => setForm({
              ...form,
              amount
            })}
          />
          <Input
            label={'내용'}
            value={form.name}
            maxLength={100}
            required
            disabled={busy}
            onChange={(event) => setForm({
              ...form,
              name: event.target.value
            })}
          />
          <Input
            label={'지급처'}
            value={form.counterparty}
            maxLength={100}
            required
            disabled={busy}
            onChange={(event) => setForm({
              ...form,
              counterparty: event.target.value
            })}
          />
          <Dropdown
            label={'비용 계정과목'}
            placeholder={'계정과목 선택'}
            required
            value={form.accountId}
            disabled={busy}
            options={data.accounts.filter((value) => value.active !== false).sort((a, b) => a.code.localeCompare(b.code)).map((value) => ({
              value: value.id,
              label: `${value.code} ${value.name}`
            }))}
            onChange={(accountId) => setForm({
              ...form,
              accountId
            })}
          />
          {data.hasBuildings && (
            <Dropdown
              label={'부담 동'}
              placeholder={'동 선택'}
              value={form.buildingId}
              required
              disabled={busy}
              options={buildings.filter((value) => value.active).map((value) => ({
                value: value.id,
                label: value.name
              }))}
              onChange={(buildingId) => setForm({
                ...form,
                buildingId
              })}
            />
          )}
          <div
            className={styles.wide}
          >
            <Input
              label={'메모'}
              value={form.memo}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setForm({
                ...form,
                memo: event.target.value
              })}
            />
          </div>
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
              type={'submit'}
              disabled={busy}
            >
              등록
            </Button>
          </div>
        </form>
      ) : (
        <StateMessage
          variant={'review-required'}
          title={'관리소장만 미지급금을 등록할 수 있습니다.'}
        />
      ) : data && !item ? (
        <StateMessage
          variant={'not-found'}
          title={'미지급 내역을 찾을 수 없습니다.'}
        />
      ) : item && data ? (
        <>
          <dl
            className={styles.summary}
          >
            <div>
              <dt>
                발생 금액
              </dt>
              <dd>
                {money(item.amount)}
              </dd>
            </div>
            <div>
              <dt>
                지급 연결액
              </dt>
              <dd>
                {money(item.paid)}
              </dd>
            </div>
            <div>
              <dt>
                남은 미지급금
              </dt>
              <dd>
                {money(item.remaining)}
              </dd>
            </div>
          </dl>
          <dl
            className={styles.details}
          >
            <div>
              <dt>
                상태
              </dt>
              <dd>
                {item.status === 'CANCELED' ? '등록 취소' : item.remaining === '0' ? '지급 완료' : item.paid === '0' ? '미지급' : '일부 지급'}
              </dd>
            </div>
            <div>
              <dt>
                발생일
              </dt>
              <dd>
                {item.date}
              </dd>
            </div>
            <div>
              <dt>
                내용
              </dt>
              <dd>
                {item.name}
              </dd>
            </div>
            <div>
              <dt>
                지급처
              </dt>
              <dd>
                {item.counterparty}
              </dd>
            </div>
            <div>
              <dt>
                비용 계정과목
              </dt>
              <dd>
                {account ? `${account.code} ${account.name}` : '과목 확인 필요'}
              </dd>
            </div>
            <div>
              <dt>
                부담 동
              </dt>
              <dd>
                {buildings.find((value) => value.id === item.buildingId)?.name ?? '전체'}
              </dd>
            </div>
            <div>
              <dt>
                메모
              </dt>
              <dd>
                {item.memo || '—'}
              </dd>
            </div>
          </dl>
          <section
            className={styles.payments}
            aria-label={'지급 연결 내역'}
          >
            <h3>
              지급 연결 내역
            </h3>
            {item.payments.length === 0 && (
              <p>
                연결한 지급이 없습니다.
              </p>
            )}
            {item.payments.map((payment) => (
              <div
                className={styles.payment}
                key={payment.id}
              >
                <div>
                  <a
                    href={`/manage/${propertyId}${payment.path}`}
                  >
                    {payment.date}
                    {' '}
                    ·
                    {' '}
                    {money(payment.amount)}
                  </a>
                  {payment.status === 'CANCELED' ? (
                    <span>
                      연결 해제
                    </span>
                  ) : data.canManage && (
                    <Button
                      variant={'outline'}
                      size={'sm'}
                      disabled={busy}
                      onClick={() => setConfirmation(`unlink:${payment.id}`)}
                    >
                      연결 해제
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>
          {data.canManage && item.status === 'REGISTERED' && !confirmation && (
            <section
              className={styles.payments}
              aria-label={'미지급 처리'}
            >
              {BigInt(item.remaining) > BigInt(0) && (
                <>
                  <h3>
                    기존 출금 연결
                  </h3>
                  <p>
                    같은 비용 과목·부담 동의 확정 지출 전액을 연결합니다. 실제 지급이 여러 건이면 각각 연결할 수 있습니다.
                  </p>
                  <Dropdown
                    label={'지급 출금'}
                    placeholder={'연결할 확정 지출 선택'}
                    value={expenseId}
                    disabled={busy}
                    options={candidates.map((value) => ({
                      value: value.expenseId,
                      label: `${value.date} · ${value.name} · ${money(value.amount)}`
                    }))}
                    onChange={(value) => { setExpenseId(value); setPaymentRequest(crypto.randomUUID()); }}
                  />
                  {candidates.length === 0 && (
                    <p>
                      연결 가능한 확정 지출이 없습니다. 통장 거래에서 실제 출금을 먼저 분류해주세요.
                    </p>
                  )}
                  <div
                    className={styles.actions}
                  >
                    <Button
                      disabled={!expenseId || busy}
                      onClick={() => setConfirmation('settle')}
                    >
                      지급 연결
                    </Button>
                  </div>
                </>
              )}
              {item.paid === '0' && (
                <div
                  className={styles.actions}
                >
                  <Button
                    variant={'outline'}
                    disabled={busy}
                    onClick={() => setConfirmation('cancel')}
                  >
                    등록 취소
                  </Button>
                </div>
              )}
            </section>
          )}
          {confirmation && (
            <section
              className={styles.confirm}
            >
              <h3>
                {confirmation === 'settle' ? '이 출금을 지급으로 연결할까요?' : confirmation === 'cancel' ? '미지급 등록을 취소할까요?' : '지급 연결을 해제할까요?'}
              </h3>
              <p>
                {confirmation === 'settle' ? '이미 등록된 출금을 연결하며 은행 거래나 비용을 다시 생성하지 않습니다.' : confirmation === 'cancel'
                  ? '미지급 발생의 반영이 취소됩니다. 등록과 취소 이력은 보존됩니다.' : '출금 원본은 유지되며 미지급 잔액이 복원됩니다. 해당 출금은 일반 지출 비용으로 다시 반영됩니다.'}
              </p>
              <div
                className={styles.actions}
              >
                <Button
                  variant={'outline'}
                  disabled={busy}
                  onClick={() => { setConfirmation(null); setError(''); }}
                >
                  취소
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void perform(confirmation)}
                >
                  확인
                </Button>
              </div>
            </section>
          )}
          {error && (
            <p
              className={styles.error}
              role={'alert'}
            >
              {error}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
  if (presentation === 'page') return (
    <ListCard>
      {content}
    </ListCard>
  );
  if (presentation === 'embedded') return content;
  return (
    <ClientModal
      className={styles.modal}
      onClose={onClose}
      busy={busy}
      aria-labelledby={'payable-title'}
      closeOnOutsideClick
    >
      {content}
    </ClientModal>
  );
}
