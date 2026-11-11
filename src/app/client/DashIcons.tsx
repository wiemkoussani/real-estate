/* Line icons for the client dashboard (lucide shapes, stroke = currentColor). */
type P = { size?: number; stroke?: number };

const base = (size: number, stroke: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: stroke,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IcGrid = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);
export const IcChart = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M12 20V10M18 20V4M6 20v-4" />
  </svg>
);
export const IcUsers = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
export const IcHelp = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </svg>
);
export const IcBell = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
export const IcChevronDown = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IcSearch = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
export const IcPin = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
export const IcCalendar = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </svg>
);
export const IcBuilding = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4" />
  </svg>
);
export const IcEye = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IcClock = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6h4.5" />
  </svg>
);
export const IcHandshake = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="m11 17 2 2a1 1 0 1 0 3-3" />
    <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
    <path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8" />
  </svg>
);
export const IcLogout = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const IcCamera = ({ size = 24, stroke = 2 }: P) => (
  <svg {...base(size, stroke)}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

/** Big AXIS "X" watermark: four double chevrons pointing at the centre, like the logo. */
export function AxisWatermark({ className }: { className?: string }) {
  const chevron = (o: number) => `M${-72} ${-o - 72} L0 ${-o} L72 ${-o - 72}`;
  const quarter = (
    <>
      <path d={chevron(10)} />
      <path d={chevron(30)} />
    </>
  );
  return (
    <svg className={className} viewBox="-110 -110 220 220" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <g>{quarter}</g>
      <g transform="rotate(90)">{quarter}</g>
      <g transform="rotate(180)">{quarter}</g>
      <g transform="rotate(270)">{quarter}</g>
    </svg>
  );
}
