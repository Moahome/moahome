export function NeighborhoodIllustration() {
  return (
    <svg viewBox="0 0 680 330" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="login-hill"
          x1="340"
          y1="120"
          x2="340"
          y2="330"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--primary)" stopOpacity="0.07" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="login-building"
          x1="285"
          y1="70"
          x2="426"
          y2="320"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--card)" />
          <stop offset="1" stopColor="var(--background)" />
        </linearGradient>
        <linearGradient
          id="login-side"
          x1="262"
          y1="170"
          x2="291"
          y2="170"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--sub-text)" stopOpacity="0.24" />
          <stop offset="1" stopColor="var(--sub-text)" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="login-window" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--primary)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--sub-text)" stopOpacity="0.17" />
        </linearGradient>
        <linearGradient id="login-tree" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="color-mix(in srgb, var(--secondary-teal) 38%, var(--card))" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--secondary-teal) 68%, var(--card))" />
        </linearGradient>
        <linearGradient
          id="login-roof"
          x1="222"
          y1="145"
          x2="300"
          y2="145"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--secondary-teal)" stopOpacity="0.42" />
          <stop offset="1" stopColor="var(--secondary-teal)" stopOpacity="0.74" />
        </linearGradient>
        <g id="login-cloud" fill="var(--card)">
          <path d="M0 29a17 17 0 0 1 18-17 23 23 0 0 1 45-1 14 14 0 0 1 24 18Z" />
        </g>
        <g id="login-small-tree">
          <path d="M4 75 17 28c5-17 21-17 26 0l14 47c8 31-61 31-53 0Z" fill="url(#login-tree)" />
          <path
            d="M30 70v50m0-33L20 76m10 22 11-13"
            stroke="var(--sub-text)"
            strokeOpacity="0.65"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g id="login-bush" fill="url(#login-tree)">
          <path d="M0 28a17 17 0 0 1 23-16 23 23 0 0 1 43 2 16 16 0 0 1 22 14v6H0Z" />
        </g>
      </defs>

      <path d="M0 228c55-33 74-65 125-37l80 43c86 47 144-34 209-21 46 9 63 42 113 28 45-13 80-76 123-55l30 17v127H0Z" fill="url(#login-hill)" />
      <use href="#login-cloud" x="21" y="68" opacity="0.9" />
      <use
        href="#login-cloud"
        x="560"
        y="96"
        transform="translate(115 19) scale(.8)"
        opacity="0.85"
      />

      <g fill="var(--primary)" opacity="0.07">
        <rect x="65" y="253" width="46" height="62" rx="5" />
        <rect x="119" y="192" width="54" height="123" rx="6" />
        <rect x="172" y="151" width="64" height="164" rx="8" />
        <rect x="207" y="110" width="55" height="205" rx="6" />
        <rect x="441" y="148" width="58" height="167" rx="6" />
        <rect x="512" y="208" width="57" height="107" rx="6" />
        <rect x="577" y="263" width="53" height="52" rx="5" />
      </g>
      <g fill="var(--card)" opacity="0.7">
        {[0, 1, 2].map((row) => (
          <g key={row}>
            <rect x="130" y={208 + row * 29} width="9" height="11" rx="1" />
            <rect x="152" y={208 + row * 29} width="9" height="11" rx="1" />
            <rect x="187" y={171 + row * 29} width="11" height="11" rx="1" />
            <rect x="212" y={171 + row * 29} width="11" height="11" rx="1" />
            <rect x="455" y={167 + row * 33} width="10" height="12" rx="1" />
            <rect x="478" y={167 + row * 33} width="10" height="12" rx="1" />
            <rect x="525" y={224 + row * 26} width="10" height="10" rx="1" />
            <rect x="547" y={224 + row * 26} width="10" height="10" rx="1" />
          </g>
        ))}
      </g>

      <ellipse cx="344" cy="314" rx="266" ry="10" fill="var(--primary)" opacity="0.04" />
      <rect x="317" y="69" width="67" height="41" rx="5" fill="var(--primary)" opacity="0.12" />
      <path d="M317 76h67" stroke="var(--sub-text)" strokeOpacity="0.13" strokeWidth="8" />
      <path d="m292 111-23 9a12 12 0 0 0-7 11v182h30Z" fill="url(#login-side)" />
      <rect x="291" y="99" width="119" height="214" rx="9" fill="url(#login-building)" />
      <path d="m215 173 19-20h57v160h-76Z" fill="url(#login-side)" />
      <path d="M232 157h59v156h-70V174Z" fill="var(--card)" opacity="0.9" />
      <path d="m215 175 22-42h50v15h-42l-18 33a7 7 0 0 1-12-6Z" fill="url(#login-roof)" />

      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          {[0, 1].map((column) => (
            <g key={column}>
              <rect
                x={312 + column * 46}
                y={123 + row * 39}
                width="24"
                height="25"
                rx="2"
                fill="url(#login-window)"
              />
              <path d={`M${324 + column * 46} ${124 + row * 39}v23`} stroke="var(--card)" strokeOpacity="0.55" strokeWidth="2" />
              <path d={`m${315 + column * 46} ${124 + row * 39} 19 18v-8l-11-10Z`} fill="var(--card)" opacity="0.18" />
            </g>
          ))}
          <rect
            x="249"
            y={169 + row * 33}
            width="23"
            height="24"
            rx="2"
            fill="url(#login-window)"
          />
          <path d={`M260 ${170 + row * 33}v22`} stroke="var(--card)" strokeOpacity="0.5" strokeWidth="2" />
        </g>
      ))}
      <rect x="330" y="282" width="39" height="31" rx="2" fill="url(#login-window)" />
      <path d="M349 283v30" stroke="var(--card)" strokeOpacity="0.6" strokeWidth="2" />
      <rect x="326" y="278" width="47" height="7" rx="2" fill="var(--primary)" opacity="0.38" />

      <use href="#login-small-tree" x="91" y="198" />
      <use href="#login-small-tree" x="186" y="185" transform="translate(21 -8) scale(1.05)" />
      <g>
        <path d="M444 265c-32-7-30-55-8-67-4-37 57-52 65-13 32 7 40 59 12 76-17 15-53 20-69 4Z" fill="url(#login-tree)" />
        <path
          d="M472 246v66m0-39-17-18m17 30 18-22"
          stroke="var(--sub-text)"
          strokeOpacity="0.65"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <use href="#login-bush" x="151" y="281" />
      <use href="#login-bush" x="236" y="285" transform="translate(33 38) scale(.88)" />
      <use href="#login-bush" x="417" y="283" transform="translate(173 126) scale(.6)" />
      <use href="#login-bush" x="566" y="282" transform="translate(113 49) scale(.84)" />
      <g>
        <path d="M493 295h70v8h-70Z" fill="var(--secondary-teal)" opacity="0.45" />
        <path
          d="M500 303v10m54-10v10"
          stroke="var(--sub-text)"
          strokeOpacity="0.6"
          strokeWidth="4"
        />
        <path d="M554 283c-13-6-13-23 1-29-2-24 31-22 30-3 23 11 5 43-16 34Z" fill="url(#login-tree)" />
        <path
          d="M567 277v36m0-22-8-8m8 14 9-9"
          stroke="var(--sub-text)"
          strokeOpacity="0.65"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M88 314h527"
        stroke="var(--secondary-teal)"
        strokeOpacity="0.13"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
