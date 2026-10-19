'use client';

import {
  Input,
  SelectDropdown
} from '@/shared/ui/form-controls';
import {
  useState,
  type ClipboardEvent
} from 'react';
import { BANK_OPTIONS } from '../../constants/bankOptions';
import {
  getBankAccountErrors,
  normalizeAccountNumber
} from '../../model/bankAccount';
import type { BankAccountDraft } from '../../model/bankAccountTypes';
import { BankIcon } from '../bank-icon/bankIcon';

const BANK_SELECT_OPTIONS = BANK_OPTIONS.map((option) => ({
  ...option,
  icon: (
    <BankIcon
      bankCode={option.value}
    />
  )
}));

/** 초기 등록과 설정의 계좌 정정에서 같은 은행 선택·번호 입력·예금주 검증을 사용합니다. */
export function BankAccountFields({ account, onChange, fieldClassName }: {
  account: BankAccountDraft;
  onChange: (account: BankAccountDraft) => void;
  fieldClassName?: string;
}) {
  const [touched, setTouched] = useState<Partial<Record<keyof BankAccountDraft, boolean>>>({});
  const errors = getBankAccountErrors(account);

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

  return (
    <>
      <Input
        label={'통장 별칭'}
        value={account.alias ?? ''}
        placeholder={'예: 운영비 통장, 공용 관리비 계좌'}
        maxLength={100}
        fieldClassName={fieldClassName}
        onChange={(event) => updateAccount({
          alias: event.target.value
        })}
      />
      <SelectDropdown
        label={'은행'}
        required
        options={BANK_SELECT_OPTIONS}
        layout={'grid'}
        searchLayout={'list'}
        placeholder={'은행을 선택하거나 검색해주세요'}
        value={account.bankCode}
        fieldClassName={fieldClassName}
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
        fieldClassName={fieldClassName}
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
        fieldClassName={fieldClassName}
        error={touched.holderName ? errors.holderName : undefined}
        onBlur={() => setTouched((previous) => ({
          ...previous,
          holderName: true
        }))}
        onChange={(event) => updateAccount({
          holderName: event.target.value
        })}
      />
    </>
  );
}
