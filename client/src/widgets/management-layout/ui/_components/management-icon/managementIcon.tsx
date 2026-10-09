import type { ReactNode } from 'react';

const ICONS = {
  home: (
    <path
      d={'m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z'}
    />
  ),
  users: <>
    <circle
      cx={'9'}
      cy={'7'}
      r={'3'}
    />
    <path
      d={'M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3'}
    />
  </>,
  receipt: <>
    <path
      d={'M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7m-7 4h7'}
    />
  </>,
  card: <>
    <rect
      x={'3'}
      y={'5'}
      width={'18'}
      height={'14'}
      rx={'2'}
    />
    <path
      d={'M3 10h18M7 15h3'}
    />
  </>,
  bank: (
    <path
      d={'m3 8 9-5 9 5ZM5 11v7m7-7v7m7-7v7M3 21h18M3 18h18'}
    />
  ),
  expense: <>
    <rect
      x={'5'}
      y={'7'}
      width={'14'}
      height={'14'}
      rx={'2'}
    />
    <path
      d={'M9 7V4h6v3m-6 6h6m-6 4h3'}
    />
  </>,
  chart: (
    <path
      d={'M5 20v-7m7 7V4m7 16V9'}
    />
  ),
  closing: <>
    <rect
      x={'4'}
      y={'5'}
      width={'16'}
      height={'16'}
      rx={'2'}
    />
    <path
      d={'M8 3v4m8-4v4M4 11h16m-12 5 2 2 4-4'}
    />
  </>,
  notice: <>
    <path
      d={'m4 10 13-5v14L4 14Zm0 0H2v4h2m3 1 2 6h3l-2-5m10-7 2-1m-2 7 2 1'}
    />
  </>,
  settings: <>
    <path
      d={'m10 3-1 3-3 1-3 3 2 2-1 4 3 3 3-1 2 3 4-1 1-3 3-1 1-4-2-2 1-4-3-3-3 1Z'}
    />
    <circle
      cx={'12'}
      cy={'12'}
      r={'3'}
    />
  </>,
  chevron: (
    <path
      d={'m7 10 5 5 5-5'}
    />
  ),
  menu: (
    <path
      d={'M4 6h16M4 12h16M4 18h16'}
    />
  ),
  close: (
    <path
      d={'m6 6 12 12M6 18 18 6'}
    />
  ),
} satisfies Record<string, ReactNode>;

export type ManagementIconName = keyof typeof ICONS;

export function ManagementIcon({ name }: { name: ManagementIconName }) {
  return (
    <svg
      width={'22'}
      height={'22'}
      viewBox={'0 0 24 24'}
      fill={'none'}
      stroke={'currentColor'}
      strokeWidth={'1.8'}
      strokeLinecap={'round'}
      strokeLinejoin={'round'}
      aria-hidden={'true'}
    >
      {ICONS[name]}
    </svg>
  );
}
