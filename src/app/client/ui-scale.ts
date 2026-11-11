/**
 * The client dashboard is laid out on the 1920 × 1080 Figma frame and shrunk with CSS `zoom` to fit the window.
 * Mouse / getBoundingClientRect values are in screen pixels; positions set inside the zoomed page are in design
 * pixels, so they must be divided by the current scale.
 */
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

let current = 1;
export function setUiScale(s: number) {
  current = s > 0 ? s : 1;
}
/** current zoom of the dashboard (1 = no zoom) */
export const uiScale = () => current;
/** screen pixels → dashboard (design) pixels */
export const toUi = (px: number) => px / current;
