import styles from './welcomePuppy.module.css';

export function WelcomePuppy() {
  return (
    <span
      className={styles.puppy}
      aria-hidden={'true'}
    >
      <svg
        viewBox={'0 0 112 112'}
        fill={'none'}
      >
        <ellipse
          cx={'56'}
          cy={'104'}
          rx={'32'}
          ry={'4'}
          fill={'var(--primary)'}
          fillOpacity={'0.08'}
        />
        <g
          className={styles.tail}
        >
          <path
            d={'M77 78c17 0 27-10 24-22-1-5-7-6-10-2-4 5-1 13-14 14Z'}
            fill={'var(--puppy-light-brown)'}
            stroke={'var(--puppy-outline)'}
            strokeWidth={'2'}
            strokeLinejoin={'round'}
          />
        </g>
        <path
          d={'M38 65c-5 8-7 18-5 28 1 7 10 9 22 9 13 0 23-2 24-10 1-11-3-20-9-27Z'}
          fill={'var(--puppy-cream)'}
          stroke={'var(--puppy-outline)'}
          strokeWidth={'2'}
        />
        <path
          d={'M47 81v14m19-14v14'}
          stroke={'var(--puppy-outline)'}
          strokeWidth={'2'}
          strokeLinecap={'round'}
        />
        <ellipse
          cx={'43'}
          cy={'99'}
          rx={'10'}
          ry={'6'}
          fill={'var(--puppy-cream)'}
          stroke={'var(--puppy-outline)'}
          strokeWidth={'2'}
        />
        <ellipse
          cx={'69'}
          cy={'99'}
          rx={'10'}
          ry={'6'}
          fill={'var(--puppy-cream)'}
          stroke={'var(--puppy-outline)'}
          strokeWidth={'2'}
        />
        <path
          d={'M39 70c10 5 23 5 33 0'}
          stroke={'var(--primary)'}
          strokeWidth={'6'}
          strokeLinecap={'round'}
        />
        <circle
          cx={'56'}
          cy={'78'}
          r={'5'}
          fill={'var(--secondary-teal)'}
        />
        <g
          className={styles.head}
        >
          <path
            d={'M32 32c3-14 16-19 25-19 12 0 25 6 27 20l2 18c1 17-13 25-29 25S27 67 29 50Z'}
            fill={'var(--puppy-cream)'}
            stroke={'var(--puppy-outline)'}
            strokeWidth={'2'}
          />
          <path
            d={'M37 23c-9-6-19 1-19 13 0 9 1 20 7 24 5 3 10-1 12-10l5-17c1-5-1-8-5-10ZM77 23c9-6 19 1 19 13 0 9-1 20-7 24-5 3-10-1-12-10l-5-17c-1-5 1-8 5-10Z'}
            fill={'var(--puppy-light-brown)'}
            stroke={'var(--puppy-outline)'}
            strokeWidth={'2'}
          />
          <ellipse
            cx={'44'}
            cy={'46'}
            rx={'4'}
            ry={'5'}
            fill={'var(--foreground)'}
          />
          <ellipse
            cx={'70'}
            cy={'46'}
            rx={'4'}
            ry={'5'}
            fill={'var(--foreground)'}
          />
          <circle
            cx={'45'}
            cy={'44'}
            r={'1.3'}
            fill={'var(--card)'}
          />
          <circle
            cx={'71'}
            cy={'44'}
            r={'1.3'}
            fill={'var(--card)'}
          />
          <ellipse
            cx={'57'}
            cy={'59'}
            rx={'15'}
            ry={'10'}
            fill={'color-mix(in srgb, var(--puppy-cream) 50%, var(--card))'}
          />
          <path
            d={'M51 54c0-4 12-4 12 0 0 3-4 6-6 6s-6-3-6-6Z'}
            fill={'var(--foreground)'}
          />
          <path
            d={'M57 59v3m-7 0c1 5 6 5 7 0 1 5 6 5 7 0'}
            stroke={'var(--foreground)'}
            strokeWidth={'2'}
            strokeLinecap={'round'}
            strokeLinejoin={'round'}
          />
        </g>
      </svg>
    </span>
  );
}
