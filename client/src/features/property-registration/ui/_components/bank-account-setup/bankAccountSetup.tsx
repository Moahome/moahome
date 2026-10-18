'use client';

import {
  useEffect,
  useRef,
  type FormEvent
} from 'react';
import { BankAccountFields } from '@/entities/banking';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  getBankAccountErrors,
  type BankAccountDraft
} from '../../../model/bankAccount';
import { SetupProgress } from '../setup-progress/setupProgress';
import { BankIllustration } from './bankIllustration';
import { OpeningBalanceFields } from '../opening-balance-fields/openingBalanceFields';
import {
  getCashOpeningError,
  type OpeningBalancesDraft
} from '../../../model/openingBalances';
import type {
  BuildingDraft,
  UnitDraft
} from '../../../model/unitSetup';
import styles from './bankAccountSetup.module.css';

/** 공용 관리계좌 하나를 초안으로 입력하며 이전 이동과 새로고침에서 같은 폼을 복원합니다. */
export function BankAccountSetup({
  propertyName,
  openingBalances,
  units,
  buildings,
  onOpeningChange,
  account,
  onChange,
  onPrevious,
  onNext,
}: {
  propertyName: string;
  openingBalances: OpeningBalancesDraft;
  units: UnitDraft[];
  buildings: BuildingDraft[];
  onOpeningChange: (opening: OpeningBalancesDraft) => void;
  account: BankAccountDraft;
  onChange: (account: BankAccountDraft) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errors = getBankAccountErrors(account);
  const openingError = getCashOpeningError(openingBalances, buildings);
  const isValid = Object.keys(errors).length === 0 && !openingError;

  useEffect(() => {
    headingRef.current?.focus({
      preventScroll: true
    });
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  }, []);

  /** 선택한 은행의 코드와 이름 또는 입력값을 같은 계좌 초안에 반영합니다. */
  function updateAccount(changes: Partial<BankAccountDraft>) {
    onChange({
      ...account,
      ...changes
    });
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
                주민이 관리비를 입금할 계좌를 등록해주세요.
              </span>
              <span>
                등록한 계좌는 주민의 관리비 납부 화면에 표시됩니다.
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
            className={styles.fields}
          >
            <BankAccountFields
              account={account}
              onChange={onChange}
              fieldClassName={styles.field}
            />
            <div
              className={styles['primary-field']}
            >
              <label
                className={styles['primary-choice']}
              >
                <input
                  type={'checkbox'}
                  checked={account.isPrimary}
                  aria-invalid={!account.isPrimary}
                  aria-describedby={!account.isPrimary ? 'primary-account-error' : undefined}
                  onChange={(event) => updateAccount({
                    isPrimary: event.target.checked
                  })}
                />
                <span>
                  이 계좌를 기본 관리계좌로 사용
                </span>
              </label>
              {errors.isPrimary && (
                <p
                  id={'primary-account-error'}
                  className={styles.error}
                  role={'alert'}
                >
                  {errors.isPrimary}
                </p>
              )}
            </div>
          </div>
          <OpeningBalanceFields
            kind={'account'}
            opening={openingBalances}
            units={units}
            buildings={buildings}
            onChange={onOpeningChange}
          />
          <aside
            className={styles.notice}
          >
            <span
              className={styles['notice-icon']}
            >
              <ServiceIcon
                name={'info'}
              />
            </span>
            <p>
              <span>
                주민 화면에는 은행명, 계좌번호, 예금주가 표시됩니다.
              </span>
              <span>
                계좌 정보는 나중에 설정에서 변경할 수 있습니다.
              </span>
            </p>
          </aside>
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
    </main>
  );
}
