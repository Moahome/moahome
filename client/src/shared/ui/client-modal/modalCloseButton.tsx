'use client';

import {
  Button,
  type ButtonProps
} from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './modalCloseButton.module.css';

type Props = Omit<ButtonProps, 'children' | 'variant' | 'size' | 'iconOnly' | 'leadingIcon' | 'trailingIcon' | 'style' | 'aria-label'> & {
  'aria-label': string;
};

/** 모든 모달에서 같은 작은 X·클릭 영역을 사용하고 호출자의 닫기·진행 중 잠금은 유지합니다. */
export function ModalCloseButton({
  className, ...props
}: Props) {
  return (
    <Button
      {...props}
      className={[styles.close, className].filter(Boolean).join(' ')}
      variant={'ghost'}
      size={'sm'}
      iconOnly
      data-modal-close={'true'}
    >
      <ServiceIcon
        name={'close'}
        size={18}
      />
    </Button>
  );
}
