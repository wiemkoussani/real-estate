"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { visite360Base, visite360ImageBase, visite360TourUrl } from "@/lib/complex";
import { Visite360Engine, type TourData } from "@/viewer/Visite360Engine";

// Arabic labels for the tour (tour.json ships English names from the export).
const ROOM_AR: Record<string, string> = {
  Entrance: "المدخل",
  "Living Room": "غرفة المعيشة",
  Kitchen: "المطبخ",
  "Dining Room": "غرفة الطعام",
  Majlis: "المجلس",
  Staircase: "الدرج",
  "Upper Hall": "الصالة العلوية",
  "Shared Bathroom": "دورة المياه المشتركة",
  "Roof Hall": "صالة السطح",
  "Guest WC": "دورة مياه الضيوف",
};
const FLOOR_AR: Record<string, string> = {
  ground: "الدور الأرضي",
  first: "الدور الأول",
  roof: "السطح",
};
function roomAr(lb?: string) {
  if (!lb) return lb;
  if (ROOM_AR[lb]) return ROOM_AR[lb];
  const bath = /^Bedroom (\d+) Bathroom$/.exec(lb);
  if (bath) return `دورة مياه غرفة النوم ${bath[1]}`;
  const bed = /^Bedroom (\d+)$/.exec(lb);
  if (bed) return `غرفة النوم ${bed[1]}`;
  return lb;
}
function arabizeTour(t: TourData): TourData {
  return {
    ...t,
    floors: t.floors?.map((f) => ({ ...f, label: FLOOR_AR[f.id] ?? f.label })),
    cameras: t.cameras.map((c) => ({ ...c, lb: roomAr(c.lb) })),
  };
}

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
  const [measuring, setMeasuring] = useState(false);
  const [measureCount, setMeasureCount] = useState(0);

  // ---------------------------------------------------------------- engine
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let disposed = false;
    let engine: Visite360Engine | null = null;
    setLoaded(false);
    setError(null);
    setMeasuring(false);
    setMeasureCount(0);

    (async () => {
      try {
        const res = await fetch(visite360TourUrl());
        if (!res.ok) throw new Error(`tour.json ${res.status}`);
        const data = arabizeTour((await res.json()) as TourData);
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
        if (!disposed) setError(e instanceof Error ? e.message : "تعذّر تحميل الجولة الافتراضية");
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

  const toggleMeasure = () => {
    const next = !measuring;
    setMeasuring(next);
    engineRef.current?.setMeasureMode(next);
  };

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
        <span>جارٍ تحميل الجولة 360°…</span>
      </div>
      {error ? <div className="visite360-error">{error}</div> : null}

      {loaded && current ? (
        <div className="visite360-caption" dir="rtl" aria-live="polite">
          {floors.length > 1 && activeFloor ? <span>{activeFloor.label}</span> : null}
          {current.lb ? <strong>{current.lb}</strong> : null}
        </div>
      ) : null}

      {loaded ? (
        <div className="visite360-side">
          {/* measure tool sits above the floor buttons (above Roof) */}
          <div className="visite360-measure-tools">
            <button
              type="button"
              className={`visite360-tool${measuring ? " on" : ""}`}
              title={measuring ? "إيقاف القياس" : "قياس المسافة"}
              aria-label={measuring ? "إيقاف القياس" : "قياس المسافة"}
              aria-pressed={measuring}
              onClick={toggleMeasure}
            >
              <IconRuler />
              {measureCount > 0 ? <span className="tool-count">{measureCount}</span> : null}
            </button>
            {measureCount > 0 ? (
              <button
                type="button"
                className="visite360-tool"
                title="مسح القياسات"
                aria-label="مسح القياسات"
                onClick={() => engineRef.current?.clearMeasurements()}
              >
                <IconTrash />
              </button>
            ) : null}
          </div>
          {floors.length > 1 ? (
        <div className="visite360-floors" role="tablist" aria-label="الطوابق">
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
        </div>
      ) : null}

      {loaded && rooms.length ? (
        <div className="visite360-rooms" ref={barRef} role="tablist" aria-label="الغرف" dir="rtl">
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

const svg = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
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
