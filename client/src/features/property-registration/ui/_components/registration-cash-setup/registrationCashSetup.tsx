'use client';

import {
  useId,
  useState
} from 'react';
import {
  formatInteger,
  formatWon
} from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { CalendarPicker } from '@/shared/ui/calendar-picker';
import {
  AmountInput,
  SelectDropdown
} from '@/shared/ui/form-controls';
import { InfoTooltip } from '@/shared/ui/info-tooltip';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { SummaryCard } from '@/shared/ui/summary-card';
import {
  getAccountBuildingAmount,
  getOpeningToday
} from '../../../model/openingBalances';
import type { RegistrationAccount } from '../../../model/bankAccountTypes';
import type { OpeningBalancesDraft } from '../../../model/openingBalancesTypes';
import type { BuildingDraft } from '../../../model/unitSetupTypes';
import { getSortedBuildings } from '../../_utils/setupSorting';
import styles from './registrationCashSetup.module.css';

/** 통장 실제 잔액과 통장 안의 동별 몫을 따로 입력하고 누락·시점 차이는 합계 일치로 숨기지 않습니다. */
export function RegistrationCashSetup({
  accounts,
  opening,
  buildings,
  onAccountsChange,
  onOpeningChange,
}: {
  accounts: RegistrationAccount[];
  opening: OpeningBalancesDraft;
  buildings: BuildingDraft[];
  onAccountsChange: (accounts: RegistrationAccount[]) => void;
  onOpeningChange: (opening: OpeningBalancesDraft) => void;
}) {
  const tabId = useId();
  const [tab, setTab] = useState<'account' | 'building'>('account');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const account = accounts.find((row) => row.clientId === selectedAccount) ?? accounts[0];
  const ordered = getSortedBuildings(buildings);
  const building = ordered.find((row) => row.clientId === selectedBuilding) ?? ordered[0];
  const accountEntered = accounts.filter((row) => /^[0-9]{1,15}$/.test(row.openingAmount));
  const amounts = accounts.flatMap((row) =>
    buildings.map((b) =>
      getAccountBuildingAmount(opening, row.clientId, b.clientId, accounts.length),
    ),
  );
  const buildingEntered = amounts.filter((value) => /^-?[0-9]{1,15}$/.test(value));
  const accountTotal = accountEntered.reduce(
    (sum, row) => sum + BigInt(row.openingAmount),
    BigInt(0),
  );
  const buildingTotal = buildingEntered.reduce((sum, amount) => sum + BigInt(amount), BigInt(0));
  const complete =
    accounts.length > 0 &&
    accountEntered.length === accounts.length &&
    buildingEntered.length === amounts.length;
  const comparable =
    complete &&
    buildings.length > 0 &&
    opening.cashCutoffDate === opening.cutoffDate &&
    Boolean(opening.cutoffDate);
  const difference = accountTotal - buildingTotal;

  /** 한 통장의 입력만 바꾸고 다른 통장·동의 초안은 유지합니다. */
  function updateBuilding(amount: string) {
    if (!account || !building) return;
    const current = Object.fromEntries(
      buildings.map((row) => [
        row.clientId,
        getAccountBuildingAmount(opening, account.clientId, row.clientId, accounts.length),
      ]),
    );
    onOpeningChange({
      ...opening,
      accountBuildings: {
        ...opening.accountBuildings,
        [account.clientId]: {
          ...current,
          [building.clientId]: amount,
        },
      },
    });
  }

  return (
    <section
      className={styles.panel}
      aria-label={'통장·동별 시작 잔고'}
    >
      <h3>
        통장·동별 시작 잔고
      </h3>
      <p>
        기준일의 은행 실제 잔액과 통장별로 각 동이 보유한 금액을 입력합니다.
      </p>
      <div
        className={styles.tabs}
        role={'tablist'}
        aria-label={'시작 잔고 입력 종류'}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.click(); buttons[next]?.focus();
        }}
      >
        {(['account', 'building'] as const)
          .filter((value) => value === 'account' || buildings.length > 0)
          .map((value) => (
            <Button
              key={value}
              variant={'ghost'}
              role={'tab'}
              id={`${tabId}-${value}`}
              tabIndex={tab === value ? 0 : -1}
              aria-selected={tab === value}
              aria-controls={`${tabId}-panel`}
              onClick={() => setTab(value)}
            >
              {value === 'account'
                ? `통장별 시작 잔액 ${accountEntered.length}/${accounts.length}`
                : `동별 시작 보유금 ${buildingEntered.length}/${amounts.length}`}
            </Button>
          ))}
      </div>
      <div
        className={styles.fields}
        id={`${tabId}-panel`}
        role={'tabpanel'}
        aria-labelledby={`${tabId}-${tab}`}
      >
        <h4>
          {tab === 'account' ? '통장별 시작 잔액' : '동별 시작 보유금'}
        </h4>
        <p>
          {tab === 'account'
            ? '선택한 기준일의 은행 실제 잔액을 기록합니다. 동별 시작 보유금은 별도로 입력합니다.'
            : '선택한 통장 안에서 각 동이 보유한 금액을 입력하세요. 미납·선납 합계를 옮기지 않습니다.'}
        </p>
        <div
          className={styles.row}
        >
          <CalendarPicker
            variant={'input'}
            label={tab === 'account' ? '통장 기준일' : '동별 잔고 기준일'}
            required
            value={tab === 'account' ? opening.cutoffDate : opening.cashCutoffDate}
            onChange={(date) =>
              onOpeningChange({
                ...opening,
                [tab === 'account' ? 'cutoffDate' : 'cashCutoffDate']: date,
              })
            }
          />
          <SelectDropdown
            label={'입력할 통장'}
            value={account?.clientId ?? ''}
            options={accounts.map((row, index) => ({
              value: row.clientId,
              label: `${row.bankName || `통장 ${index + 1}`}${row.alias ? ` · ${row.alias}` : ''}${row.accountNumber ? ` (${row.accountNumber.slice(-4)})` : ''}`,
            }))}
            onChange={setSelectedAccount}
          />
        </div>
        {tab === 'account' && account && (
          <AmountInput
            label={'실제 시작 잔액'}
            aria-label={'실제 시작 잔액'}
            required
            value={account.openingAmount}
            trailingContent={'원'}
            placeholder={'금액을 입력해주세요.'}
            onChange={(openingAmount) =>
              onAccountsChange(
                accounts.map((row) =>
                  row.clientId === account.clientId
                    ? {
                      ...row,
                      openingAmount,
                    }
                    : row,
                ),
              )
            }
          />
        )}
        {tab === 'building' && account && building && (
          <>
            {!opening.cashCutoffDate && opening.cutoffDate && (
              <Button
                variant={'text'}
                onClick={() =>
                  onOpeningChange({
                    ...opening,
                    cashCutoffDate: opening.cutoffDate,
                  })
                }
              >
                통장 기준일과 같은 날짜 사용
              </Button>
            )}
            <div
              className={styles.row}
            >
              <SelectDropdown
                label={'보유금 입력 동'}
                value={building.clientId}
                onChange={setSelectedBuilding}
                options={ordered.map((row) => ({
                  value: row.clientId,
                  label: row.name,
                }))}
              />
              <AmountInput
                label={`${building.name} 시작 보유금`}
                aria-label={`${building.name} 시작 보유금`}
                required
                value={getAccountBuildingAmount(
                  opening,
                  account.clientId,
                  building.clientId,
                  accounts.length,
                )}
                trailingContent={'원'}
                onChange={updateBuilding}
              />
            </div>
            {accounts.length > 1 &&
              Object.keys(opening.buildings).length > 0 &&
              !opening.accountBuildings?.[account.clientId] && (
              <div>
                <p>
                  이전 초안에는 통장 귀속이 없는 동별 보유금이 있습니다. 선택한 통장에 해당하는지
                  확인한 뒤 가져오세요.
                </p>
                <Button
                  variant={'outline'}
                  onClick={() =>
                    onOpeningChange({
                      ...opening,
                      accountBuildings: {
                        ...opening.accountBuildings,
                        [account.clientId]: {
                          ...opening.buildings,
                        },
                      },
                    })
                  }
                >
                  선택 통장의 금액으로 가져오기
                </Button>
              </div>
            )}
          </>
        )}
        <p>
          기준일은 오늘(
          {getOpeningToday()}
          ) 또는 이전 날짜로 선택해주세요. 모르는 잔고는 0원으로 확정하지 마세요.
        </p>
      </div>
      <div
        className={styles.summary}
      >
        <h4>
          시작 잔액 요약
        </h4>
        <div
          className={styles.cards}
        >
          {[
            {
              label: '은행 시작 잔액',
              amount: accountTotal,
              ready: accountEntered.length === accounts.length && accounts.length > 0,
              icon: 'bank' as const,
              text: '입력한 통장의 실제 시작 잔액 합계입니다. 통장 기준일은 기존 장부 기준일과 함께 적용됩니다.',
            },
            {
              label: '동별 시작 보유금 합계',
              amount: buildingTotal,
              ready: buildingEntered.length === amounts.length && amounts.length > 0,
              icon: 'building' as const,
              text: '각 통장 안의 동별 시작 보유금을 합한 금액입니다. 미입력 금액은 0원이 아닙니다.',
            },
            {
              label: '차이',
              amount: difference,
              ready: comparable,
              icon: 'bank' as const,
              text: '같은 기준일의 은행 시작 잔액에서 동별 보유금 합계를 뺀 금액입니다. 차이를 자동 배분하지 않습니다.',
            },
          ].map((item) => (
            <SummaryCard
              key={item.label}
              label={item.label}
              value={
                item.ready
                  ? `${item.label === '차이' && item.amount > BigInt(0) ? '+' : ''}${formatInteger(item.amount)}`
                  : !buildings.length && item.label !== '은행 시작 잔액'
                    ? '동 구분 없음'
                    : item.label === '차이' && complete && buildings.length > 0
                      ? '기준일 다름'
                      : '입력 미완료'
              }
              unit={item.ready ? '원' : ''}
              density={'compact'}
              tone={'primary'}
              icon={(
                <ServiceIcon
                  name={item.icon}
                />
              )}
              help={
                <InfoTooltip
                  size={'sm'}
                  label={`${item.label} 도움말`}
                  title={item.label}
                >
                  {item.text}
                </InfoTooltip>
              }
            />
          ))}
        </div>
        {!complete && (
          <p>
            입력을 완료한 금액: 통장
            {formatWon(accountTotal)}
            {' '}
            · 동별 보유금
            {formatWon(buildingTotal)}
          </p>
        )}
        {complete && buildings.length > 0 && !comparable && (
          <p>
            기준일이 달라 직접 비교하기 어렵습니다.
          </p>
        )}
      </div>
    </section>
  );
}
