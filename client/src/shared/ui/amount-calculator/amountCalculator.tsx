'use client';

import {
  useId,
  useRef,
  useState
} from 'react';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import {
  AmountInput,
  Input
} from '@/shared/ui/form-controls';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import { calculateEqualSplit } from '@/shared/lib/equal-split';
import styles from './amountCalculator.module.css';

/** 화면의 업무 상태와 분리된 참고용 분담 계산창이며 문구·수량 단위만 호출 화면에서 지정합니다. */
export function AmountCalculator({
  open,
  onClose,
  title = '금액 계산기',
  description = '참고용 · 계산 결과는 자동으로 적용되지 않습니다.',
  countLabel = '나눌 수',
  countUnit,
  resultLabel = '분담 금액'
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  countLabel?: string;
  countUnit?: string;
  resultLabel?: string;
}) {
  const titleId = useId();
  const amountInput = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('');
  const [notice, setNotice] = useState<{ id: number; message: string; tone: 'success' | 'error' } | null>(null);
  const noticeCounter = useRef(0);
  const result = calculateEqualSplit(amount, count);
  const invalidAmount = Boolean(amount) && !/^[0-9]{1,15}$/.test(amount);
  const invalidCount = Boolean(count) && (!/^[0-9]{1,9}$/.test(count) || BigInt(count) === BigInt(0));
  const options = result ? [
    {
      id: 'lower',
      title: result.exact ? resultLabel : '원 단위 내림',
      amount: result.lower,
      total: result.lowerTotal,
      difference: result.exact ? '차이 없음' : `${formatWon(result.shortage)} 부족`
    },
    ...(!result.exact ? [{
      id: 'upper',
      title: '원 단위 올림',
      amount: result.upper,
      total: result.upperTotal,
      difference: `${formatWon(result.excess)} 초과`
    }] : [])
  ] : [];

  /** 금액만 복사하며 실패해도 계산 결과와 입력값은 유지합니다. */
  async function copyAmount(value: bigint) {
    noticeCounter.current += 1;
    const id = noticeCounter.current;
    try {
      await navigator.clipboard.writeText(value.toString());
      setNotice({
        id,
        message: `${formatWon(value)}을 복사했어요.`,
        tone: 'success'
      });
    } catch {
      setNotice({
        id,
        message: '복사하지 못했어요. 금액을 선택해 복사해주세요.',
        tone: 'error'
      });
    }
  }

  if (!open) return null;

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={titleId}
      onClose={onClose}
      initialFocusRef={amountInput}
      closeOnOutsideClick
    >
      <header
        className={styles.header}
      >
        <div>
          <h2
            id={titleId}
          >
            {title}
          </h2>
          <p>
            {description}
          </p>
        </div>
        <Button
          className={styles.close}
          variant={'ghost'}
          size={'sm'}
          iconOnly
          aria-label={'계산기 닫기'}
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
        <div
          className={styles.inputs}
        >
          <AmountInput
            ref={amountInput}
            label={'필요한 총금액'}
            value={amount}
            maxLength={19}
            placeholder={'예: 1,500,000'}
            trailingContent={'원'}
            error={invalidAmount ? '총금액은 0원 이상, 최대 15자리 정수로 입력해주세요.' : undefined}
            onChange={setAmount}
          />
          <Input
            label={countLabel}
            value={count}
            digitsOnly
            maxLength={9}
            placeholder={'예: 20'}
            trailingContent={countUnit}
            error={invalidCount ? `${countLabel}는 1 이상으로 입력해주세요.` : undefined}
            onChange={(event) => setCount(event.target.value)}
          />
        </div>
        {result ? (
          <section
            className={styles.results}
            aria-label={'분담 금액 계산 결과'}
            aria-live={'polite'}
          >
            <p
              className={styles.formula}
            >
              {formatWon(result.total)}
              {' '}
              ÷
              {' '}
              {`${formatInteger(result.units)}${countUnit ?? ''}`}
            </p>
            <div
              className={styles.options}
            >
              {options.map((option) => (
                <article
                  key={option.id}
                  className={styles.option}
                  aria-label={option.title}
                >
                  <h3>
                    {option.title}
                  </h3>
                  <strong
                    className={styles.amount}
                  >
                    {formatWon(option.amount)}
                  </strong>
                  <dl>
                    <div>
                      <dt>
                        전체 합계
                      </dt>
                      <dd>
                        {formatWon(option.total)}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        목표 금액과 차이
                      </dt>
                      <dd>
                        {option.difference}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    aria-label={`${option.title} 복사`}
                    onClick={() => copyAmount(option.amount)}
                    leadingIcon={(
                      <ServiceIcon
                        name={'copy'}
                      />
                    )}
                  >
                    금액 복사
                  </Button>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p
            className={styles.empty}
          >
            {`총금액과 ${countLabel}를 입력하면 분담 금액을 확인할 수 있습니다.`}
          </p>
        )}
      </div>
      {notice && (
        <Toast
          key={notice.id}
          message={notice.message}
          tone={notice.tone}
          onClose={() => setNotice(null)}
        />
      )}
    </ClientModal>
  );
}
