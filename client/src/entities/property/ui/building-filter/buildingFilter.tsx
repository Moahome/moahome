'use client';

import {
  Dropdown,
  type DropdownOption,
  type DropdownProps
} from '@/shared/ui/form-controls';

type Props = Omit<Extract<DropdownProps, { multiple?: false }>, 'options'> & {
  buildings: readonly DropdownOption[];
  allValue?: string;
};

/** 전체 동 선택은 실제 동 선택지가 있을 때만 제공하며 빈 검색 결과와 동 없는 관리대상을 구분합니다. */
export function BuildingFilter({
  buildings,
  allValue = '',
  ...props
}: Props) {
  if (!buildings.length)
    return null;

  return (
    <Dropdown
      {...props}
      options={[{
        value: allValue,
        label: '전체 동'
      }, ...buildings]}
    />
  );
}
