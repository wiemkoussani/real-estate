"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { visite360Base, visite360ImageBase, visite360TourUrl } from "@/lib/complex";
import { Visite360Engine, type AutoTourStep, type TourData } from "@/viewer/Visite360Engine";

type Props = {
  className?: string;
  /** Camera id to open on (defaults to tour.json `startCamera`). */
  startId?: string;
};

type AutoState = "idle" | "playing" | "paused";

/**
 * Visite 360 — walk-through tour that behaves like the NHC / Virtual Visions viewer:
 * drag to look, wheel/pinch to zoom, click the floor to glide to the nearest ring,
 * rooms rail + floors to jump, auto tour, measuring and screenshots.
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
  const [measuring, setMeasuring] = useState(false);
  const [measureCount, setMeasureCount] = useState(0);
  const [auto, setAuto] = useState<AutoState>("idle");
  const autoRef = useRef({ stop: false, paused: false, resume: null as null | (() => void) });

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
          onMeasurementsChange: (n) => !disposed && setMeasureCount(n),
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
      autoRef.current.stop = true;
      autoRef.current.resume?.();
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

  // ------------------------------------------------------------ auto tour
  const playAuto = useCallback(async () => {
    const engine = engineRef.current;
    const steps: AutoTourStep[] = tour?.autoTour?.steps ?? [];
    if (!engine || !steps.length) return;
    const ctl = autoRef.current;
    ctl.stop = false;
    ctl.paused = false;
    setAuto("playing");
    const gate = () =>
      ctl.paused && !ctl.stop
        ? new Promise<void>((r) => {
            ctl.resume = () => {
              ctl.resume = null;
              r();
            };
          })
        : Promise.resolve();
    do {
      for (const step of steps) {
        await gate();
        if (ctl.stop) break;
        if (step.type === "goto") await engine.teleportToAsync(step.camera);
        else if (step.type === "rotate") await engine.animateRotation(step.deltaYawDeg, step.durationMs);
        else await new Promise((r) => setTimeout(r, step.durationMs));
      }
    } while (!ctl.stop && tour?.autoTour?.loop);
    setAuto("idle");
  }, [tour]);

  const pauseAuto = () => {
    autoRef.current.paused = true;
    engineRef.current?.cancelAutoAnimation();
    setAuto("paused");
  };
  const resumeAuto = () => {
    autoRef.current.paused = false;
    autoRef.current.resume?.();
    setAuto("playing");
  };
  const stopAuto = () => {
    autoRef.current.stop = true;
    autoRef.current.resume?.();
    engineRef.current?.cancelAutoAnimation();
    setAuto("idle");
  };

  // stop the auto tour as soon as the visitor grabs the view
  const onUserInput = () => {
    if (auto === "playing") pauseAuto();
  };

  // ---------------------------------------------------------------- tools
  const toggleMeasure = () => {
    const next = !measuring;
    setMeasuring(next);
    engineRef.current?.setMeasureMode(next);
  };
  const toggleFullscreen = () => {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.requestFullscreen?.();
  };

  return (
    <div className={`visite360${className ? ` ${className}` : ""}`} ref={hostRef}>
      <canvas ref={canvasRef} className="visite360-canvas" onPointerDown={onUserInput} />

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
          {floors.map((f) => (
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

      {loaded ? (
        <div className="visite360-tools">
          {tour?.autoTour?.steps.length ? (
            <ToolButton
              title={auto === "idle" ? "Start auto tour" : "Stop auto tour"}
              on={auto !== "idle"}
              onClick={auto === "idle" ? playAuto : stopAuto}
            >
              {auto === "idle" ? <IconPlay /> : <IconStop />}
            </ToolButton>
          ) : null}
          <ToolButton title={measuring ? "Stop measuring" : "Measure distance"} on={measuring} onClick={toggleMeasure}>
            <IconRuler />
          </ToolButton>
          {measureCount > 0 ? (
            <ToolButton title="Clear measurements" onClick={() => engineRef.current?.clearMeasurements()}>
              <IconTrash />
            </ToolButton>
          ) : null}
          <ToolButton title="Take screenshot" onClick={() => engineRef.current?.snapshot(current?.lb ?? "Visite 360")}>
            <IconCamera />
          </ToolButton>
          <ToolButton title="Fullscreen" onClick={toggleFullscreen}>
            <IconExpand />
          </ToolButton>
        </div>
      ) : null}

      {auto !== "idle" ? (
        <div className="visite360-autopill">
          {auto === "playing" ? (
            <button type="button" title="Pause" onClick={pauseAuto}>
              <IconPause />
            </button>
          ) : (
            <button type="button" title="Resume" onClick={resumeAuto}>
              <IconPlay />
            </button>
          )}
          <button type="button" title="Stop" onClick={stopAuto}>
            <IconStop />
          </button>
          <span>{auto === "paused" ? "Paused" : "Auto tour"}</span>
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

function ToolButton(props: { title: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`visite360-tool${props.on ? " on" : ""}`}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.on}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

const svg = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IconPlay = () => (
  <svg {...svg} fill="currentColor" stroke="none">
    <path d="M7 5v14l12-7z" />
  </svg>
);
const IconPause = () => (
  <svg {...svg} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
const IconStop = () => (
  <svg {...svg} fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);
const IconRuler = () => (
  <svg {...svg}>
    <path d="M3 17 17 3l4 4L7 21z" />
    <path d="m7 13 2 2M10 10l2 2M13 7l2 2" />
  </svg>
);
const IconTrash = () => (
  <svg {...svg}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);
const IconCamera = () => (
  <svg {...svg}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
const IconExpand = () => (
  <svg {...svg}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
