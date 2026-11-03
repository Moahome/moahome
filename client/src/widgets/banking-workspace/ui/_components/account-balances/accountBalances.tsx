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
  getBalancePeriodLabel,
  getBankConfirmationDescription
} from '../../../model/accountBalance';
import styles from './accountBalances.module.css';

/** 은행 확인일은 실제 자료의 날짜만 축약하고 장부 기준일이나 입력 시각으로 대체하지 않습니다. */
function confirmationDate(date: string | null) {
  const match = date?.match(/^\d{4}-(\d{2})-(\d{2})/);

  return match ? ` (${match[1]}.${match[2]})` : '';
}

/** 통장별로 확인값·장부·동별 보유금을 비교하고 행 전체를 통해 상세와 관리 동작으로 이동합니다. */
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
          note={'은행 잔액 확인은 선택 사항입니다.'}
        >
          등록된 입출금으로 계산한 잔액입니다. 계산값이 없으면 마지막 확인 잔액과 날짜를 표시합니다.
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
          const bankDescription = getBankConfirmationDescription(account);
          let bankAmount = '기록 없음';
          if (account.confirmation?.status === 'ORDER_UNCLEAR') bankAmount = '순서 확인 필요';
          else if (account.confirmation?.status === 'BALANCE_MISSING') bankAmount = '잔액 미제공';
          else if (account.balance !== null) bankAmount = `${formatWon(account.balance)}${confirmationDate(account.confirmation?.date ?? account.asOf)}`;

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
                      title={bankDescription}
                    >
                      은행 확인
                      {' '}
                      {bankAmount}
                    </span>
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
