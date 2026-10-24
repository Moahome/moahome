'use client';

import {
  useRef,
  useState
} from 'react';
import {
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import {
  BANK_OPTIONS,
  BankIcon
} from '@/entities/banking';
import { useSession } from '@/entities/session';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  AmountInput,
  Dropdown,
  Input,
  SelectDropdown,
} from '@/shared/ui/form-controls';
import { Pagination } from '@/shared/ui/pagination';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  cancelBankBalanceCheck,
  getBankBalanceChecks,
  saveBankBalanceCheck,
} from '../../../api/bankingBalanceCheckApi';
import { balanceError } from '../../../api/bankingBalanceApi';
import type {
  AccountBalance,
  BankBalanceCheckInput,
} from '../../../api/bankingBalanceApiTypes';
import styles from './balanceCheckPanel.module.css';
import { BankingActionsMenu } from '../banking-actions-menu/bankingActionsMenu';

const METHODS = [
  {
    value: 'BANK_APP',
    label: '은행 앱에서 직접 확인',
  },
  {
    value: 'INTERNET_BANKING',
    label: '인터넷뱅킹에서 확인',
  },
  {
    value: 'OTHER',
    label: '기타 방법으로 확인',
  },
];
const formatTime = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));

/** 확인 기록과 원장의 금액은 분리하며 실패한 본문·요청 ID는 그대로 재시도합니다. */
export function BalanceCheckPanel({
  propertyId,
  account,
  history = false,
  presentation = 'modal',
  onClose,
}: {
  propertyId: string;
  account: AccountBalance;
  history?: boolean;
  presentation?: 'modal' | 'page';
  onClose: () => void;
}) {
  const session = useSession();
  const cache = useQueryClient();
  const [now] = useState(() =>
    new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(),
  );
  const [date, setDate] = useState(now.slice(0, 10));
  const [time, setTime] = useState(now.slice(11, 19));
  const [amount, setAmount] = useState('');
  const [sourceType, setSourceType] = useState('BANK_APP');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(5);
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState('CHECKED');
  const [notice, setNotice] = useState<{
    message: string;
    tone: 'success' | 'error';
  } | null>(null);
  const queryKey = [
    'bank-balance-checks',
    session.data?.id,
    propertyId,
    account.id,
  ];
  const query = useQuery({
    queryKey,
    queryFn: () => getBankBalanceChecks(propertyId, account.id),
    enabled: history && Boolean(session.data),
    retry: false,
    gcTime: 0,
  });
  const rows = (query.data ?? [])
    .filter(
      (row) =>
        status === 'ALL' ||
        (status === 'VALID' ? !row.canceledAt : Boolean(row.canceledAt)),
    )
    .sort(
      (a, b) =>
        Date.parse(sort === 'CHECKED' ? b.checkedAt : b.createdAt) -
          Date.parse(sort === 'CHECKED' ? a.checkedAt : a.createdAt) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  const count = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, count);
  const bank = BANK_OPTIONS.find(
    (option) =>
      account.label === option.label ||
      account.label.startsWith(`${option.label} `),
  );
  const checkedAt = `${date}T${time.length === 5 ? `${time}:00` : time}+09:00`;
  const validTime =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time) &&
    Number.isFinite(Date.parse(checkedAt));
  const valid =
    /^[0-9]{1,15}$/.test(amount) && validTime && account.status === 'ACTIVE';

  /** 저장 본문이 달라진 경우만 새 UUID를 사용하고 취소·등록 모두 성공 뒤 조회를 갱신합니다. */
  async function submit(cancel?: string) {
    if (busyRef.current || (cancel ? !reason.trim() : !valid)) return;
    const body = JSON.stringify(
      cancel
        ? {
          cancel,
          reason: reason.trim(),
        }
        : {
          accountId: account.id,
          amount,
          checkedAt,
          sourceType,
          memo: memo.trim(),
        },
    );
    if (request.current?.body !== body)
      request.current = {
        body,
        id: crypto.randomUUID(),
      };
    busyRef.current = true;
    setBusy(true);
    try {
      if (cancel)
        await cancelBankBalanceCheck(
          propertyId,
          cancel,
          request.current.id,
          reason.trim(),
        );
      else
        await saveBankBalanceCheck(propertyId, {
          id: request.current.id,
          accountId: account.id,
          amount,
          checkedAt,
          sourceType: sourceType as BankBalanceCheckInput['sourceType'],
          memo: memo.trim(),
        });
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['banking-balances', session.data?.id, propertyId],
        }),
        cache.invalidateQueries({
          queryKey,
        }),
      ]);
      if (cancel) {
        setCancelId(null);
        setReason('');
        setNotice({
          message: '확인 기록을 취소했어요.',
          tone: 'success',
        });
      } else onClose();
    } catch (error) {
      setNotice({
        message: balanceError(error),
        tone: 'error',
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const title = history ? '은행 잔액 확인 이력' : '은행 잔액 직접 확인';
  const content = (
    <>
      <header
        className={styles.header}
      >
        <div>
          <h1>
            {title}
          </h1>
          <div
            className={styles.identity}
          >
            {bank && (
              <BankIcon
                bankCode={bank.value}
              />
            )}
            <p>
              {account.label}
            </p>
          </div>
        </div>
        {presentation === 'modal' && (
          <Button
            variant={'ghost'}
            iconOnly
            disabled={busy}
            aria-label={'잔액 확인 닫기'}
            leadingIcon={(
              <ServiceIcon
                name={'close'}
              />
            )}
            onClick={onClose}
          />
        )}
      </header>
      <div
        className={styles.body}
      >
        {history ? (
          <>
            {query.isPending && (
              <p
                role={'status'}
              >
                확인 이력을 불러오고 있어요.
              </p>
            )}
            {query.isError && (
              <>
                <p
                  role={'alert'}
                >
                  {balanceError(query.error)}
                </p>
                <Button
                  variant={'outline'}
                  onClick={() => {
                    void query.refetch();
                  }}
                >
                  다시 시도
                </Button>
              </>
            )}
            {query.data && (
              <>
                <div
                  className={styles.toolbar}
                >
                  <p>
                    총
                    {rows.length}
                    건 · 최신순
                  </p>
                  <Dropdown
                    aria-label={'확인 이력 표시 개수'}
                    value={String(size)}
                    options={[5, 10, 20, 50].map((value) => ({
                      value: String(value),
                      label: `${value}개씩 보기`,
                    }))}
                    onChange={(value) => {
                      setSize(Number(value));
                      setPage(1);
                    }}
                  />
                  <div
                    className={styles.filters}
                  >
                    <Dropdown
                      aria-label={'확인 이력 상태'}
                      value={status}
                      options={[
                        {
                          value: 'ALL',
                          label: '전체 상태'
                        },
                        {
                          value: 'VALID',
                          label: '유효'
                        },
                        {
                          value: 'CANCELED',
                          label: '취소됨'
                        },
                      ]}
                      onChange={(value) => {
                        setStatus(value);
                        setPage(1);
                      }}
                    />
                    <Dropdown
                      aria-label={'확인 이력 정렬'}
                      value={sort}
                      options={[
                        {
                          value: 'CHECKED',
                          label: '확인 기준일 순'
                        },
                        {
                          value: 'RECORDED',
                          label: '시스템 기록 순'
                        },
                      ]}
                      onChange={(value) => {
                        setSort(value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
                {rows.length === 0 && (
                  <p
                    className={styles.empty}
                  >
                    해당 조건의 은행 잔액 확인 이력이 없습니다.
                  </p>
                )}
                <ul
                  className={styles.list}
                >
                  {rows
                    .slice((current - 1) * size, current * size)
                    .map((row) => (
                      <li
                        key={row.id}
                        data-current={
                          account.confirmation?.sourceId === row.id &&
                          !row.canceledAt
                        }
                      >
                        <div
                          className={styles.record}
                        >
                          <div
                            className={styles.money}
                          >
                            <strong>
                              {formatWon(row.amount)}
                            </strong>
                            <p>
                              {
                                METHODS.find(
                                  (method) => method.value === row.sourceType,
                                )?.label
                              }
                            </p>
                          </div>
                          <dl
                            className={styles.metadata}
                          >
                            <div>
                              <dt>
                                확인 기준일시
                              </dt>
                              <dd>
                                {formatTime(row.checkedAt)}
                              </dd>
                            </div>
                            <div>
                              <dt>
                                기록자
                              </dt>
                              <dd>
                                {row.checkedByName ??
                                  (row.checkedBy === session.data?.id
                                    ? '나'
                                    : '관리자')}
                              </dd>
                            </div>
                            <div>
                              <dt>
                                시스템 기록 시각
                              </dt>
                              <dd>
                                {formatTime(row.createdAt)}
                              </dd>
                            </div>
                          </dl>
                          <span
                            className={styles.badge}
                            data-canceled={Boolean(row.canceledAt)}
                          >
                            {row.canceledAt ? '취소됨' : '유효'}
                          </span>
                          {!row.canceledAt && (
                            <BankingActionsMenu
                              label={`${formatTime(row.checkedAt)} 확인 기록 메뉴`}
                              items={[
                                {
                                  label: '확인 기록 취소',
                                  icon: 'trash',
                                  disabled: busy,
                                  onSelect: () => {
                                    setCancelId(row.id);
                                    setReason('');
                                  },
                                },
                              ]}
                            />
                          )}
                        </div>
                        {row.memo && (
                          <p
                            className={styles.memo}
                          >
                            메모:
                            {row.memo}
                          </p>
                        )}
                        {row.canceledAt && (
                          <div
                            className={styles.cancellation}
                          >
                            <strong>
                              취소 사유
                            </strong>
                            <p>
                              {row.cancelReason}
                            </p>
                            <span>
                              취소 처리자
                              {' '}
                              {row.canceledByName ?? '관리자'}
                            </span>
                            <span>
                              취소 시각
                              {formatTime(row.canceledAt)}
                            </span>
                          </div>
                        )}
                        {cancelId === row.id && !row.canceledAt && (
                          <div
                            className={styles.cancel}
                          >
                            <Input
                              label={'취소 사유'}
                              aria-label={'취소 사유'}
                              required
                              maxLength={500}
                              value={reason}
                              disabled={busy}
                              onChange={(event) =>
                                setReason(event.target.value)
                              }
                            />
                            <p>
                              이 확인 기록만 취소하며 입출금과 동별 보유금은
                              변경하지 않습니다.
                            </p>
                            <Button
                              disabled={busy || !reason.trim()}
                              loading={busy}
                              onClick={() => {
                                void submit(row.id);
                              }}
                            >
                              취소 기록
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
                <Pagination
                  page={current}
                  pageSize={size}
                  label={'확인 이력 페이지'}
                  unit={'건'}
                  total={rows.length}
                  pageCount={count}
                  onPageChange={setPage}
                />
              </>
            )}
          </>
        ) : (
          <form
            id={'bank-balance-check'}
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            noValidate
          >
            <AmountInput
              label={'은행에서 확인한 잔액'}
              aria-label={'은행에서 확인한 잔액'}
              required
              value={amount}
              onChange={setAmount}
              trailingContent={'원'}
              disabled={busy}
            />
            <div
              className={styles.row}
            >
              <CalendarPicker
                variant={'input'}
                label={'확인 날짜'}
                required
                value={date}
                onChange={(value) => {
                  if (!busyRef.current) setDate(value);
                }}
              />
              <Input
                label={'확인 시각 (한국시간)'}
                aria-label={'확인 시각 (한국시간)'}
                type={'time'}
                step={1}
                required
                value={time}
                disabled={busy}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
            <SelectDropdown
              label={'확인 방법'}
              value={sourceType}
              onChange={setSourceType}
              options={METHODS}
              disabled={busy}
            />
            <Input
              label={'메모 (선택)'}
              value={memo}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setMemo(event.target.value)}
            />
            <p>
              직접 확인한 잔액은 입출금 거래나 동별 보유금을 변경하지 않고 확인
              이력으로 저장됩니다.
            </p>
            {account.status !== 'ACTIVE' && (
              <p>
                사용 종료한 통장은 기존 확인 이력만 조회할 수 있습니다.
              </p>
            )}
          </form>
        )}
      </div>
      {!history && (
        <footer
          className={styles.actions}
        >
          <Button
            type={'submit'}
            form={'bank-balance-check'}
            disabled={busy || !valid}
            loading={busy}
          >
            기록
          </Button>
        </footer>
      )}
      {notice && (
        <Toast
          message={notice.message}
          tone={notice.tone}
          onClose={() => setNotice(null)}
        />
      )}
    </>
  );
  if (presentation === 'page')
    return (
      <section
        className={styles.page}
      >
        {content}
      </section>
    );
  return (
    <ClientModal
      data-history={history}
      className={styles.modal}
      aria-label={title}
      onClose={() => {
        if (!busyRef.current) onClose();
      }}
    >
      {content}
    </ClientModal>
  );
}
