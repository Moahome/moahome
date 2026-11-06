'use client';

import {
  BANK_OPTIONS,
  BankIcon,
  getBankAccountLabel
} from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ServiceIcon } from '@/shared/ui/service-icon';
import type { BalanceWorkspace } from '../../../api/bankingBalanceApiTypes';
import {
  getAccountBalanceDisplay,
  getAccountBuildingBalance,
  getBalancePeriodLabel
} from '../../../model/accountBalance';
import styles from './accountBalances.module.css';

/** 통장별 장부와 동별 보유금을 표시하고 행 전체를 통해 상세로 이동합니다. */
export function AccountBalances({
  data,
  onOpen,
}: {
  data: BalanceWorkspace;
  onOpen: (accountId: string) => void;
}) {
  const accounts = data.accounts?.filter((account) => !data.accountId || data.accountId === account.id) ?? [];

  return (
    <section
      className={styles.card}
      aria-label={'통장별 장부 잔액'}
    >
      <header
        className={styles.header}
      >
        <InfoTooltip
          size={'sm'}
          label={'통장별 장부 잔액 도움말'}
          title={'통장 잔액 안내'}
        >
          시작 금액에 유효 입출금과 이체·취소를 반영한 장부 잔액입니다.
        </InfoTooltip>
        <h2>
          통장별 장부 잔액
        </h2>
      </header>
      <ul
        className={styles.list}
      >
        {accounts.map((account) => {
          const bank = BANK_OPTIONS.find((option) => account.label === option.label || account.label.startsWith(`${option.label} `));
          const name = getBankAccountLabel(account);
          const display = getAccountBalanceDisplay(account);
          const buildingBalance = getAccountBuildingBalance(data, account.id);
          let buildingAmount = buildingBalance === null ? '설정 필요' : formatWon(buildingBalance);
          if (!data.buildings.length) buildingAmount = '동 구분 없음';

          return (
            <li
              key={account.id}
              className={styles.row}
            >
              <Button
                variant={'ghost'}
                className={styles.trigger}
                aria-label={`${name} 통장 상세 보기`}
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
                  <span
                    className={styles.heading}
                  >
                    <strong>
                      {name}
                    </strong>
                    {account.status === 'CLOSED' && (
                      <span
                        className={styles.status}
                      >
                        사용 종료
                      </span>
                    )}
                  </span>
                  <span
                    className={styles.comparison}
                  >
                    <span
                      title={`${getBalancePeriodLabel(data.month)} · ${display.description}`}
                    >
                      {display.calculated ? '장부 잔액' : display.label}
                      {' '}
                      {display.amount === null ? '확인 필요' : formatWon(display.amount)}
                    </span>
                    <span>
                      동별 보유금
                      {' '}
                      {buildingAmount}
                    </span>
                  </span>
                </span>
                <span
                  className={styles.amount}
                  data-unknown={display.amount === null}
                >
                  {display.amount === null ? '확인 필요' : formatWon(display.amount)}
                </span>
                <ServiceIcon
                  className={styles.chevron}
                  name={'chevron'}
                  direction={'right'}
                />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
