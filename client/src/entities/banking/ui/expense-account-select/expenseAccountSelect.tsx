'use client';

import { SelectDropdown } from '@/shared/ui/form-controls';
import { DEFAULT_EXPENSE_ACCOUNTS } from '../../constants/expenseAccounts';
import type { ExpenseAccountOption } from '../../model/allocationTypes';

/** 모든 지출 입력에서 코드·이름을 함께 검색하며 미선택은 기존 자동 매칭으로 유지합니다. */
export function ExpenseAccountSelect({ value, onChange, options = DEFAULT_EXPENSE_ACCOUNTS, disabled = false }: {
  value?: string | null;
  onChange: (code: string) => void;
  options?: readonly ExpenseAccountOption[];
  disabled?: boolean;
}) {
  return (
    <SelectDropdown
      label={'계정과목'}
      placeholder={'계정과목 선택 (선택사항)'}
      description={'선택하지 않으면 지출명으로 자동 매칭하며, 일치하는 과목이 없으면 미지정으로 저장합니다.'}
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled}
      options={[{
        value: '',
        label: '자동 매칭'
      }, ...[...options.filter((account) => account.code !== '103')].sort((left, right) => left.code.localeCompare(right.code)).map((account) => ({
        value: account.code,
        label: `${account.code} ${account.name}`
      }))]}
    />
  );
}
