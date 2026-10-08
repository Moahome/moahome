const ICON_PATHS = {
  receipt: (
    <>
      <path
        d={'M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h6'}
      />
    </>
  ),
  plus: (
    <path
      d={'M12 5v14M5 12h14'}
    />
  ),
  check: (
    <path
      d={'m5 12 4 4L19 6'}
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

export function RegistrationIcon({
  name,
}: {
  name: keyof typeof ICON_PATHS;
}) {
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
