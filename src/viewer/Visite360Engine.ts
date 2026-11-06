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

/**
 * Virtual Visions room rail order (tour nodes only — graph also has filler spots).
 * Keep walk / rail limited to this set so the tour matches the reference UX.
 */
export const PRIMARY_ROOM_ORDER = [
  "10000", // Main Entrance
  "10003", // Dining Entrance
  "10002", // Living Room 1
  "10001", // Hall 1
  "10006", // Hall 3
  "10005", // Kitchen
  "10008", // Hall 4
  "10010", // Hall 5
  "10007", // Bedroom 1
  "10012", // Hall 6
  "10011", // Bedroom 2
  "10009", // Bathroom
  "10013", // Suite Bedroom
  "10014", // Suite Dressing
  "10015", // Suite Bathroom
  "10016", // Dining Room
  "10004", // Hall 2
  "10017", // Living Room 2
] as const;

const PRIMARY_ROOM_SET = new Set<string>(PRIMARY_ROOM_ORDER);

const DEG = Math.PI / 180;
/** NHC shows a couple of walk targets in view — not every graph link. */
const MAX_HOTSPOTS = 3;
/** Ignore distant graph links that punch through walls. */
const MAX_HOTSPOT_DIST = 420;
/** Same-floor gate (Layama Y is eye height). */
const SAME_FLOOR_Y = 90;
/** Eye-level look after enter / settle (slightly down reads more natural). */
const EYE_LAT = -4;
/** Default FOV once mapped from Layama's ultra-wide export. */
const DEFAULT_FOV = 72;

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
 * Graph yaw0/pitch0 were derived from Layama's UP vector — not usable as look.
 * Face toward the nearest doorway at eye level instead (Virtual Visions feel).
 */
function approachLookLat(edgePitch: number) {
  // Dive toward the floor ring then settle — Virtual Visions walk-in feel.
  return clamp(edgePitch * 0.55 - 4, -28, -4);
}

