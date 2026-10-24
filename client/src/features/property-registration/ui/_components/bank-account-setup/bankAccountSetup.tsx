'use client';

import { BankIcon } from '@/entities/banking';
import { formatWon } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import {
  createRegistrationAccount,
  getRegistrationAccountsError
} from '../../../model/bankAccount';
import type { RegistrationAccount } from '../../../model/bankAccountTypes';
import { getCashOpeningError } from '../../../model/openingBalances';
import type { OpeningBalancesDraft } from '../../../model/openingBalancesTypes';
import type {
  BuildingDraft,
  UnitDraft
} from '../../../model/unitSetupTypes';
import { RegistrationCashSetup } from '../registration-cash-setup/registrationCashSetup';
import { SetupProgress } from '../setup-progress/setupProgress';
import styles from './bankAccountSetup.module.css';
import { BankIllustration } from './bankIllustration';
import { RegistrationAccountDialog } from './registrationAccountDialog';

/** 공용 관리계좌 목록과 계좌별 잔액을 초안으로 입력하며 이전 이동과 새로고침에서 같은 폼을 복원합니다. */
export function BankAccountSetup({
  propertyName,
  openingBalances,
  units: _units,
  buildings,
  onOpeningChange,
  accounts,
  onChange,
  onPrevious,
  onNext,
}: {
  propertyName: string;
  openingBalances: OpeningBalancesDraft;
  units: UnitDraft[];
  buildings: BuildingDraft[];
  onOpeningChange: (opening: OpeningBalancesDraft) => void;
  accounts: RegistrationAccount[];
  onChange: (accounts: RegistrationAccount[]) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState<{ account: RegistrationAccount; isNew: boolean } | null>(null);
  const accountError = getRegistrationAccountsError(accounts);
  const openingError = getCashOpeningError(openingBalances, buildings, accounts);
  const isValid = !accountError && !openingError;

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, []);

  /** 최초 빈 통장은 등록 모달에서 채우고 이후 추가는 저장할 때에만 목록에 반영합니다. */
  function addAccount() {
    const empty = accounts.find((account) => !account.bankCode && !account.accountNumber && !account.holderName && !account.openingAmount && !account.alias);
    setEditing({
      account: empty ?? createRegistrationAccount(crypto.randomUUID(), accounts.length === 0),
      isNew: !empty
    });
  }

  /** 저장한 통장과 잔액을 함께 반영하며 기본 지정 전환도 한 번의 초안 변경으로 처리합니다. */
  function saveAccount(value: RegistrationAccount) {
    if (!editing) return;
    const updated = editing.isNew ? [...accounts, value] : accounts.map((account) => account.clientId === value.clientId ? value : account);
    onChange(updated.map((account) => ({
      ...account,
      isPrimary: value.isPrimary ? account.clientId === value.clientId : account.isPrimary
    })));
    setEditing(null);
  }

  /** 최소 한 통장을 유지하고 기본 통장을 제거하면 남은 첫 통장을 기본으로 지정합니다. */
  function removeAccount(clientId: string) {
    if (accounts.length <= 1) return;
    const remaining = accounts.filter((account) => account.clientId !== clientId);
    onChange(remaining.some((account) => account.isPrimary) ? remaining : remaining.map((account, index) => ({
      ...account,
      isPrimary: index === 0
    })));
  }

  /** 유효한 계좌 입력을 유지하며 관리비 항목 설정으로 이동하고 업무 데이터는 저장하지 않습니다. */
  function continueSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;

    onNext();
  }

  return (
    <main
      className={styles.page}
    >
      <div
        className={styles['mobile-navigation']}
      >
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'동·세대 및 담당자로 돌아가기'}
          onClick={onPrevious}
          leadingIcon={(
            <ServiceIcon
              name={'chevron'}
              direction={'left'}
            />
          )}
        />
        <span>
          초기 설정
        </span>
      </div>
      <header
        className={styles['setup-heading']}
      >
        <h1>
          {propertyName}
          {' '}
          초기 설정
        </h1>
        <p>
          관리 운영에 필요한 정보를 설정해주세요.
        </p>
      </header>
      <SetupProgress
        currentStep={3}
      />
      <section
        className={styles.card}
        aria-labelledby={'bank-account-setup-title'}
      >
        <header
          className={styles.intro}
        >
          <div
            className={styles.illustration}
            aria-hidden={'true'}
          >
            <BankIllustration />
          </div>
          <div
            className={styles['intro-copy']}
          >
            <h2
              id={'bank-account-setup-title'}
              ref={headingRef}
              tabIndex={-1}
            >
              관리계좌 및 잔고
            </h2>
            <p>
              <span>
                관리에 사용할 통장과 실제 잔액을 등록해주세요.
              </span>
              <span>
                기본 납부계좌는 주민의 관리비 납부 화면에 표시됩니다.
              </span>
            </p>
          </div>
        </header>
        <form
          className={styles.form}
          noValidate
          autoComplete={'off'}
          onSubmit={continueSetup}
        >
          <div
            className={styles['list-heading']}
          >
            <h3>
              통장 관리
            </h3>
            <Button
              onClick={addAccount}
              leadingIcon={(
                <ServiceIcon
                  name={'plus'}
                />
              )}
            >
              통장 추가
            </Button>
          </div>
          <div
            className={styles['account-list']}
          >
            {accounts.map((account, index) => (
              <div
                key={account.clientId}
                className={styles['account-row']}
                role={'group'}
                aria-label={`통장 ${index + 1}`}
                data-removable={accounts.length > 1}
              >
                <Button
                  variant={'ghost'}
                  className={styles['account-summary']}
                  aria-label={`통장 ${index + 1} 수정`}
                  onClick={() => setEditing({
                    account,
                    isNew: false
                  })}
                >
                  <span
                    className={styles['bank-icon']}
                    aria-hidden={'true'}
                  >
                    {account.bankCode ? (
                      <BankIcon
                        bankCode={account.bankCode}
                      />
                    ) : (
                      <ServiceIcon
                        name={'bank'}
                      />
                    )}
                  </span>
                  <span
                    className={styles['account-copy']}
                  >
                    <span
                      className={styles['account-title']}
                    >
                      <strong>
                        {account.bankName || `통장 ${index + 1}`}
                      </strong>
                      {account.isPrimary && (
                        <span
                          className={styles.badge}
                        >
                          기본 납부계좌
                        </span>
                      )}
                    </span>
                    <span
                      className={styles['account-details']}
                    >
                      {account.alias && <span>
                        {account.alias}
                      </span>}
                      {account.accountNumber && <span>
                        {account.accountNumber}
                      </span>}
                      {account.holderName && <span>
                        {`예금주 ${account.holderName}`}
                      </span>}
                      {!account.bankCode && <span>
                        은행과 계좌 정보를 등록해주세요.
                      </span>}
                    </span>
                    {account.openingAmount !== '' && (
                      <span
                        className={styles['account-balance']}
                      >
                        {`실제 잔액 ${formatWon(account.openingAmount)}`}
                      </span>
                    )}
                  </span>
                  <span
                    className={styles['edit-icon']}
                    aria-hidden={'true'}
                    title={'수정'}
                  >
                    <ServiceIcon
                      name={'pen'}
                    />
                  </span>
                </Button>
                {accounts.length > 1 && (
                  <Button
                    variant={'ghost'}
                    tone={'danger'}
                    iconOnly
                    className={styles.remove}
                    aria-label={`통장 ${index + 1} 삭제`}
                    onClick={() => removeAccount(account.clientId)}
                    leadingIcon={(
                      <ServiceIcon
                        name={'trash'}
                      />
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <p
            className={styles.hint}
          >
            <ServiceIcon
              name={'info'}
            />
            통장은 여러 개 등록할 수 있으며, 여러 동이 공동으로 사용할 수 있습니다.
          </p>
          <RegistrationCashSetup
            accounts={accounts}
            opening={openingBalances}
            buildings={buildings}
            onAccountsChange={onChange}
            onOpeningChange={onOpeningChange}
          />
          {openingError && (
            <p
              className={styles['opening-hint']}
            >
              {openingError}
            </p>
          )}
          <div
            className={styles.actions}
          >
            <Button
              variant={'outline'}
              onClick={onPrevious}
            >
              이전
            </Button>
            <Button
              type={'submit'}
              disabled={!isValid}
              trailingIcon={(
                <ServiceIcon
                  name={'chevron'}
                  direction={'right'}
                />
              )}
            >
              다음
            </Button>
          </div>
        </form>
      </section>
      {editing && (
        <RegistrationAccountDialog
          account={editing.account}
          accounts={accounts}
          onSave={saveAccount}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
