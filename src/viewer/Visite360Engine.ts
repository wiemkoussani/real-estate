import * as THREE from "three";

export type Visite360Node = {
  id: string;
  label: string;
  /** Graph may store pos as `[x,y,z]` or `{x,y,z}`. */
  pos: { x: number; y: number; z: number } | [number, number, number];
  yaw0: number;
  pitch0: number;
  fov0: number;
};

export type Visite360Edge = {
  from: string;
  to: string;
  yaw: number;
  pitch: number;
};

export type Visite360Graph = {
  version: number;
  source: string;
  nodes: Visite360Node[];
  edges: Visite360Edge[];
};

export type HotspotScreen = {
  to: string;
  label: string;
  x: number;
  y: number;
  visible: boolean;
};

export const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"] as const;

const DEG = Math.PI / 180;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function wrapLon(lon: number) {
  let v = lon;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

function shortestDelta(from: number, to: number) {
  return wrapLon(to - from);
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export type Visite360EngineOptions = {
  canvas: HTMLCanvasElement;
  faceUrl: (nodeId: string, face: (typeof FACE_ORDER)[number]) => string;
  onNodeChange?: (node: Visite360Node) => void;
  onHotspots?: (hotspots: HotspotScreen[]) => void;
  onBusy?: (busy: boolean) => void;
};

type AnimState = {
  phase: "approach" | "settle";
  t0: number;
  dur: number;
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  fromFov: number;
  toFov: number;
  toId: string;
};

export class Visite360Engine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private loader = new THREE.CubeTextureLoader();
  private texCache = new Map<string, THREE.CubeTexture>();
  private loadQueue = new Map<string, Promise<THREE.CubeTexture>>();

  private graph: Visite360Graph | null = null;
  private nodeById = new Map<string, Visite360Node>();
  private outs = new Map<string, Visite360Edge[]>();
  private currentId: string | null = null;

  private lon = 0;
  private lat = 0;
  private fov = 75;
  private targetFov = 75;

  private pointerDown = false;
  private dragged = false;
  private lastX = 0;
  private lastY = 0;
  private pointerId: number | null = null;

  private anim: AnimState | null = null;
  private pendingSwap: string | null = null;

  private raf = 0;
  private disposed = false;
  private faceUrl: Visite360EngineOptions["faceUrl"];
  private onNodeChange?: Visite360EngineOptions["onNodeChange"];
  private onHotspots?: Visite360EngineOptions["onHotspots"];
  private onBusy?: Visite360EngineOptions["onBusy"];
  private canvas: HTMLCanvasElement;
  private ro: ResizeObserver;
  private hotspotDirty = true;

  constructor(opts: Visite360EngineOptions) {
    this.canvas = opts.canvas;
    this.faceUrl = opts.faceUrl;
    this.onNodeChange = opts.onNodeChange;
    this.onHotspots = opts.onHotspots;
    this.onBusy = opts.onBusy;

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    this.camera.position.set(0, 0, 0);

    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(opts.canvas.parentElement ?? opts.canvas);
    this.resize();
    this.tick();
  }

  async loadGraph(graph: Visite360Graph, startId?: string) {
    this.graph = graph;
    this.nodeById.clear();
    this.outs.clear();
    for (const n of graph.nodes) {
      this.nodeById.set(String(n.id), { ...n, id: String(n.id) });
    }
    for (const e of graph.edges) {
      const from = String(e.from);
      const list = this.outs.get(from) ?? [];
      list.push({ ...e, from, to: String(e.to) });
      this.outs.set(from, list);
    }
    const first =
      (startId && this.nodeById.has(String(startId)) && String(startId)) ||
      (graph.nodes[0] ? String(graph.nodes[0].id) : null);
    if (first) await this.goTo(first, { animate: false });
  }

  getNodes() {
    return this.graph?.nodes.map((n) => ({ ...n, id: String(n.id) })) ?? [];
  }

  getCurrentId() {
    return this.currentId;
  }

  isBusy() {
    return !!this.anim;
  }

  async goTo(nodeId: string, opts?: { animate?: boolean; via?: Visite360Edge }) {
    const node = this.nodeById.get(String(nodeId));
    if (!node || this.disposed) return;
    if (this.anim) return;

    const destLon = wrapLon(node.yaw0);
    const destLat = clamp(90 - node.pitch0, -85, 85);
    const destFov = this.mapFov(node.fov0);

    if (!opts?.animate || !this.currentId || this.currentId === node.id) {
      await this.setScene(node);
      this.lon = destLon;
      this.lat = destLat;
      this.fov = destFov;
      this.targetFov = destFov;
      this.applyCamera();
      this.hotspotDirty = true;
      return;
    }

    const edge =
      opts?.via ??
      this.outs.get(this.currentId)?.find((e) => e.to === node.id) ??
      null;

    const lookLon = edge ? wrapLon(edge.yaw) : destLon;
    const lookLat = edge ? clamp(edge.pitch, -85, 85) : destLat;

    this.onBusy?.(true);
    this.pendingSwap = node.id;
    void this.loadFaces(node.id).catch(() => {});

    this.anim = {
      phase: "approach",
      t0: performance.now(),
      dur: 620,
      fromLon: this.lon,
      fromLat: this.lat,
      toLon: this.lon + shortestDelta(this.lon, lookLon),
      toLat: lookLat,
      fromFov: this.fov,
      toFov: clamp(this.fov * 0.58, 40, 68),
      toId: node.id,
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unbindPointer();
    for (const tex of this.texCache.values()) tex.dispose();
    this.texCache.clear();
    this.renderer.dispose();
  }

  private mapFov(fov0: number) {
    if (fov0 > 120) return clamp(58 + (fov0 - 120) * 0.3, 55, 82);
    return clamp(fov0, 45, 95);
  }

  private async setScene(node: Visite360Node) {
    const tex = await this.loadFaces(node.id);
    if (this.disposed) return;
    this.scene.background = tex;
    this.currentId = node.id;
    this.onNodeChange?.(node);
    this.prefetchNeighbors(node.id);
    this.hotspotDirty = true;
  }

  private loadFaces(nodeId: string) {
    const cached = this.texCache.get(nodeId);
    if (cached) return Promise.resolve(cached);
    const pending = this.loadQueue.get(nodeId);
    if (pending) return pending;

    const urls = FACE_ORDER.map((f) => this.faceUrl(nodeId, f));
    const p = new Promise<THREE.CubeTexture>((resolve, reject) => {
      this.loader.load(
        urls,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          this.texCache.set(nodeId, tex);
          this.loadQueue.delete(nodeId);
          resolve(tex);
        },
        undefined,
        (err) => {
          this.loadQueue.delete(nodeId);
          reject(err);
        },
      );
    });
    this.loadQueue.set(nodeId, p);
    return p;
  }

  private prefetchNeighbors(nodeId: string) {
    const edges = this.outs.get(nodeId) ?? [];
    for (const e of edges.slice(0, 5)) {
      void this.loadFaces(e.to).catch(() => {});
    }
  }

  private applyCamera() {
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    const phi = (90 - this.lat) * DEG;
    const theta = this.lon * DEG;
    this.camera.lookAt(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
  }

  private emitHotspots() {
    if (!this.currentId || !this.onHotspots) return;
    const edges = this.outs.get(this.currentId) ?? [];
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const out: HotspotScreen[] = [];

    for (const e of edges) {
      const target = this.nodeById.get(e.to);
      const dir = this.sphericalDir(e.yaw, e.pitch);
      dir.project(this.camera);
      const x = (dir.x * 0.5 + 0.5) * w;
      const y = (-dir.y * 0.5 + 0.5) * h;
      const inFront = dir.z < 1;
      const onScreen = x > -48 && x < w + 48 && y > -48 && y < h + 48;
      out.push({
        to: e.to,
        label: target?.label ?? e.to,
        x,
        y,
        visible: inFront && onScreen && !this.anim,
      });
    }
    this.onHotspots(out);
  }

  private sphericalDir(yawDeg: number, pitchDeg: number) {
    const phi = (90 - pitchDeg) * DEG;
    const theta = yawDeg * DEG;
    return new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
  }

  private resize() {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.hotspotDirty = true;
  }

  private async finishApproach() {
    if (!this.anim || this.anim.phase !== "approach") return;
    const node = this.nodeById.get(this.anim.toId);
    if (!node) {
      this.anim = null;
      this.onBusy?.(false);
      return;
    }

    await this.setScene(node);
    if (this.disposed) return;

    const destLon = wrapLon(node.yaw0);
    const destLat = clamp(90 - node.pitch0, -85, 85);
    const destFov = this.mapFov(node.fov0);

    this.anim = {
      phase: "settle",
      t0: performance.now(),
      dur: 480,
      fromLon: this.lon,
      fromLat: this.lat,
      toLon: this.lon + shortestDelta(this.lon, destLon),
      toLat: destLat,
      fromFov: this.fov,
      toFov: destFov,
      toId: node.id,
    };
    this.pendingSwap = null;
  }

  private tick = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);

    if (this.anim) {
      const t = clamp((performance.now() - this.anim.t0) / this.anim.dur, 0, 1);
      const k = easeInOut(t);
      this.lon = this.anim.fromLon + (this.anim.toLon - this.anim.fromLon) * k;
      this.lat = this.anim.fromLat + (this.anim.toLat - this.anim.fromLat) * k;
      this.fov = this.anim.fromFov + (this.anim.toFov - this.anim.fromFov) * k;

      if (t >= 1) {
        if (this.anim.phase === "approach") {
          void this.finishApproach();
        } else {
          const n = this.nodeById.get(this.anim.toId);
          if (n) {
            this.lon = wrapLon(n.yaw0);
            this.lat = clamp(90 - n.pitch0, -85, 85);
            this.fov = this.mapFov(n.fov0);
            this.targetFov = this.fov;
          }
          this.anim = null;
          this.onBusy?.(false);
          this.hotspotDirty = true;
        }
      }
    } else if (Math.abs(this.fov - this.targetFov) > 0.05) {
      this.fov += (this.targetFov - this.fov) * 0.14;
      this.hotspotDirty = true;
    }

    this.applyCamera();
    this.renderer.render(this.scene, this.camera);

    if (this.hotspotDirty || this.pointerDown) {
      this.emitHotspots();
      this.hotspotDirty = false;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.anim) return;
    this.pointerDown = true;
    this.dragged = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointerDown || this.anim) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.dragged = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lon = wrapLon(this.lon - dx * 0.18);
    this.lat = clamp(this.lat + dy * 0.18, -85, 85);
    this.hotspotDirty = true;
  };

  private onPointerUp = () => {
    if (this.pointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.pointerId);
      } catch {
        /* ignore */
      }
    }
    this.pointerDown = false;
    this.pointerId = null;
    this.hotspotDirty = true;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.anim) return;
    this.targetFov = clamp(this.targetFov + e.deltaY * 0.05, 40, 95);
  };

  private bindPointer() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private unbindPointer() {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}
