'use client';

import {
  BANK_OPTIONS,
  BankIcon
} from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
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
export function AccountBalances({ accounts, onOpen }: { accounts: AccountBalance[]; onOpen: (accountId: string) => void }) {
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
        <InfoTooltip
          size={'sm'}
          label={'통장별 확인 잔액 도움말'}
          title={'통장 잔액 안내'}
          note={'실시간 조회가 아닙니다.'}
        >
          확인값 또는 계산 잔액입니다.
        </InfoTooltip>
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
              <Button
                variant={'ghost'}
                className={styles.trigger}
                aria-label={`${account.label} 통장 상세 보기`}
                onClick={() => onOpen(account.id)}
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
                <span
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
                      잔액이 0원이라는 뜻은 아닙니다.
                    </small>
                  )}
                </span>
                <span
                  className={styles.amount}
                  data-unknown={display.amount === null}
                >
                  {display.amount === null ? '은행 확인 자료 없음' : formatWon(display.amount)}
                </span>
                <ServiceIcon
                  name={'chevron'}
                  direction={'right'}
                  className={styles.chevron}
                />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
