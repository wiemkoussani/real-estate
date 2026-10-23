/** Phone UI only under a real handset width.

A 1920×1080 laptop stays wider than this at any normal Windows scale, so it keeps
the PC sidebar and the measured filter. Do not raise this number. */
export const PHONE_LAYOUT_MQ = "(max-width: 540px)";

export function isPhoneLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(PHONE_LAYOUT_MQ).matches;
}
