export function HomeIllustration({
  kind,
  showAction = true,
}: {
  kind: 'create' | 'join';
  showAction?: boolean;
}) {
  return (
    <svg
      viewBox={'0 0 240 180'}
      fill={'none'}
      aria-hidden={'true'}
    >
      <circle
        cx={'120'}
        cy={'88'}
        r={'82'}
        fill={'var(--primary)'}
        fillOpacity={'0.055'}
      />
      <path
        d={'M12 53a11 11 0 0 1 12-10 17 17 0 0 1 32 0 10 10 0 0 1 10 10ZM183 57a12 12 0 0 1 13-11 15 15 0 0 1 29 4 8 8 0 0 1 9 7Z'}
        fill={'var(--primary)'}
        fillOpacity={'0.065'}
      />
      {kind === 'create' && (
        <>
          <rect
            x={'63'}
            y={'66'}
            width={'57'}
            height={'92'}
            rx={'5'}
            fill={'var(--card)'}
          />
          <path
            d={'m60 64 10-13h51v16H61Z'}
            fill={'var(--primary)'}
            fillOpacity={'0.6'}
          />
          <rect
            x={'109'}
            y={'41'}
            width={'53'}
            height={'117'}
            rx={'5'}
            fill={'var(--border)'}
          />
          <rect
            x={'106'}
            y={'30'}
            width={'49'}
            height={'12'}
            rx={'3'}
            fill={'var(--primary)'}
            fillOpacity={'0.65'}
          />
          <rect
            x={'104'}
            y={'42'}
            width={'50'}
            height={'116'}
            rx={'5'}
            fill={'var(--card)'}
          />
          {[0, 1, 2].map((row) => (
            <g
              key={row}
              fill={'var(--primary)'}
              fillOpacity={'0.28'}
            >
              <rect
                x={'75'}
                y={79 + row * 24}
                width={'9'}
                height={'13'}
                rx={'2'}
              />
              <rect
                x={'92'}
                y={79 + row * 24}
                width={'9'}
                height={'13'}
                rx={'2'}
              />
              <rect
                x={'115'}
                y={57 + row * 25}
                width={'9'}
                height={'15'}
                rx={'2'}
              />
              <rect
                x={'133'}
                y={57 + row * 25}
                width={'9'}
                height={'15'}
                rx={'2'}
              />
            </g>
          ))}
          <rect
            x={'121'}
            y={'135'}
            width={'16'}
            height={'23'}
            rx={'2'}
            fill={'var(--primary)'}
            fillOpacity={'0.2'}
          />
          <path
            d={'M37 140 47 105c4-15 16-15 20 0l10 35c5 19-45 19-40 0ZM162 109c-13-5-12-24 0-30-2-22 31-29 34-7 21 6 22 33 4 40Z'}
            fill={'var(--secondary-teal)'}
            fillOpacity={'0.55'}
          />
          <path
            d={'M57 131v27m0-15-7-9m128-36v32'}
            stroke={'var(--sub-text)'}
            strokeOpacity={'0.5'}
            strokeWidth={'3'}
            strokeLinecap={'round'}
          />
          <path
            d={'M63 158c0-14 17-18 22-8 3-17 25-12 25 8Z'}
            fill={'var(--secondary-teal)'}
            fillOpacity={'0.35'}
          />
        </>
      )}
      {kind === 'join' && (
        <>
          <path
            d={'m54 88 56-48a16 16 0 0 1 20 0l56 48v61a8 8 0 0 1-8 8H62a8 8 0 0 1-8-8Z'}
            fill={'var(--primary)'}
            fillOpacity={'0.8'}
          />
          <rect
            x={'71'}
            y={'46'}
            width={'100'}
            height={'89'}
            rx={'9'}
            fill={'var(--card)'}
          />
          <rect
            x={'85'}
            y={'61'}
            width={'44'}
            height={'6'}
            rx={'3'}
            fill={'var(--primary)'}
            fillOpacity={'0.12'}
          />
          <rect
            x={'85'}
            y={'78'}
            width={'72'}
            height={'29'}
            rx={'5'}
            fill={'var(--primary)'}
            fillOpacity={'0.1'}
          />
          {[99, 113, 127, 141].map((x) => (
            <circle
              key={x}
              cx={x}
              cy={'92'}
              r={'3'}
              fill={'var(--primary)'}
              fillOpacity={'0.75'}
            />
          ))}
          <path
            d={'m54 88 66 45 66-45v61a8 8 0 0 1-8 8H62a8 8 0 0 1-8-8Z'}
            fill={'color-mix(in srgb, var(--primary) 18%, var(--card))'}
          />
          <path
            d={'m56 153 53-38a19 19 0 0 1 22 0l53 38'}
            fill={'color-mix(in srgb, var(--primary) 11%, var(--card))'}
          />
        </>
      )}
      {showAction && (
        <circle
          cx={'183'}
          cy={'137'}
          r={'29'}
          fill={kind === 'create' ? 'var(--primary)' : 'var(--secondary-teal)'}
          stroke={'var(--card)'}
          strokeWidth={'3'}
        />
      )}
      {showAction && kind === 'create' && (
        <path
          d={'M183 125v24m-12-12h24'}
          stroke={'var(--card)'}
          strokeWidth={'4'}
          strokeLinecap={'round'}
        />
      )}
      {showAction && kind === 'join' && (
        <g
          fill={'var(--card)'}
        >
          <circle
            cx={'183'}
            cy={'130'}
            r={'5'}
          />
          <circle
            cx={'172'}
            cy={'132'}
            r={'3.5'}
            opacity={'0.7'}
          />
          <circle
            cx={'194'}
            cy={'132'}
            r={'3.5'}
            opacity={'0.7'}
          />
          <path
            d={'M175 147v-3a8 8 0 0 1 16 0v3ZM166 146v-3a6 6 0 0 1 7-6v9ZM193 146v-9a6 6 0 0 1 7 6v3Z'}
          />
        </g>
      )}
    </svg>
  );
}
