import type { ReactNode } from 'react';
import {
  Button,
  type ButtonProps
} from '@/shared/ui/button';

export interface IconButtonProps extends Omit<ButtonProps, 'leadingIcon'> {
  icon: ReactNode;
}

/** 전달받은 아이콘을 공통 버튼에 배치하고 문구·색상·크기·클릭 처리는 호출자가 정합니다. */
export function IconButton({
  icon,
  ...buttonProps
}: IconButtonProps) {
  return (
    <Button
      {...buttonProps}
      leadingIcon={icon}
    />
  );
}
