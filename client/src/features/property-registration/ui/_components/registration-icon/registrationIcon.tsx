import { ServiceIcon } from '@/shared/ui/service-icon';

const ICON_PATHS = {
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
  person: (
    <>
      <circle
        cx={'12'}
        cy={'7'}
        r={'4'}
      />
      <path
        d={'M4 21v-2a8 8 0 0 1 16 0v2'}
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
  up: (
    <path
      d={'m5 15 7-7 7 7'}
    />
  ),
  down: (
    <path
      d={'m5 9 7 7 7-7'}
    />
  ),
  units: (
    <path
      d={'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21v-3a6 6 0 0 1 12 0v3m1-7a5 5 0 0 1 7 4v3'}
    />
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
  plus: (
    <path
      d={'M12 5v14M5 12h14'}
    />
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
  close: (
    <path
      d={'m6 6 12 12M18 6 6 18'}
    />
  ),
  back: (
    <path
      d={'m15 5-7 7 7 7'}
    />
  ),
  next: (
    <path
      d={'m9 5 7 7-7 7'}
    />
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
};

export type RegistrationIconName = keyof typeof ICON_PATHS | 'check';

export function RegistrationIcon({
  name,
}: {
  name: RegistrationIconName;
}) {
  if (name === 'check') {
    return (
      <ServiceIcon
        name={'check'}
      />
    );
  }

  return (
    <svg
      viewBox={'0 0 24 24'}
      fill={'none'}
      stroke={'currentColor'}
      strokeWidth={'1.8'}
      strokeLinecap={'round'}
      strokeLinejoin={'round'}
      aria-hidden={'true'}
      focusable={'false'}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
