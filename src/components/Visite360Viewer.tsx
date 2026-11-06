"use client";

import { useEffect, useRef, useState } from "react";
import { visite360FaceUrl, visite360GraphUrl } from "@/lib/complex";
import {
  Visite360Engine,
  PRIMARY_ROOM_ORDER,
  type HotspotScreen,
  type Visite360Graph,
  type Visite360Node,
} from "@/viewer/Visite360Engine";

type Props = {
  className?: string;
  /** Optional start node id (default: Main Entrance / first node). */
  startId?: string;
};

/**
 * Fullscreen Layama cubemap tour: drag to look, click floor rings to walk in.
 * Faces + graph from local public/visite360 (Virtual Visions–style walk).
 */
export default function Visite360Viewer({ className, startId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Visite360Engine | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Visite360Node[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [hotspots, setHotspots] = useState<HotspotScreen[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let disposed = false;
    const engine = new Visite360Engine({
      canvas,
      faceUrl: (id, face) => visite360FaceUrl(id, face),
      onHotspots: (hs) => {
        if (!disposed) setHotspots(hs);
      },
      onNodeChange: (node) => {
        if (!disposed) setCurrentId(String(node.id));
      },
      onBusy: (v) => {
        if (!disposed) setBusy(v);
      },
      onError: (message) => {
        if (!disposed) setError(message);
      },
    });
    engineRef.current = engine;

    (async () => {
      try {
        const res = await fetch(visite360GraphUrl());
        if (!res.ok) throw new Error(`Graph ${res.status}`);
        const graph = (await res.json()) as Visite360Graph;
        if (disposed) return;

        const preferred =
          (startId && graph.nodes.some((n) => String(n.id) === String(startId))
            ? String(startId)
            : null) ||
          graph.nodes.find((n) => /main\s*entrance/i.test(n.label))?.id ||
          (graph.nodes[0] ? String(graph.nodes[0].id) : null);

        // Prefer Virtual Visions tour nodes when the graph includes filler spots.
        const primaryIds = new Set<string>(PRIMARY_ROOM_ORDER);
        const trimmed: Visite360Graph = {
          ...graph,
          nodes: graph.nodes.filter((n) => primaryIds.has(String(n.id))),
          edges: graph.edges.filter(
            (e) => primaryIds.has(String(e.from)) && primaryIds.has(String(e.to)),
          ),
        };
        const tourGraph = trimmed.nodes.length >= 8 ? trimmed : graph;

        await engine.loadGraph(tourGraph, preferred ?? undefined);
        if (disposed) return;
        setNodes(engine.getNodes());
        setCurrentId(engine.getCurrentId() ?? "");
        setReady(true);
        setError(null);
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : "Failed to load Visite 360");
        }
      }
    })();

    return () => {
      disposed = true;
      engineRef.current = null;
      engine.dispose();
    };
  }, [startId]);

  useEffect(() => {
    if (!currentId || !barRef.current) return;
    const el = barRef.current.querySelector<HTMLElement>(`[data-node="${currentId}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentId]);

  // NHC-style click-hold drag to reveal the rest of the room rail.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || nodes.length === 0) return;

    let active = false;
    let dragged = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startScroll = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      active = true;
      dragged = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startScroll = bar.scrollLeft;
      bar.classList.add("is-dragging");
      try {
        bar.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!active || pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) dragged = true;
      if (dragged) {
        bar.scrollLeft = startScroll - dx;
        e.preventDefault();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      active = false;
      pointerId = null;
      bar.classList.remove("is-dragging");
      try {
        bar.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // Swallow the click that follows a drag so we don't jump rooms by accident.
      if (dragged) {
        const block = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
          bar.removeEventListener("click", block, true);
        };
        bar.addEventListener("click", block, true);
        window.setTimeout(() => bar.removeEventListener("click", block, true), 0);
      }
      dragged = false;
    };

    bar.addEventListener("pointerdown", onDown);
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
    return () => {
      bar.removeEventListener("pointerdown", onDown);
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
    };
  }, [nodes.length]);

  const goTo = (id: string, aim?: { yaw: number; pitch: number }) => {
    const engine = engineRef.current;
    if (!engine || engine.isBusy() || id === currentId) return;
    void engine.goTo(id, {
      animate: true,
      yaw: aim?.yaw,
      pitch: aim?.pitch,
    });
  };

  return (
    <div
      className={`visite360${className ? ` ${className}` : ""}${busy ? " is-busy" : ""}`}
      ref={hostRef}
    >
      <canvas ref={canvasRef} className="visite360-canvas" />

      {!ready && !error ? <div className="visite360-loading">Loading Visite 360…</div> : null}
      {error ? <div className="visite360-error">{error}</div> : null}

      <div className="visite360-hotspots" aria-hidden={busy || !ready}>
        {hotspots
          .filter((h) => h.visible)
          .map((h) => (
            <button
              key={h.to}
              type="button"
              className="visite360-ring"
              style={{
                left: h.x,
                top: h.y,
                transform: `translate(-50%, -50%) scale(${h.scale})`,
              }}
              aria-label={h.label || "Go"}
              disabled={busy}
              onPointerDown={(e) => {
                // Don't let the canvas start a drag when pressing a ring.
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                goTo(h.to, { yaw: h.yaw, pitch: h.pitch });
              }}
            >
              <span className="visite360-ring-glow" />
              <span className="visite360-ring-dot" />
            </button>
          ))}
      </div>

      {nodes.length > 0 ? (
        <div className="visite360-rooms" ref={barRef} role="tablist" aria-label="Rooms">
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              role="tab"
              data-node={n.id}
              aria-selected={n.id === currentId}
              className={n.id === currentId ? "on" : ""}
              disabled={busy}
              onClick={() => goTo(n.id)}
            >
              {n.label || n.id}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
