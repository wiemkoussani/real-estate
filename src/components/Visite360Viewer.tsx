"use client";

import { useEffect, useRef, useState } from "react";
import { visite360FaceUrl, visite360GraphUrl } from "@/lib/complex";
import {
  Visite360Engine,
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
 * Faces resolve via COMPLEX.assetBase (local public/ or Supabase).
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

        await engine.loadGraph(graph, preferred ?? undefined);
        if (disposed) return;
        setNodes(engine.getNodes());
        setCurrentId(engine.getCurrentId() ?? "");
        setReady(true);
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

  const goTo = (id: string) => {
    const engine = engineRef.current;
    if (!engine || engine.isBusy() || id === currentId) return;
    void engine.goTo(id, { animate: true });
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
              style={{ left: h.x, top: h.y }}
              aria-label={h.label || "Go"}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                goTo(h.to);
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
