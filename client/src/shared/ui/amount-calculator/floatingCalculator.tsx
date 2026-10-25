'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/shared/ui/button';
import { AmountCalculator } from './amountCalculator';
import styles from './floatingCalculator.module.css';

/** 페이지 본문과 독립적으로 계산창을 여는 고정 버튼이며 계산 결과를 업무 화면에 전달하지 않습니다. */
export function FloatingCalculator() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className={styles.launcher}
        variant={'ghost'}
        iconOnly
        aria-label={'계산기 열기'}
        title={'계산기'}
        aria-haspopup={'dialog'}
        onClick={() => setOpen(true)}
      >
        <Image
          src={'/calculator.webp'}
          alt={''}
          width={64}
          height={64}
        />
      </Button>
      <AmountCalculator
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
