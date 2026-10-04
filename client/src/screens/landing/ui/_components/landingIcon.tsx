import type { CSSProperties } from "react";

const ICON_PATHS = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7.87a4 4 0 0 1 0 7.75",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2Zm3 4h6m-6 4h6m-6 4h3",
  chart: "M4 20V13h3v7m4 0V8h3v12m4 0V3h3v17",
  bolt: "m13 2-9 12h7l-1 8 10-12h-7Z",
  check: "m5 12 4 4L19 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m6 9 6 6 6-6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4",
  wallet: "M20 8V4H4a2 2 0 0 0 0 4h16v12H4a2 2 0 0 1-2-2V6m18 6h-5v4h5",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
  building: "M4 21V3h12v18m0-13h4v13M2 21h20M8 7h4m-4 4h4m-4 4h4m-3 6v-3h2v3",
  clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  notice: "m3 10 14-5v14L3 14Zm2 5 2 6h3l-2-5m12-7 2-1m-2 8 2 1",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
} as const;

export type LandingIconName = keyof typeof ICON_PATHS;

export function LandingIcon({
  name,
  className,
  style,
}: {
  name: LandingIconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d={ICON_PATHS[name]}
      />
    </svg>
  );
}
