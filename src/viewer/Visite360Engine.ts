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
  /** Perspective scale so near doors read larger, far ones softer. */
  scale: number;
  visible: boolean;
  yaw: number;
  pitch: number;
};

export const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"] as const;

const DEG = Math.PI / 180;
/** Virtual Visions / Layama: a few walk targets in view, not every graph link. */
const MAX_HOTSPOTS = 5;
/** Ignore distant graph links that punch through walls. */
const MAX_HOTSPOT_DIST = 380;
/** Same-floor gate (Layama Y is eye height). */
const SAME_FLOOR_Y = 90;

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

function nodePos(n: Visite360Node) {
  if (Array.isArray(n.pos)) return new THREE.Vector3(n.pos[0], n.pos[1], n.pos[2]);
  return new THREE.Vector3(n.pos.x, n.pos.y, n.pos.z);
}

/**
 * Graph pitch0 came from Layama's up-vector Y (near 90° when upright).
 * Convert to a calm eye-level look — never a floor/ceiling dive.
 */
function nodeLat(pitch0: number) {
  return clamp((90 - pitch0) * 0.2, -8, 10);
}

/** Soften authored floor-ring pitch so approach aims at the doorway, not the tiles. */
function approachLat(pitch: number) {
  return clamp(pitch * 0.35 - 4, -16, 12);
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
  private camFwd = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();

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

  async goTo(
    nodeId: string,
    opts?: { animate?: boolean; via?: Visite360Edge; yaw?: number; pitch?: number },
  ) {
    const node = this.nodeById.get(String(nodeId));
    if (!node || this.disposed) return;
    if (this.anim) return;

    const destLon = wrapLon(node.yaw0);
    const destLat = nodeLat(node.pitch0);
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

    let lookLon: number;
    let lookLat: number;
    if (opts?.yaw != null && opts?.pitch != null) {
      lookLon = wrapLon(opts.yaw);
      lookLat = approachLat(opts.pitch);
    } else if (edge) {
      // Keep edge yaw (ring direction) but soften pitch so we don't dive into the floor.
      lookLon = wrapLon(edge.yaw);
      lookLat = approachLat(edge.pitch);
    } else {
      // Room-bar jump with no direct edge: aim toward the target in world space.
      const aim = this.aimToward(this.currentId, node.id);
      lookLon = aim ? aim.yaw : destLon;
      lookLat = aim ? approachLat(aim.pitch) : destLat;
    }

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
      // Mild zoom into the doorway — Virtual Visions style, not a floor dive.
      toFov: clamp(this.fov * 0.78, 48, 70),
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

  private aimToward(fromId: string, toId: string) {
    const from = this.nodeById.get(fromId);
    const to = this.nodeById.get(toId);
    if (!from || !to) return null;
    const d = nodePos(to).sub(nodePos(from));
    if (d.lengthSq() < 1e-6) return null;
    d.normalize();
    const yaw = Math.atan2(d.z, d.x) / DEG;
    const pitch = Math.asin(clamp(d.y, -1, 1)) / DEG;
    return { yaw: wrapLon(yaw), pitch: clamp(pitch, -55, 55) };
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

  private rankedNeighbors(nodeId: string) {
    const cur = this.nodeById.get(nodeId);
    if (!cur) return [] as { edge: Visite360Edge; dist: number; dy: number }[];
    const origin = nodePos(cur);
    const ranked: { edge: Visite360Edge; dist: number; dy: number }[] = [];
    for (const edge of this.outs.get(nodeId) ?? []) {
      const target = this.nodeById.get(edge.to);
      if (!target) continue;
      const p = nodePos(target);
      const dist = origin.distanceTo(p);
      const dy = Math.abs(p.y - origin.y);
      if (dist > MAX_HOTSPOT_DIST) continue;
      if (dy > SAME_FLOOR_Y && dist > 220) continue;
      ranked.push({ edge, dist, dy });
    }
    ranked.sort((a, b) => a.dist - b.dist || a.dy - b.dy);
    return ranked;
  }

  private prefetchNeighbors(nodeId: string) {
    for (const { edge } of this.rankedNeighbors(nodeId).slice(0, 4)) {
      void this.loadFaces(edge.to).catch(() => {});
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
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const neighbors = this.rankedNeighbors(this.currentId).slice(0, MAX_HOTSPOTS);
    const out: HotspotScreen[] = [];

    this.camera.getWorldDirection(this.camFwd);

    for (const { edge, dist } of neighbors) {
      const target = this.nodeById.get(edge.to);
      // Authored edge pitch places rings on the floor / doorway — do not remap.
      this.dirFromYawPitch(edge.yaw, edge.pitch, this.tmpDir);
      const facing = this.tmpDir.dot(this.camFwd);
      if (facing < 0.08) continue;

      const projected = this.tmpDir.clone().project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      const inFront = projected.z < 1;
      const onScreen = x > 16 && x < w - 16 && y > 16 && y < h - 16;
      out.push({
        to: edge.to,
        label: target?.label ?? edge.to,
        x,
        y,
        scale: clamp(1.18 - dist / 520, 0.72, 1.18),
        visible: inFront && onScreen && !this.anim,
        yaw: edge.yaw,
        pitch: edge.pitch,
      });
    }
    this.onHotspots(out);
  }

  /** `pitchDeg` is elevation (0 = horizon, negative = floor), matching graph edges. */
  private dirFromYawPitch(yawDeg: number, pitchDeg: number, out: THREE.Vector3) {
    const phi = (90 - pitchDeg) * DEG;
    const theta = yawDeg * DEG;
    return out.set(
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
    const destLat = nodeLat(node.pitch0);
    const destFov = this.mapFov(node.fov0);

    this.anim = {
      phase: "settle",
      t0: performance.now(),
      dur: 420,
      fromLon: this.lon,
      fromLat: this.lat,
      toLon: this.lon + shortestDelta(this.lon, destLon),
      // Always settle at eye level so we never leave the user staring at tiles.
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
            this.lat = nodeLat(n.pitch0);
            this.fov = this.mapFov(n.fov0);
            this.targetFov = this.fov;
          }
          this.anim = null;
          this.onBusy?.(false);
          this.hotspotDirty = true;
        }
      }
    } else if (Math.abs(this.fov - this.targetFov) > 0.05) {
      this.fov += (this.targetFov - this.fov) * 0.16;
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
    this.lon = wrapLon(this.lon - dx * 0.16);
    this.lat = clamp(this.lat + dy * 0.16, -80, 80);
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
    this.targetFov = clamp(this.targetFov + e.deltaY * 0.045, 36, 92);
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
