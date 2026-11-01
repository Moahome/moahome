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
import {
  getAccountBalanceDisplay,
  getBankConfirmationDescription
} from '../../../model/accountBalance';
import styles from './accountBalances.module.css';
import { BankingActionsMenu } from '../banking-actions-menu/bankingActionsMenu';

/** 월말 장부 잔액을 기본으로 표시하고 마지막 은행 확인값은 별도 참고 정보로 보존합니다. */
export function AccountBalances({
  accounts,
  month,
  onOpen,
  onCheck,
  onHistory,
  onInitial,
  canCorrectInitial,
}: {
  accounts: AccountBalance[];
  month: string;
  onOpen: (accountId: string) => void;
  onCheck: (id: string) => void;
  onHistory: (id: string) => void;
  onInitial: (id: string) => void;
  canCorrectInitial: boolean;
}) {
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
          통장 초기 잔액에 업로드·수동 입출금을 반영한 금액입니다.
        </InfoTooltip>
        <h2>
          통장별 장부 잔액
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
                  <small>
                    {month}
                    {' '}
                    월말 · 등록된 입출금 기준
                  </small>
                  <small>
                    {display.description}
                  </small>
                  <small>
                    {getBankConfirmationDescription(account)}
                  </small>
                </span>
                <span
                  className={styles.amount}
                  data-unknown={display.amount === null}
                >
                  {display.amount === null
                    ? '초기 잔액 설정 필요'
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
                    ...(canCorrectInitial ? [{
                      label: '초기 잔액 정정',
                      icon: 'pen' as const,
                      onSelect: () => onInitial(account.id)
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
