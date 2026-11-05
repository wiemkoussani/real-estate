/** Phone and tablet share the same UI. Wide PC / laptop keep the desktop sidebar.

- ≤ 1366px wide → phone/tablet UI (covers iPads + a window resized to tablet size)
- larger + finger as primary pointer up to 1400px → still phone/tablet (big tablets)

A full-size laptop (~1440–1920) stays on the PC layout.
*/
export const PHONE_LAYOUT_MQ =
  "(max-width: 1366px), (max-width: 1400px) and (pointer: coarse)";

export function isPhoneLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(PHONE_LAYOUT_MQ).matches;
}
