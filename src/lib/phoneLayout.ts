/** Phone UI only. A mouse or trackpad computer always keeps the PC layout.

Windows scaling shrinks CSS pixels (a 1920×1080 Dell at 200% is 960px wide) but the
screen is still a laptop. The old max-width breakpoint treated that as a phone. */
export function isPhoneLayout(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;

  const dpr = window.devicePixelRatio || 1;
  const w = window.screen.width;
  const h = window.screen.height;
  const physicalLong = Math.max(w, h) * dpr;
  const cssShort = Math.min(w, h);
  // Touch laptop / desktop: the panel is FHD or larger. A handset's short side stays under 520 CSS px.
  if (physicalLong >= 1800 && cssShort >= 520) return false;
  return true;
}
