const ICON_PATHS = {
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
