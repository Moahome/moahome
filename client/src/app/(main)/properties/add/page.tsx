import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StartPage } from '@/screens/start';

export const metadata: Metadata = {
  title: '등록 및 참여',
  robots: {
    index: false,
    follow: false
  },
};

/** 기존 시작 화면과 등록 단계를 재사용하고 추가 진입에서만 자동 대시보드 이동을 생략합니다. */
export default function Page() {
  return (
    <Suspense>
      <StartPage
        mode={'additional'}
      />
    </Suspense>
  );
}
