type StartIconName = 'bell' | 'person' | 'chevron' | 'clock' | 'close';

const ICON_PATHS = {
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

export function StartIcon({
  name,
}: {
  name: StartIconName;
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
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
