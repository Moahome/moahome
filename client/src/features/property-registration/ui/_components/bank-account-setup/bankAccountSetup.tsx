'use client';

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent
} from 'react';
import {
  BANK_OPTIONS,
  BankIcon
} from '@/entities/banking';
import { Button } from '@/shared/ui/button';
import {
  SelectDropdown,
  Input
} from '@/shared/ui/form-controls';
import {
  getBankAccountErrors,
  normalizeAccountNumber,
  type BankAccountDraft
} from '../../../model/bankAccount';
import { RegistrationIcon } from '../registration-icon/registrationIcon';
import { SetupProgress } from '../setup-progress/setupProgress';
import { BankIllustration } from './bankIllustration';
import styles from './bankAccountSetup.module.css';

const BANK_SELECT_OPTIONS = BANK_OPTIONS.map((option) => ({
  ...option,
  icon: (
    <BankIcon
      bankCode={option.value}
    />
  )
}));

/** 공용 관리계좌 하나를 초안으로 입력하며 이전 이동과 새로고침에서 같은 폼을 복원합니다. */
export function BankAccountSetup({
  propertyName,
  account,
  onChange,
  onPrevious,
  onNext,
}: {
  propertyName: string;
  account: BankAccountDraft;
  onChange: (account: BankAccountDraft) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof BankAccountDraft, boolean>>>({});
  const errors = getBankAccountErrors(account);
  const isValid = Object.keys(errors).length === 0;

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

  /** 복사한 번호의 구분 기호만 제거하고 다른 문자가 있으면 붙여넣기를 거부해 번호 변형을 막습니다. */
  function pasteAccountNumber(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const number = normalizeAccountNumber(event.clipboardData.getData('text'));
    if (!/^[0-9]+$/.test(number)) return;

    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    updateAccount({
      accountNumber: input.value.slice(0, start) + number + input.value.slice(end)
    });
    requestAnimationFrame(() => input.setSelectionRange(start + number.length, start + number.length));
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
          aria-label={'동·세대 설정으로 돌아가기'}
          onClick={onPrevious}
          leadingIcon={(
            <RegistrationIcon
              name={'back'}
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
              관리계좌 설정
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
            <SelectDropdown
              label={'은행'}
              required
              options={BANK_SELECT_OPTIONS}
              layout={'grid'}
              searchLayout={'list'}
              placeholder={'은행을 선택하거나 검색해주세요'}
              value={account.bankCode}
              fieldClassName={styles.field}
              error={touched.bankCode ? errors.bankCode : undefined}
              onBlur={() => setTouched((previous) => ({
                ...previous,
                bankCode: true
              }))}
              onChange={(bankCode) => {
                const bank = BANK_OPTIONS.find((option) => option.value === bankCode);
                if (bank) updateAccount({
                  bankCode: bank.value,
                  bankName: bank.label
                });
              }}
            />
            <Input
              label={'계좌번호'}
              required
              value={account.accountNumber}
              placeholder={'계좌번호를 입력해주세요'}
              digitsOnly
              fieldClassName={styles.field}
              error={touched.accountNumber ? errors.accountNumber : undefined}
              onBlur={() => setTouched((previous) => ({
                ...previous,
                accountNumber: true
              }))}
              onChange={(event) => updateAccount({
                accountNumber: event.target.value
              })}
              onPaste={pasteAccountNumber}
            />
            <Input
              label={'예금주'}
              required
              value={account.holderName}
              placeholder={'예금주 이름을 입력해주세요'}
              fieldClassName={styles.field}
              error={touched.holderName ? errors.holderName : undefined}
              onBlur={() => setTouched((previous) => ({
                ...previous,
                holderName: true
              }))}
              onChange={(event) => updateAccount({
                holderName: event.target.value
              })}
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
          <aside
            className={styles.notice}
          >
            <span
              className={styles['notice-icon']}
            >
              <RegistrationIcon
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
                <RegistrationIcon
                  name={'next'}
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
