type Props = { size?: number; className?: string };

function Svg({ children, size = 18, className }: Props & { children: React.ReactNode }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const IconList = (p: Props) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>
);
export const IconMail = (p: Props) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 7 9-7" /></Svg>
);
export const IconHelp = (p: Props) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 5" /><path d="M12 17h.01" /></Svg>
);
export const IconPin = (p: Props) => (
  <Svg {...p}><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.2" /></Svg>
);
export const IconGallery = (p: Props) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 16-5-5-4 4-2-2-5 5" /></Svg>
);
export const IconHeart = (p: Props & { filled?: boolean }) => (
  <svg className={p.className} width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill={p.filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);
export const IconFilters = (p: Props) => (
  <Svg {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" /></Svg>
);
export const IconCards = (p: Props) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>
);
export const IconApps = (p: Props) => (
  <svg className={p.className} width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path fillRule="evenodd" d="M2.4 21V8.1c0-.7.6-1.3 1.3-1.3h7c.7 0 1.3.6 1.3 1.3V21H2.4Zm2.5-10.2h1.5v1.6H4.9Zm2.7 0h1.5v1.6H7.6Zm-2.7 2.8h1.5v1.6H4.9Zm2.7 0h1.5v1.6H7.6Zm-2.7 2.8h1.5v1.6H4.9Zm2.7 0h1.5v1.6H7.6ZM12.8 21V4.2c0-.7.6-1.3 1.3-1.3h6.6c.7 0 1.3.6 1.3 1.3V21h-9.2Zm2.4-14.3h1.5v1.6h-1.5Zm2.7 0h1.5v1.6h-1.5Zm-2.7 2.8h1.5v1.6h-1.5Zm2.7 0h1.5v1.6h-1.5Zm-2.7 2.8h1.5v1.6h-1.5Zm2.7 0h1.5v1.6h-1.5Zm-2.7 2.8h1.5v1.6h-1.5Zm2.7 0h1.5v1.6h-1.5Z" />
  </svg>
);
export const IconZoomIn = (p: Props) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></Svg>
);
export const IconZoomOut = (p: Props) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" /></Svg>
);
export const IconPlus = (p: Props) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconMinus = (p: Props) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);
export const IconFullscreen = (p: Props) => (
  <Svg {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </Svg>
);
export const IconRotateL = (p: Props) => (
  <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Svg>
);
export const IconRotateR = (p: Props) => (
  <Svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></Svg>
);
export const IconTriL = (p: Props) => (
  <svg className={p.className} width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" aria-hidden>
    <path d="M16 4v16L6 12l10-8z" fill="currentColor" />
  </svg>
);
export const IconTriR = (p: Props) => (
  <svg className={p.className} width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" aria-hidden>
    <path d="M8 4v16l10-8-10-8z" fill="currentColor" />
  </svg>
);
export const IconPan = (p: Props) => (
  <Svg {...p}><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 11V6a2 2 0 0 0-4 0v8a8 8 0 0 0 8 8h1a6 6 0 0 0 6-6v-5a2 2 0 0 0-4 0" /></Svg>
);
export const IconEye = (p: Props) => (
  <Svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const IconEyeOff = (p: Props) => (
  <Svg {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M4 20 20 4" />
  </Svg>
);
export const IconSend = (p: Props) => (
  <Svg {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></Svg>
);
export const IconTrash = (p: Props) => (
  <Svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Svg>
);
export const IconFolder = (p: Props) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
);
export const IconChevron = (p: Props) => (
  <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
);
