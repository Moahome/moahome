'use client';

import {
  BANK_OPTIONS,
  BankIcon
} from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { AccountBalance } from '../../../api/bankingBalanceApiTypes';
import { getAccountBalanceDisplay } from '../../../model/accountBalance';
import styles from './accountBalances.module.css';
import { BankingActionsMenu } from '../banking-actions-menu/bankingActionsMenu';

/** 서버의 확인 시각을 짧게 표시하되 날짜만 제공된 잔액에 임의의 시간을 붙이지 않습니다. */
function formatConfirmation(asOf: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(
      asOf,
    );
  if (!match) return `${asOf} 확인`;

  const [, , month, day, hour, minute] = match;
  return `${month}.${day}${hour ? ` ${hour}:${minute}` : ''} 확인`;
}

/** 표시 출처는 실제 확인 자료에 있을 때만 붙이고 확인 날짜를 중복 표시하지 않습니다. */
function confirmationLabel(account: AccountBalance) {
  const source = account.confirmation;
  if (source?.source === 'BANK_IMPORT') return ' · 엑셀 거래내역';
  if (source?.source !== 'DIRECT_CHECK') return '';
  if (source.method === 'BANK_APP') return ' · 은행 앱에서 직접 확인';
  if (source.method === 'INTERNET_BANKING') return ' · 인터넷뱅킹에서 확인';
  return ' · 직접 확인';
}

/** 은행 확인값과 기준 잔고에서 계산한 값을 구분하고 출처는 마우스·키보드·터치 도움말로 설명합니다. */
export function AccountBalances({
  accounts,
  onOpen,
  onCheck,
  onHistory,
}: {
  accounts: AccountBalance[];
  onOpen: (accountId: string) => void;
  onCheck: (id: string) => void;
  onHistory: (id: string) => void;
}) {
  return (
    <section
      className={styles.card}
      aria-label={'통장별 확인 잔액'}
    >
      <header
        className={styles.header}
      >
        <InfoTooltip
          size={'sm'}
          label={'통장별 확인 잔액 도움말'}
          title={'통장 잔액 안내'}
          note={'실시간 조회가 아닙니다.'}
        >
          확인값 또는 계산 잔액입니다.
        </InfoTooltip>
        <h2>
          통장별 확인 잔액
        </h2>
      </header>
      <ul
        className={styles.list}
      >
        {accounts.map((account) => {
          // 은행명·마스킹 라벨은 로고 표시에만 사용하고 계좌 식별은 응답 ID를 유지합니다.
          const bank = BANK_OPTIONS.find(
            (option) =>
              account.label === option.label ||
              account.label.startsWith(`${option.label} `),
          );
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
                      {display.description}
                    </small>
                  ) : account.asOf ? (
                    <time
                      dateTime={account.asOf.replace(' ', 'T')}
                      title={account.asOf}
                      aria-label={`${account.asOf} 확인`}
                    >
                      {formatConfirmation(account.asOf)}
                      {confirmationLabel(account)}
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
                  {display.amount === null
                    ? '은행 확인 자료 없음'
                    : formatWon(display.amount)}
                </span>

              </Button>
              <div
                className={styles.actions}
              >
                <BankingActionsMenu
                  label={`${account.label} 잔액 메뉴`}
                  items={[
                    ...(account.status === 'ACTIVE' ? [{
                      label: '은행 잔액 직접 확인',
                      icon: 'pen' as const,
                      onSelect: () => onCheck(account.id)
                    }] : []),
                    {
                      label: '확인 이력 보기',
                      icon: 'clock',
                      onSelect: () => onHistory(account.id)
                    }
                  ]}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
