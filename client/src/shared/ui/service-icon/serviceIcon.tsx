import type { CSSProperties } from 'react';

const ICON_PATHS = {
  more: (
    <>
      <circle
        cx={12}
        cy={5}
        r={1.5}
        fill={'currentColor'}
        stroke={'none'}
      />
      <circle
        cx={12}
        cy={12}
        r={1.5}
        fill={'currentColor'}
        stroke={'none'}
      />
      <circle
        cx={12}
        cy={19}
        r={1.5}
        fill={'currentColor'}
        stroke={'none'}
      />
    </>
  ),
  star: (
    <path
      d={'m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2 1.2-6.8-5-4.9 6.9-1Z'}
      fill={'currentColor'}
      stroke={'none'}
    />
  ),
  download: (
    <path
      d={'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6'}
    />
  ),
  excel: (
    <>
      <path
        d={'M14 3h6v18h-6M14 7h6M14 11h6M14 15h6M3 5l11-2v18L3 19Z'}
      />
      <path
        d={'m6 9 5 6m0-6-5 6'}
      />
    </>
  ),
  check: (
    <path
      d={'m5 12 4 4L19 6'}
    />
  ),
  pen: (
    <path
      d={'m16 3 5 5M4 15 16 3a3.5 3.5 0 0 1 5 5L9 20l-6 1 1-6Z'}
    />
  ),
  trash: (
    <path
      d={'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'}
    />
  ),
  home: (
    <path
      d={'m3 10 9-8 9 8M5 9v12h14V9M9 21v-7h6v7'}
    />
  ),
  plus: (
    <path
      d={'M12 5v14M5 12h14'}
    />
  ),
  search: (
    <>
      <circle
        cx={'10.5'}
        cy={'10.5'}
        r={'6.5'}
      />
      <path
        d={'m16 16 5 5'}
      />
    </>
  ),
  reset: (
    <path
      d={'M3 10a9 9 0 1 1 1 7M3 4v6h6'}
    />
  ),
  close: (
    <path
      d={'m6 6 12 12M18 6 6 18'}
    />
  ),
  bell: (
    <>
      <path
        d={'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z'}
      />
      <path
        d={'M10 21h4M12 2V1'}
      />
    </>
  ),
  person: (
    <>
      <circle
        cx={'12'}
        cy={'8'}
        r={'4'}
      />
      <path
        d={'M4 22v-2a8 8 0 0 1 16 0v2'}
      />
    </>
  ),
  chevron: (
    <path
      d={'m9 5 7 7-7 7'}
    />
  ),
  clock: (
    <>
      <circle
        cx={'12'}
        cy={'12'}
        r={'9'}
      />
      <path
        d={'M12 6v6l4 3'}
      />
    </>
  ),
  alert: (
    <>
      <circle
        cx={'12'}
        cy={'12'}
        r={'9'}
      />
      <path
        d={'M12 7v6m0 4h.01'}
      />
    </>
  ),
  location: (
    <>
      <path
        d={'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z'}
      />
      <circle
        cx={'12'}
        cy={'10'}
        r={'3'}
      />
    </>
  ),
  coins: (
    <>
      <ellipse
        cx={'10'}
        cy={'5'}
        rx={'7'}
        ry={'3'}
      />
      <path
        d={'M3 5v5c0 1.7 3.1 3 7 3m7-8v4M3 10v5c0 1.7 3.1 3 7 3M3 15v4c0 1.7 3.1 3 7 3'}
      />
      <circle
        cx={'17'}
        cy={'16'}
        r={'5'}
      />
    </>
  ),
  bank: (
    <path
      d={'m2 8 10-6 10 6H2Zm2 12h16M6 11v6m6-6v6m6-6v6M2 22h20'}
    />
  ),
  receipt: (
    <>
      <path
        d={'M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h6'}
      />
    </>
  ),
  cleaning: (
    <path
      d={'m15 3-6 10m-2-1 6 4-5 6-6-4 5-6Zm-3 6 5 3'}
    />
  ),
  elevator: (
    <>
      <rect
        x={'4'}
        y={'3'}
        width={'16'}
        height={'18'}
        rx={'2'}
      />
      <path
        d={'M12 10v11M8 7l2-2 2 2m1-2 2 2 2-2'}
      />
    </>
  ),
  electricity: (
    <path
      d={'m13 2-9 12h7l-1 8 10-13h-8l1-7Z'}
    />
  ),
  water: (
    <path
      d={'M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Zm-3 12a3 3 0 0 0 3 3'}
    />
  ),
  septic: (
    <>
      <rect
        x={'3'}
        y={'7'}
        width={'18'}
        height={'14'}
        rx={'2'}
      />
      <path
        d={'M7 7V3h5M3 11h18M6 15c2-2 4 2 6 0s4 2 6 0M6 18c2-2 4 2 6 0s4 2 6 0'}
      />
    </>
  ),
  building: (
    <>
      <rect
        x={'5'}
        y={'3'}
        width={'14'}
        height={'18'}
        rx={'2'}
        fill={'currentColor'}
        fillOpacity={'0.15'}
      />
      <path
        d={'M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3'}
      />
    </>
  ),
  settings: (
    <>
      <path
        d={'m9.2 3-.6 2.3-2 .9-2.1-.6L2 9.9l1.6 1.7v2L2 15.3l2.5 4.3 2.1-.6 2 .9.6 2.1h5.6l.6-2.1 2-.9 2.1.6 2.5-4.3-1.6-1.7v-2L22 9.9l-2.5-4.3-2.1.6-2-.9-.6-2.3Z'}
      />
      <circle
        cx={'12'}
        cy={'12.5'}
        r={'3'}
      />
    </>
  ),
  info: (
    <>
      <circle
        cx={'12'}
        cy={'12'}
        r={'9'}
      />
      <path
        d={'M12 11v6m0-10h.01'}
      />
    </>
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
  menu: (
    <path
      d={'M4 6h16M4 12h16M4 18h16'}
    />
  ),
  arrow: (
    <path
      d={'M4 12h16m-6-6 6 6-6 6'}
    />
  ),
  wallet: (
    <path
      d={'M20 8V4H4a2 2 0 0 0 0 4h16v12H4a2 2 0 0 1-2-2V6m18 6h-5v4h5'}
    />
  ),
  shield: (
    <path
      d={'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6'}
    />
  ),
  document: (
    <>
      <rect
        x={'5'}
        y={'3'}
        width={'14'}
        height={'18'}
        rx={'3'}
      />
      <path
        d={'M9 8h6M9 12h6M9 16h3'}
      />
    </>
  ),
};

export type ServiceIconName = keyof typeof ICON_PATHS;

type IconDirection = 'right' | 'down' | 'left' | 'up';

const CHEVRON_ROTATIONS: Record<IconDirection, number> = {
  right: 0,
  down: 90,
  left: 180,
  up: 270,
};

/** 공통 SVG 모양을 한 곳에서 관리하고 색상·크기는 호출 화면의 스타일을 따릅니다. */
export function ServiceIcon({
  name,
  direction = 'right',
  size,
  strokeWidth = 1.8,
  className,
  style,
}: {
  name: ServiceIconName;
  direction?: IconDirection;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={'0 0 24 24'}
      fill={'none'}
      stroke={'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap={'round'}
      strokeLinejoin={'round'}
      aria-hidden={'true'}
      focusable={'false'}
      className={className}
      style={style}
    >
      {name === 'chevron' ? (
        // SVG 내부에서 방향을 바꿔 화면의 펼침·접힘 CSS 회전과 충돌하지 않게 합니다.
        <g
          transform={`rotate(${CHEVRON_ROTATIONS[direction]} 12 12)`}
        >
          {ICON_PATHS.chevron}
        </g>
      ) : ICON_PATHS[name]}
    </svg>
  );
}
