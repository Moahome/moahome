'use client';

import {
  BankAccountCard,
  getBankAccountErrors
} from '@/entities/banking';
import { Button } from '@/shared/ui/button';
import { ClientModal } from '@/shared/ui/client-modal';
import { ServiceIcon } from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  useId,
  useState,
  type FormEvent
} from 'react';
import type { RegistrationAccount } from '../../../model/bankAccountTypes';
import styles from './registrationAccountDialog.module.css';

/** 모달의 편집본은 저장할 때만 목록에 반영해 취소·닫기·새로고침으로 미확정 통장이 추가되지 않게 합니다. */
export function RegistrationAccountDialog({ account, accounts, onSave, onClose }: {
  account: RegistrationAccount;
  accounts: RegistrationAccount[];
  onSave: (account: RegistrationAccount) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(account);
  const [duplicateNotice, setDuplicateNotice] = useState(0);
  const titleId = useId();
  const descriptionId = useId();
  const title = account.accountNumber ? '통장 수정' : '통장 추가';
  const others = accounts.filter((row) => row.clientId !== draft.clientId);
  const duplicate = Boolean(draft.bankCode && draft.accountNumber) && others.some((row) => row.bankCode === draft.bankCode && row.accountNumber === draft.accountNumber);
  const hasPrimary = draft.isPrimary || others.some((row) => row.isPrimary);
  const valid = Object.keys(getBankAccountErrors(draft)).length === 0
    && hasPrimary;

  /** 필수 계좌 정보·중복과 기본 계좌 유지를 확인한 뒤 초안 한 건을 저장합니다. */
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    if (duplicate) { setDuplicateNotice((value) => value + 1); return; }
    onSave(draft);
  }

  return (
    <ClientModal
      className={styles.modal}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
    >
      <header
        className={styles.header}
      >
        <div>
          <h2
            id={titleId}
          >
            {title}
          </h2>
          <p
            id={descriptionId}
          >
            관리비 수납과 지출에 사용할 통장을 등록합니다.
          </p>
        </div>
        <Button
          variant={'ghost'}
          iconOnly
          aria-label={'통장 편집 닫기'}
          onClick={onClose}
          leadingIcon={(
            <ServiceIcon
              name={'close'}
            />
          )}
        />
      </header>
      <form
        className={styles.form}
        onSubmit={submit}
        noValidate
        autoComplete={'off'}
      >
        <div
          className={styles.body}
        >
          <BankAccountCard
            title={'통장 정보'}
            presentation={'form'}
            account={draft}
            onChange={(value) => setDraft((previous) => ({
              ...previous,
              ...value
            }))}
            onPrimaryChange={(isPrimary) => setDraft((previous) => ({
              ...previous,
              isPrimary
            }))}
          >

          </BankAccountCard>
          {!hasPrimary && (
            <p
              className={styles.error}
              role={'status'}
            >
              기본 납부계좌는 하나 이상 유지해주세요. 다른 통장에서 기본 지정을 변경할 수 있습니다.
            </p>
          )}
        </div>
        <footer
          className={styles.actions}
        >
          <Button
            variant={'outline'}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type={'submit'}
            disabled={!valid}
          >
            {account.accountNumber ? '저장' : '등록'}
          </Button>
        </footer>
      </form>
      {duplicateNotice > 0 && (
        <Toast
          key={duplicateNotice}
          message={'같은 은행과 계좌번호가 이미 등록되어 있어요.'}
          tone={'error'}
          onClose={() => setDuplicateNotice(0)}
        />
      )}
    </ClientModal>
  );
}
