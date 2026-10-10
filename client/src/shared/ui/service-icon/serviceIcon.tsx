type ServiceIconName = 'bell' | 'person' | 'chevron' | 'clock' | 'close' | 'plus' | 'search' | 'reset' | 'pen' | 'trash' | 'home' | 'check';

const ICON_PATHS = {
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
};

export function ServiceIcon({
  name,
}: {
  name: ServiceIconName;
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
