/**
 * Smooth scrolling for a list on desktop, matching the 360 thumbnail strip:
 * - click-hold drag scrolls 1:1 with the pointer, then a short glide on release
 * - mouse wheel eases toward its target instead of jumping in steps
 * A click that ends a drag is swallowed so it doesn't open a card.
 * Returns a cleanup function.
 */
export function attachGlideScroll(node: HTMLElement, axis: "x" | "y" = "y"): () => void {
  const horiz = axis === "x";
  const getPos = () => (horiz ? node.scrollLeft : node.scrollTop);
  const setPos = (v: number) => {
    if (horiz) node.scrollLeft = v;
    else node.scrollTop = v;
  };
  const getMax = () =>
    Math.max(0, horiz ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight);
  const clamp = (v: number) => Math.max(0, Math.min(getMax(), v));
  const coord = (e: PointerEvent) => (horiz ? e.clientX : e.clientY);

  let raf = 0;
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  // --- release glide (same physics as the 360 strip) ---
  const coast = (v0: number) => {
    stop();
    let v = Math.max(-3, Math.min(3, v0)); // px per ms
    if (Math.abs(v) < 0.15) return;
    let last = performance.now();
    let pos = getPos(); // float: scrollTop rounds small steps away
    const step = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const max = getMax();
      pos = Math.max(0, Math.min(max, pos - v * dt));
      setPos(pos);
      v *= Math.pow(0.9, dt / 16.67); // friction
      if (Math.abs(v) < 0.02 || pos <= 0 || pos >= max) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  // --- eased wheel ---
  let wheelTarget = 0;
  let wheelPos = 0;
  let wheeling = false;
  const wheelStep = () => {
    const diff = wheelTarget - wheelPos;
    if (Math.abs(diff) < 0.5) {
      wheelPos = wheelTarget;
      setPos(wheelPos);
      wheeling = false;
      raf = 0;
      return;
    }
    wheelPos += diff * 0.18;
    setPos(wheelPos);
    raf = requestAnimationFrame(wheelStep);
  };
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return; // pinch-zoom
    let d = horiz ? e.deltaX || e.deltaY : e.deltaY;
    if (!d) return;
    if (e.deltaMode === 1) d *= 40; // lines
    else if (e.deltaMode === 2) d *= horiz ? node.clientWidth : node.clientHeight; // pages
    const max = getMax();
    if (max <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!wheeling) {
      stop();
      wheelPos = getPos();
      wheelTarget = wheelPos;
      wheeling = true;
    }
    wheelTarget = Math.max(0, Math.min(max, wheelTarget + d));
    if (!raf) raf = requestAnimationFrame(wheelStep);
  };

  // --- drag ---
  const samples: { t: number; p: number }[] = [];
  let tracking = false;
  let dragging = false;
  let start = 0;
  let startScroll = 0;
  let activePointer: number | null = null;

  const blockClick = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return; // touch keeps native scrolling
    stop();
    wheeling = false;
    samples.length = 0;
    samples.push({ t: performance.now(), p: coord(e) });
    tracking = true;
    dragging = false;
    activePointer = e.pointerId;
    start = coord(e);
    startScroll = getPos();
  };
  const onMove = (e: PointerEvent) => {
    if (!tracking || e.pointerId !== activePointer) return;
    const d = coord(e) - start;
    if (!dragging) {
      if (Math.abs(d) < 4) return;
      dragging = true;
      node.setPointerCapture(e.pointerId);
      node.classList.add("is-dragging");
    }
    e.preventDefault();
    setPos(clamp(startScroll - d));
    const now = performance.now();
    samples.push({ t: now, p: coord(e) });
    while (samples.length > 2 && now - samples[0].t > 100) samples.shift();
  };
  const onUp = (e: PointerEvent) => {
    if (activePointer !== null && e.pointerId !== activePointer) return;
    tracking = false;
    activePointer = null;
    if (!dragging) return;
    dragging = false;
    node.classList.remove("is-dragging");
    node.addEventListener("click", blockClick, { capture: true, once: true });
    window.setTimeout(() => node.removeEventListener("click", blockClick, { capture: true }), 0);
    const now = performance.now();
    const first = samples[0];
    const lastS = samples[samples.length - 1];
    const held = !lastS || now - lastS.t > 80;
    const span = first && lastS ? lastS.t - first.t : 0;
    coast(held || span <= 0 ? 0 : (lastS.p - first.p) / span);
  };
  const onDragStart = (e: DragEvent) => e.preventDefault(); // images/links shouldn't ghost-drag

  node.addEventListener("wheel", onWheel, { passive: false });
  node.addEventListener("pointerdown", onDown);
  node.addEventListener("pointermove", onMove, { passive: false });
  node.addEventListener("pointerup", onUp);
  node.addEventListener("pointercancel", onUp);
  node.addEventListener("dragstart", onDragStart);

  return () => {
    stop();
    node.removeEventListener("wheel", onWheel);
    node.removeEventListener("pointerdown", onDown);
    node.removeEventListener("pointermove", onMove);
    node.removeEventListener("pointerup", onUp);
    node.removeEventListener("pointercancel", onUp);
    node.removeEventListener("dragstart", onDragStart);
    node.removeEventListener("click", blockClick, { capture: true });
  };
}