export type Visite360EngineOptions = {
  canvas: HTMLCanvasElement;
  faceUrl: (nodeId: string, face: (typeof FACE_ORDER)[number]) => string;
  onNodeChange?: (node: Visite360Node) => void;
  onHotspots?: (hotspots: HotspotScreen[]) => void;
  onBusy?: (busy: boolean) => void;
  onError?: (message: string) => void;
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
  /** Keep this yaw after cubemap swap (VV keeps facing the walk direction). */
  settleLon: number;
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
  private lat = EYE_LAT;
  private fov = DEFAULT_FOV;
  private targetFov = DEFAULT_FOV;

  private pointerDown = false;
  private dragged = false;
  private lastX = 0;
  private lastY = 0;
  private pointerId: number | null = null;

  private anim: AnimState | null = null;

  private raf = 0;
  private disposed = false;
  private faceUrl: Visite360EngineOptions["faceUrl"];
  private onNodeChange?: Visite360EngineOptions["onNodeChange"];
  private onHotspots?: Visite360EngineOptions["onHotspots"];
  private onBusy?: Visite360EngineOptions["onBusy"];
  private onError?: Visite360EngineOptions["onError"];
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
    this.onError = opts.onError;

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x0b1220);

    this.camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.05, 2000);
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
    if (!this.graph) return [];
    const byId = new Map(this.graph.nodes.map((n) => [String(n.id), { ...n, id: String(n.id) }]));
    const primary = PRIMARY_ROOM_ORDER.map((id) => byId.get(id)).filter(
      (n): n is Visite360Node => !!n,
    );
    if (primary.length > 0) return primary;
    return this.graph.nodes.map((n) => ({ ...n, id: String(n.id) }));
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

    const destFov = this.mapFov(node.fov0);
    const entry = this.entryLook(node.id);

    if (!opts?.animate || !this.currentId || this.currentId === node.id) {
      try {
        await this.setScene(node);
      } catch (e) {
        this.onError?.(e instanceof Error ? e.message : "Failed to load scene");
        return;
      }
      this.lon = entry.lon;
      this.lat = entry.lat;
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
      lookLat = approachLookLat(opts.pitch);
    } else if (edge) {
      lookLon = wrapLon(edge.yaw);
      lookLat = approachLookLat(edge.pitch);
    } else {
      const aim = this.aimToward(this.currentId, node.id);
      lookLon = aim ? aim.yaw : entry.lon;
      lookLat = aim ? approachLookLat(aim.pitch) : entry.lat;
    }

    this.onBusy?.(true);
    void this.loadFaces(node.id).catch(() => {});

    this.anim = {
      phase: "approach",
      t0: performance.now(),
      dur: 720,
      fromLon: this.lon,
      fromLat: this.lat,
      toLon: this.lon + shortestDelta(this.lon, lookLon),
      toLat: lookLat,
      fromFov: this.fov,
      // Zoom into the doorway / ring — NHC walk-in feel.
      toFov: clamp(this.fov * 0.62, 40, 56),
      toId: node.id,
      settleLon: lookLon,
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
    if (fov0 > 120) return clamp(58 + (fov0 - 120) * 0.35, 58, 78);
    return clamp(fov0, 48, 88);
  }

  /**
   * Face into the room at eye level (Virtual Visions), not straight into the
   * nearest wall hotspot. Prefer a mid-range doorway when available.
   */
  private entryLook(nodeId: string) {
    const ranked = this.rankedNeighbors(nodeId);
    const intoRoom =
      ranked.find((r) => r.dist >= 180 && r.dist <= 420) ??
      ranked.find((r) => r.dist >= 120) ??
      ranked[0];
    if (intoRoom) {
      return { lon: wrapLon(intoRoom.edge.yaw), lat: EYE_LAT };
    }
    return { lon: 0, lat: EYE_LAT };
  }

  private aimToward(fromId: string, toId: string) {
    const from = this.nodeById.get(fromId);
    const to = this.nodeById.get(toId);
    if (!from || !to) return null;
    const d = nodePos(to).sub(nodePos(from));
    if (d.lengthSq() < 1e-6) return null;
    // Layama graph yaw = atan2(dx, dz) — NOT atan2(dz, dx).
    const yaw = Math.atan2(d.x, d.z) / DEG;
    const pitch = Math.asin(clamp(d.y / d.length(), -1, 1)) / DEG;
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
        () => {
          this.loadQueue.delete(nodeId);
          reject(new Error(`Cubemap ${nodeId} failed to load`));
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
      // Stay inside the Virtual Visions tour set (skip filler graph nodes).
      if (PRIMARY_ROOM_SET.size && !PRIMARY_ROOM_SET.has(edge.to)) continue;
      const p = nodePos(target);
      const dist = origin.distanceTo(p);
      const dy = Math.abs(p.y - origin.y);
      if (dist > MAX_HOTSPOT_DIST) continue;
      if (dy > SAME_FLOOR_Y && dist > 220) continue;
      ranked.push({ edge, dist, dy });
    }
    ranked.sort((a, b) => a.dist - b.dist || a.dy - b.dy);
    // One ring per doorway direction — overlapping yaws were sending people to the wrong room.
    const unique: typeof ranked = [];
    for (const item of ranked) {
      const clash = unique.some((u) => Math.abs(shortestDelta(u.edge.yaw, item.edge.yaw)) < 28);
      if (!clash) unique.push(item);
    }
    return unique;
  }

  private prefetchNeighbors(nodeId: string) {
    for (const { edge } of this.rankedNeighbors(nodeId).slice(0, 4)) {
      void this.loadFaces(edge.to).catch(() => {});
    }
  }

  private applyCamera() {
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    // Same spherical basis as Layama edges: yaw=atan2(x,z), pitch=elevation.
    this.dirFromYawPitch(this.lon, this.lat, this.tmpDir);
    this.camera.lookAt(this.tmpDir);
  }

  private emitHotspots() {
    if (!this.currentId || !this.onHotspots) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Prefer mid-range doorways (open floor ahead) over ultra-near wall stubs.
    const neighbors = this.rankedNeighbors(this.currentId)
      .slice()
      .sort((a, b) => {
        const score = (d: number) => Math.abs(d - 220);
        return score(a.dist) - score(b.dist) || a.dist - b.dist;
      })
      .slice(0, MAX_HOTSPOTS);
    const out: HotspotScreen[] = [];

    this.camera.getWorldDirection(this.camFwd);
    // Looking straight at the tiles → rings foreshorten into white dots/dashes. Be stricter.
    const minFacing = this.lat < -28 ? 0.55 : 0.38;

    for (const { edge, dist } of neighbors) {
      const target = this.nodeById.get(edge.to);
      /**
       * NHC: one clean disk on the OPEN floor toward the doorway — not mid-air,
       * not glued to the wall base. Steeper pitch = closer on the floor (in front
       * of the door); shallower = farther toward a distant room.
       */
      const ringPitch =
        dist < 170 ? -44 : dist < 300 ? -36 : -30;
      this.dirFromYawPitch(edge.yaw, ringPitch, this.tmpDir);
      const facing = this.tmpDir.dot(this.camFwd);
      if (facing < minFacing) continue;

      const projected = this.tmpDir.clone().project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      const inFront = projected.z < 1;
      // Keep rings in the walkable floor band — never on the room rail / sky.
      const onScreen =
        x > w * 0.08 &&
        x < w * 0.92 &&
        y > h * 0.38 &&
        y < h - 110;
      if (!inFront || !onScreen || this.anim) continue;

      out.push({
        to: edge.to,
        label: target?.label ?? edge.to,
        x,
        y,
        scale: clamp(1.45 - dist / 520, 1, 1.55),
        visible: true,
        yaw: edge.yaw,
        pitch: edge.pitch,
      });
    }
    this.onHotspots(out);
  }

  /**
   * Layama / Motiva look vector: yaw 0 = +Z, yaw +90 = +X, pitch 0 = horizon.
   * Matches graph edge.yaw = atan2(dx, dz).
   */
  private dirFromYawPitch(yawDeg: number, pitchDeg: number, out: THREE.Vector3) {
    const yaw = yawDeg * DEG;
    const pitch = pitchDeg * DEG;
    const c = Math.cos(pitch);
    return out.set(c * Math.sin(yaw), Math.sin(pitch), c * Math.cos(yaw));
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
    const settleLon = this.anim.settleLon;
    if (!node) {
      this.anim = null;
      this.onBusy?.(false);
      return;
    }

    try {
      await this.setScene(node);
    } catch (e) {
      this.anim = null;
      this.onBusy?.(false);
      this.onError?.(e instanceof Error ? e.message : "Failed to load scene");
      return;
    }
    if (this.disposed) return;

    const destFov = this.mapFov(node.fov0);

    // After the swap, lift to eye level while keeping the walk heading (NHC enter).
    const into = this.entryLook(node.id);
    const endLon = settleLon ?? into.lon;
    this.anim = {
      phase: "settle",
      t0: performance.now(),
      dur: 460,
      fromLon: this.lon,
      fromLat: this.lat,
      toLon: this.lon + shortestDelta(this.lon, endLon),
      toLat: EYE_LAT,
      fromFov: this.fov,
      toFov: destFov,
      toId: node.id,
      settleLon: endLon,
    };
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
          this.lon = wrapLon(this.anim.settleLon);
          this.lat = EYE_LAT;
          this.fov = this.anim.toFov;
          this.targetFov = this.fov;
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
    this.lon = wrapLon(this.lon - dx * 0.18);
    this.lat = clamp(this.lat + dy * 0.16, -70, 70);
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
    this.targetFov = clamp(this.targetFov + e.deltaY * 0.04, 38, 90);
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
