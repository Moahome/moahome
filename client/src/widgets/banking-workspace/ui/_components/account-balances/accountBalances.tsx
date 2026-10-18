'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import {
  BANK_OPTIONS,
  BankIcon
} from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { AccountBalance } from '../../../api/bankingBalanceApi';
import { getAccountBalanceDisplay } from '../../../model/accountBalance';
import styles from './accountBalances.module.css';

/** 서버의 확인 시각을 짧게 표시하되 날짜만 제공된 잔액에 임의의 시간을 붙이지 않습니다. */
function formatConfirmation(asOf: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(asOf);
  if (!match) return `${asOf} 확인`;

  const [, , month, day, hour, minute] = match;
  return `${month}.${day}${hour ? ` ${hour}:${minute}` : ''} 확인`;
}

/** 은행 확인값과 기준 잔고에서 계산한 값을 구분하고 출처는 마우스·키보드·터치 도움말로 설명합니다. */
export function AccountBalances({ accounts }: { accounts: AccountBalance[] }) {
  const helpRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    width: 360
  });

  // 정보 버튼을 기준으로 열되 좁은 화면에서도 설명이 화면 밖으로 넘치지 않게 합니다.
  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const bounds = helpRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(360, window.innerWidth - 40);
      const left = Math.max(20, Math.min(bounds.left, window.innerWidth - width - 20));
      setPosition({
        left: left - bounds.left,
        width
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!helpRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <section
      className={styles.card}
      aria-label={'통장별 확인 잔액'}
    >
      <header
        className={styles.header}
      >
        <h2>
          통장별 확인 잔액
        </h2>
        <div
          ref={helpRef}
          className={styles.help}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => {
            if (!helpRef.current?.contains(document.activeElement)) setOpen(false);
          }}
          onFocus={() => setOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          <Button
            className={styles.info}
            variant={'ghost'}
            iconOnly
            aria-label={'통장별 확인 잔액 도움말'}
            aria-expanded={open}
            aria-controls={tooltipId}
            aria-describedby={open ? tooltipId : undefined}
            onClick={() => setOpen(true)}
            leadingIcon={(
              <ServiceIcon
                name={'info'}
              />
            )}
          />
          {open && (
            <div
              id={tooltipId}
              role={'tooltip'}
              className={styles.tooltip}
              style={{
                '--tooltip-left': `${position.left}px`,
                '--tooltip-width': `${position.width}px`
              } as CSSProperties}
            >
              <span
                className={styles['tooltip-icon']}
                aria-hidden={'true'}
              >
                <ServiceIcon
                  name={'info'}
                />
              </span>
              <div
                className={styles['tooltip-content']}
              >
                <strong>
                  통장 잔액 안내
                </strong>
                <p>
                  확인값 또는 계산 잔액입니다.
                </p>
                <small>
                  실시간 조회가 아닙니다.
                </small>
              </div>
            </div>
          )}
        </div>
      </header>
      <ul
        className={styles.list}
      >
        {accounts.map((account) => {
          // 은행명·마스킹 라벨은 로고 표시에만 사용하고 계좌 식별은 응답 ID를 유지합니다.
          const bank = BANK_OPTIONS.find((option) => account.label === option.label || account.label.startsWith(`${option.label} `));
          const display = getAccountBalanceDisplay(account);

          return (
            <li
              key={account.id}
              className={styles.row}
            >
              <span
                className={styles.logo}
                aria-hidden={'true'}
              >
                {bank ? (
                  <BankIcon
                    bankCode={bank.value}
                  />
                ) : (
                  <ServiceIcon
                    name={'bank'}
                  />
                )}
              </span>
              <div
                className={styles.identity}
              >
                <strong>
                  {account.label}
                  {account.status === 'CLOSED' ? ' · 사용 종료' : ''}
                </strong>
                {display.calculated ? (
                  <small>
                    계산 잔액 ·
                    {' '}
                    {display.description}
                  </small>
                ) : account.asOf ? (
                  <time
                    dateTime={account.asOf.replace(' ', 'T')}
                    title={account.asOf}
                    aria-label={`${account.asOf} 확인`}
                  >
                    {formatConfirmation(account.asOf)}
                  </time>
                ) : (
                  <small>
                    기준 잔고와 입출금 내역을 확인해주세요.
                  </small>
                )}
              </div>
              <span
                className={styles.amount}
                data-unknown={display.amount === null}
              >
                {display.amount === null ? '확인 필요' : formatWon(display.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
