/** Phone UI for a handset, and for a tablet (touch, no hover).

A laptop keeps the PC sidebar. A trackpad still counts as hover, so a
1920×1080 Dell stays on the PC layout. A tablet matches the phone. */
export const PHONE_LAYOUT_MQ =
  "(max-width: 540px), (max-width: 1400px) and (pointer: coarse) and (hover: none)";

export function isPhoneLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(PHONE_LAYOUT_MQ).matches;
}
