"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { visite360Base, visite360ImageBase, visite360TourUrl } from "@/lib/complex";
import { Visite360Engine, type TourData } from "@/viewer/Visite360Engine";

type Props = {
  className?: string;
  /** Camera id to open on (defaults to tour.json `startCamera`). */
  startId?: string;
};

/**
 * Visite 360 — walk-through tour that behaves like the NHC / Virtual Visions viewer:
 * drag to look, wheel/pinch to zoom, click the floor to glide to the nearest ring,
 * rooms rail + floors to jump.
 */
export default function Visite360Viewer({ className, startId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Visite360Engine | null>(null);

  const [tour, setTour] = useState<TourData | null>(null);
  const [currentId, setCurrentId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------- engine
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let disposed = false;
    let engine: Visite360Engine | null = null;
    setLoaded(false);
    setError(null);

    (async () => {
      try {
        const res = await fetch(visite360TourUrl());
        if (!res.ok) throw new Error(`tour.json ${res.status}`);
        const data = (await res.json()) as TourData;
        if (disposed) return;
        if (startId && data.cameras.some((c) => c.n === startId)) data.startCamera = startId;
        setTour(data);
        setCurrentId(data.startCamera ?? data.cameras[0]?.n ?? "");

        engine = new Visite360Engine({
          canvas,
          overlay: host,
          baseUrl: visite360Base(),
          imageBaseUrl: visite360ImageBase(),
          tour: data,
          debugPick: new URLSearchParams(window.location.search).has("pick"),
          onCameraChange: (id) => !disposed && setCurrentId(id),
          onArrive: (id) => !disposed && setCurrentId(id),
          onFirstFrame: () => !disposed && setLoaded(true),
          onError: (m) => !disposed && setError(m),
        });
        engineRef.current = engine;
        // ?pick → log clicked points (for placing hotspots) and expose the engine in the console
        if (new URLSearchParams(window.location.search).has("pick")) {
          (window as unknown as { __v360: Visite360Engine }).__v360 = engine;
        }
        await engine.start();
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "Failed to load Visite 360");
      }
    })();

    return () => {
      disposed = true;
      engineRef.current = null;
      engine?.dispose();
    };
  }, [startId]);

  // ------------------------------------------------------------ derived UI
  const camById = useMemo(() => new Map((tour?.cameras ?? []).map((c) => [c.n, c])), [tour]);
  const current = camById.get(currentId);
  const floors = useMemo(() => tour?.floors ?? [], [tour]);
  const activeFloor = floors.find((f) => f.id === current?.floor) ?? floors[0];
  const rooms = (activeFloor?.rooms ?? []).map((id) => ({ id, label: camById.get(id)?.lb ?? id }));

  const goTo = useCallback((id: string) => engineRef.current?.teleportTo(id), []);

  // keep the active room centred in the rail
  useEffect(() => {
    barRef.current
      ?.querySelector<HTMLElement>(`[data-node="${currentId}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentId]);

  // click-hold drag to scroll the rooms rail
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let active = false;
    let dragged = false;
    let startX = 0;
    let startScroll = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      active = true;
      dragged = false;
      startX = e.clientX;
      startScroll = bar.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) dragged = true;
      if (dragged) bar.scrollLeft = startScroll - dx;
    };
    const up = () => {
      active = false;
      if (dragged) {
        const block = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        bar.addEventListener("click", block, { capture: true, once: true });
        setTimeout(() => bar.removeEventListener("click", block, { capture: true }), 0);
      }
    };
    bar.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      bar.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [rooms.length]);

  return (
    <div className={`visite360${className ? ` ${className}` : ""}`} ref={hostRef}>
      <canvas ref={canvasRef} className="visite360-canvas" />

      <div className={`visite360-loading${loaded || error ? " is-done" : ""}`} aria-hidden={loaded}>
        <span className="visite360-spinner" />
        <span>Loading Visite 360…</span>
      </div>
      {error ? <div className="visite360-error">{error}</div> : null}

      {loaded && current ? (
        <div className="visite360-caption" aria-live="polite">
          {floors.length > 1 && activeFloor ? <span>{activeFloor.label}</span> : null}
          {current.lb ? <strong>{current.lb}</strong> : null}
        </div>
      ) : null}

      {loaded && floors.length > 1 ? (
        <div className="visite360-floors" role="tablist" aria-label="Floors">
          {/* top floor first, like elevator buttons: Roof / First / Ground */}
          {[...floors].reverse().map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === activeFloor?.id}
              className={f.id === activeFloor?.id ? "on" : ""}
              onClick={() => f.rooms[0] && goTo(f.rooms[0])}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {loaded && rooms.length ? (
        <div className="visite360-rooms" ref={barRef} role="tablist" aria-label="Rooms">
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              data-node={r.id}
              aria-selected={r.id === currentId}
              className={r.id === currentId ? "on" : ""}
              onClick={() => goTo(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
