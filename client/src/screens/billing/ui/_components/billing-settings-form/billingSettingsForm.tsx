import {
  useId,
  useRef,
  useState,
  type FormEvent
} from 'react';
import {
  FEE_ITEM_OPTIONS,
  type BillingItem
} from '@/entities/billing';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  AmountInput,
  Dropdown,
  Input
} from '@/shared/ui/form-controls';
import { ListCard } from '@/shared/ui/list-card';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  formatBillingMonth,
  getSettingsError,
  sumBillingItems,
  type ScheduledSettings
} from '../../../model/billing';
import styles from './billingSettingsForm.module.css';

const ITEM_OPTIONS = [...FEE_ITEM_OPTIONS, {
  value: 'DIRECT',
  label: '직접 입력'
}];

/** 현재 기준을 보존하고 필수 사유가 있는 변경만 다음 달 설정으로 저장합니다. */
export function BillingSettingsForm({
  currentItems,
  nextMonth,
  scheduled,
  onApply,
  busy,
  errorMessage,
}: {
  currentItems: BillingItem[];
  nextMonth: string;
  scheduled: ScheduledSettings | null;
  onApply: (settings: ScheduledSettings) => Promise<boolean>;
  busy: boolean;
  errorMessage: string;
}) {
  const currentPanelId = useId();
  const [currentOpen, setCurrentOpen] = useState(false);
  const [items, setItems] = useState(() => (scheduled?.items ?? currentItems).map((item) => ({
    ...item
  })));
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [reasonTouched, setReasonTouched] = useState(false);
  const counter = useRef(0);
  const changed = JSON.stringify(items) !== JSON.stringify(scheduled?.items ?? currentItems);
  const error = getSettingsError(items, reason);
  const validAmounts = items.every((item) => /^-?[0-9]+$/.test(item.amount));
  const total = validAmounts ? sumBillingItems(items) : null;

  /** 추천 종류의 정해진 이름을 사용하고 직접 입력으로 바꾸면 이전 항목명을 비웁니다. */
  function changeKind(id: string, value: string) {
    const option = FEE_ITEM_OPTIONS.find((item) => item.value === value);
    setItems((previous) => previous.map((item) => item.id === id ? {
      ...item,
      code: option?.value ?? null,
      name: option?.label ?? ''
    } : item));
  }

  /** 빈 사유와 잘못된 금액은 적용하지 않으며 당월 청구 스냅샷은 변경하지 않습니다. */
  async function applySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (error || !changed || busy) return;
    const normalized = items.map((item) => ({
      ...item,
      name: item.name.trim(),
      amount: BigInt(item.amount).toString()
    }));
    const success = await onApply({
      month: nextMonth,
      items: normalized,
      reason: reason.trim()
    });
    if (success) { setItems(normalized); setSubmitted(false); }
  }

  return (
    <div
      className={styles.content}
    >
      <section
        className={styles.intro}
      >
        <span
          className={styles.icon}
        >
          <ServiceIcon
            name={'settings'}
            size={24}
          />
        </span>
        <div>
          <h2>
            다음 달에 적용할 기본 관리비
          </h2>
          <p>
            {`변경 내용은 ${formatBillingMonth(nextMonth)} 자동 부과부터 적용됩니다.`}
          </p>
        </div>
      </section>
      <ListCard>
        <section
          className={styles['current-settings']}
          data-open={currentOpen}
          aria-label={'현재 적용 항목'}
        >
          <h2>
            <Button
              variant={'ghost'}
              className={styles['current-summary']}
              aria-expanded={currentOpen}
              aria-controls={currentPanelId}
              onClick={() => setCurrentOpen((previous) => !previous)}
            >
              <span
                className={styles['current-heading']}
              >
                <span
                  className={styles['current-title']}
                >
                  현재 적용 항목
                </span>
                <span>
                  {`총 ${currentItems.length}개 · 당월 기준`}
                </span>
              </span>
              <span
                className={styles['current-amount']}
              >
                <span>
                  세대당 합계
                </span>
                <strong>
                  {formatWon(sumBillingItems(currentItems))}
                </strong>
              </span>
              <ServiceIcon
                name={'chevron'}
                direction={'down'}
                size={20}
                className={styles['current-chevron']}
              />
            </Button>
          </h2>
          <div
            id={currentPanelId}
            className={styles['current-panel']}
            aria-hidden={!currentOpen}
            inert={!currentOpen}
          >
            <div
              className={styles['current-panel-inner']}
            >
              <dl
                className={styles['current-items']}
              >
                {currentItems.map((item) => (
                  <div
                    key={item.id}
                  >
                    <dt>
                      {item.name}
                    </dt>
                    <dd>
                      {formatWon(item.amount)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </ListCard>
      <ListCard>
        <form
          className={styles.form}
          onSubmit={applySettings}
          noValidate
        >
          <div
            className={styles['card-heading']}
          >
            <div>
              <h2>
                다음 달 적용 설정
              </h2>
              <p>
                {`적용 시작: ${formatBillingMonth(nextMonth)} 1일`}
              </p>
            </div>
            <span
              className={styles.badge}
              data-tone={'primary'}
            >
              {scheduled ? '변경 반영됨' : '설정 편집'}
            </span>
          </div>
          <fieldset
            disabled={busy}
            className={styles.fields}
          >
            <div
              className={styles['item-list']}
            >
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={styles['item-row']}
                  role={'group'}
                  aria-label={`항목 ${index + 1}`}
                >
                  <span
                    className={styles.order}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div
                    className={styles['item-kind']}
                  >
                    <Dropdown
                      label={`항목 ${index + 1} 종류`}
                      options={ITEM_OPTIONS}
                      value={item.code ?? 'DIRECT'}
                      required
                      onChange={(value) => changeKind(item.id, value)}
                    />
                    {item.code === null && (
                      <Input
                        label={`항목 ${index + 1} 이름`}
                        value={item.name}
                        maxLength={100}
                        required
                        placeholder={'관리비 항목명'}
                        onChange={(event) => setItems((previous) => previous.map((current) => current.id === item.id ? {
                          ...current,
                          name: event.target.value
                        } : current))}
                      />
                    )}
                  </div>
                  <AmountInput
                    label={`항목 ${index + 1} 기본 금액`}
                    value={item.amount}
                    required
                    maxLength={24}
                    trailingContent={'원'}
                    onChange={(amount) => setItems((previous) => previous.map((current) => current.id === item.id ? {
                      ...current,
                      amount
                    } : current))}
                  />
                  <Button
                    variant={'ghost'}
                    tone={'danger'}
                    size={'sm'}
                    iconOnly
                    aria-label={`항목 ${index + 1} 삭제`}
                    onClick={() => setItems((previous) => previous.filter((current) => current.id !== item.id))}
                    leadingIcon={(
                      <ServiceIcon
                        name={'trash'}
                      />
                    )}
                  />
                </div>
              ))}
              {!items.length && (
                <div
                  className={styles.empty}
                >
                  기본 관리비 항목을 추가해주세요.
                </div>
              )}
            </div>
            <div
              className={styles['item-footer']}
            >
              <Button
                variant={'outline'}
                size={'sm'}
                leadingIcon={(
                  <ServiceIcon
                    name={'plus'}
                  />
                )}
                onClick={() => {
                  counter.current += 1;
                  setItems((previous) => [...previous, {
                    id: `new-${counter.current}`,
                    code: null,
                    name: '',
                    amount: ''
                  }]);
                }}
              >
                항목 추가
              </Button>
              <div
                className={styles['draft-total']}
              >
                <span>
                  세대당 다음 달 합계
                </span>
                <strong>
                  {total === null ? '금액 입력 중' : formatWon(total)}
                </strong>
              </div>
            </div>
          </fieldset>
          <Input
            maxLength={1000}
            disabled={busy}
            label={'수정 사유'}
            value={reason}
            required
            placeholder={'예: 공용 전기료 변경에 따른 기본 금액 조정'}
            description={'다음 달 적용 설정의 변경 사유를 입력해주세요.'}
            error={(submitted || reasonTouched) && !reason.trim() ? '수정 사유를 입력해주세요.' : undefined}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setReasonTouched(true)}
          />
          {submitted && error && reason.trim() && (
            <p
              className={styles.error}
              role={'alert'}
            >
              {error}
            </p>
          )}
          {errorMessage && (
            <p
              className={styles.error}
              role={'alert'}
            >
              {errorMessage}
            </p>
          )}
          <div
            className={styles.actions}
          >
            <p>
              0원·음수 금액을 입력할 수 있습니다.
              <br />
              당월과 과거 청구에는 영향을 주지 않습니다.
            </p>
            <Button
              type={'submit'}
              disabled={!changed || busy}
            >
              {busy ? '저장 중…' : '다음 달 설정 저장'}
            </Button>
          </div>
        </form>
      </ListCard>
    </div>
  );
}
