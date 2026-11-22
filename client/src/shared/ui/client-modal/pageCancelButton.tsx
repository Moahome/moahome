'use client';

import { useContext } from 'react';
import {
  Button,
  type ButtonProps
} from '@/shared/ui/button';
import { ClientModalContext } from './clientModalContext';

/** 페이지에서만 필요한 일반 복귀·취소를 표시하고 같은 폼이 모달 안에 있으면 상단 X로 닫습니다. */
export function PageCancelButton(props: ButtonProps) {
  const inModal = useContext(ClientModalContext);
  if (inModal)
    return null;

  return (
    <Button
      {...props}
    />
  );
}
