import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 검색·공유 미리보기에는 비공개 건물명이나 공지 본문을 넣지 않습니다.
export const metadata: Metadata = {
  title: '주민 공지사항',
  description: '관리사무소에서 안내받은 링크로 우리 건물의 공지사항을 확인하세요.',
  robots: {
    index: false,
    follow: false
  },
  referrer: 'no-referrer',
  openGraph: {
    title: '모아홈 주민 공지사항',
    description: '안내받은 링크로 건물 공지사항을 확인하세요.'
  },
  twitter: {
    title: '모아홈 주민 공지사항',
    description: '안내받은 링크로 건물 공지사항을 확인하세요.'
  }
};

export default function ResidentNoticeLayout({ children }: { children: ReactNode }) {
  return children;
}
