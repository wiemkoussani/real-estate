/** Phone and tablet share the same UI. Desktop / laptop keep the PC sidebar.

Rules:
- Handset: max-width 540px
- Tablet (finger as primary pointer), up to ~iPad Pro landscape: pointer coarse ≤ 1400px

A laptop trackpad reports pointer:fine + hover, so a 1920 Dell stays on PC layout
even if the window is narrowed a bit. Touchscreen laptops with a mouse/trackpad as
primary pointer also stay on PC.
*/
export const PHONE_LAYOUT_MQ =
  "(max-width: 540px), (max-width: 1400px) and (pointer: coarse)";

export function isPhoneLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(PHONE_LAYOUT_MQ).matches;
}
