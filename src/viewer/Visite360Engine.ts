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

/**
 * Layama px/nx are swapped vs Three.js CubeTexture +X/−X sampling — without this
 * swap, lon 0 shows the closed door and lon 180 never reaches the open hallway.
 */
export const FACE_ORDER = ["nx", "px", "py", "ny", "pz", "nz"] as const;

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

/**
 * First look after px/nx swap: lon 0 = +X = open hallway (nx file).
 * NHC opens into the room — never the closed entrance door.
 */
const ENTRY_LOOK: Record<string, { yaw: number; pitch: number }> = {
  "10000": { yaw: 0, pitch: -5 }, // Main Entrance → open hallway
};

const PRIMARY_ROOM_SET = new Set<string>(PRIMARY_ROOM_ORDER);

const DEG = Math.PI / 180;
/**
 * NHC: usually 2 big floor rings in open doorways — click to enter, return ring
 * appears in the next room so you can walk back.
 */
const MAX_HOTSPOTS = 3;
/** Ignore distant graph links that punch through walls. */
const MAX_HOTSPOT_DIST = 480;
/** Same-floor gate (Layama Y is eye height). */
const SAME_FLOOR_Y = 90;
/** Eye-level look after enter / settle (slightly down reads more natural). */
const EYE_LAT = -4;
/** Layama node Y ≈ eye height — floor plane for NHC rings is y ≈ 0. */
const EYE_HEIGHT = 152;
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
  /** Room we walked from — always keep a return floor ring (NHC come-back). */
  private previousId: string | null = null;

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
  private tmpPos = new THREE.Vector3();

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
    opts?: {
      animate?: boolean;
      via?: Visite360Edge;
      yaw?: number;
      pitch?: number;
      /** Bottom room rail jump (NHC): go to that part even without a floor ring. */
      fromRail?: boolean;
    },
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
      // Always open looking into the room (NHC), never a wall/door close-up.
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
    let approachFov: number;
    let approachDur: number;

    if (opts?.yaw != null && opts?.pitch != null) {
      // Floor-ring click: dive toward that doorway (NHC walk-in).
      lookLon = wrapLon(opts.yaw);
      lookLat = approachLookLat(opts.pitch);
      approachFov = clamp(this.fov * 0.64, 42, 58);
      approachDur = 680;
    } else if (edge) {
      // Direct graph link (rail or ring): approach that doorway.
      lookLon = wrapLon(edge.yaw);
      lookLat = approachLookLat(edge.pitch);
      approachFov = clamp(this.fov * 0.64, 42, 58);
      approachDur = 680;
    } else {
      // Rail jump with no direct doorway — NHC still goes there: soft turn, then land
      // in the room's open entry view (don't aim through walls).
      lookLon = entry.lon;
      lookLat = entry.lat;
      approachFov = clamp(this.fov * 0.9, 50, 72);
      approachDur = opts?.fromRail ? 520 : 600;
    }

    this.onBusy?.(true);
    // NHC: hide rings during the walk, then redraw in the new room.
    this.onHotspots?.([]);
    void this.loadFaces(node.id).catch(() => {});

    this.anim = {
      phase: "approach",
      t0: performance.now(),
      dur: approachDur,
      fromLon: this.lon,
      fromLat: this.lat,
      toLon: this.lon + shortestDelta(this.lon, lookLon),
      toLat: lookLat,
      fromFov: this.fov,
      toFov: approachFov,
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
   * Face into the open room at eye level (NHC):
   * - First open: curated hallway view (never a closed door).
   * - After a walk from `fromId`: look INTO the room (opposite the entry doorway)
   *   so the return floor ring sits behind you until you turn — same as NHC.
   */
  private entryLook(nodeId: string, fromId?: string | null) {
    if (fromId && fromId !== nodeId) {
      const back = this.outs.get(nodeId)?.find((e) => e.to === fromId);
      if (back) {
        return { lon: wrapLon(back.yaw + 180), lat: EYE_LAT };
      }
    }

    const curated = ENTRY_LOOK[nodeId];
    if (curated) {
      return { lon: wrapLon(curated.yaw), lat: curated.pitch };
    }

    const ranked = this.rankedNeighbors(nodeId);
    // Skip ultra-near stubs (wall/door faces). Prefer a deep open view.
    const intoRoom =
      ranked.find((r) => r.dist >= 240 && r.dist <= 480) ??
      ranked.find((r) => r.dist >= 180) ??
      ranked.find((r) => r.dist >= 140) ??
      null;
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
    // Same frame as authored edge.yaw (used as classic panorama lon).
    const yaw = Math.atan2(d.x, d.z) / DEG;
    const pitch = Math.asin(clamp(d.y / d.length(), -1, 1)) / DEG;
    return { yaw: wrapLon(yaw), pitch: clamp(pitch, -55, 55) };
  }

  private async setScene(node: Visite360Node) {
    const tex = await this.loadFaces(node.id);
    if (this.disposed) return;
    if (this.currentId && this.currentId !== node.id) {
      this.previousId = this.currentId;
    }
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
    // Prefetch the return room so come-back feels instant like NHC.
    if (this.previousId) void this.loadFaces(this.previousId).catch(() => {});
  }

  private applyCamera() {
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.dirFromYawPitch(this.lon, this.lat, this.tmpDir);
    this.camera.lookAt(this.tmpDir);
  }

  private emitHotspots() {
    if (!this.currentId || !this.onHotspots) return;
    // NHC hides floor rings while walking between rooms.
    if (this.anim) {
      this.onHotspots([]);
      return;
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ranked = this.rankedNeighbors(this.currentId);
    const cur = this.nodeById.get(this.currentId);
    const origin = cur ? nodePos(cur) : null;

    // NHC: return path first, then the best open doorways ahead.
    const candidates: { edge: Visite360Edge; dist: number; priority: number }[] = [];
    const seen = new Set<string>();

    if (this.previousId && this.previousId !== this.currentId) {
      const back = this.outs.get(this.currentId)?.find((e) => e.to === this.previousId);
      if (back) {
        const target = this.nodeById.get(back.to);
        const dist = origin && target ? origin.distanceTo(nodePos(target)) : 200;
        candidates.push({ edge: back, dist, priority: 0 });
        seen.add(back.to);
      }
    }

    for (const item of ranked) {
      if (seen.has(item.edge.to)) continue;
      // Ultra-near stubs sit on door faces — skip (return path exempt above).
      if (item.dist < 125) continue;
      candidates.push({
        edge: item.edge,
        dist: item.dist,
        priority: 1 + Math.abs(item.dist - 260) / 400,
      });
      seen.add(item.edge.to);
    }

    candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
    const neighbors = candidates.slice(0, MAX_HOTSPOTS);
    const out: HotspotScreen[] = [];

    this.camera.getWorldDirection(this.camFwd);
    const minFacing = this.lat < -35 ? 0.35 : 0.12;

    for (const { edge, dist } of neighbors) {
      const target = this.nodeById.get(edge.to);
      /**
       * Floor-plane ring in the doorway bearing (NHC): just inside the threshold.
       * Same classic spherical basis as the camera after the px/nx face swap.
       */
      const yaw = edge.yaw * DEG;
      const ringDist = clamp(dist * 0.4, 100, 200);
      this.tmpPos.set(Math.cos(yaw) * ringDist, -EYE_HEIGHT, Math.sin(yaw) * ringDist);
      const len = this.tmpPos.length();
      if (len < 1e-4) continue;
      const facing = this.tmpPos.dot(this.camFwd) / len;
      if (facing < minFacing) continue;

      const projected = this.tmpPos.project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      const inFront = projected.z < 1 && projected.z > -1;
      const onFloor =
        x > w * 0.03 &&
        x < w * 0.97 &&
        y > h * 0.3 &&
        y < h - 80;
      if (!inFront || !onFloor) continue;

      out.push({
        to: edge.to,
        label: target?.label ?? edge.to,
        x,
        y,
        scale: clamp(1.9 - ringDist / 300, 1.25, 2.15),
        visible: true,
        yaw: edge.yaw,
        pitch: edge.pitch,
      });
    }
    this.onHotspots(out);
  }

  /**
   * Classic Three.js cube panorama (same as webgl_panorama_cube):
   * lon 0 = +X, lon 90 = +Z, lon 180 = −X, lon −90 = −Z.
   * Graph edge.yaw is already authored in this spherical frame for doorway aims.
   */
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

    // NHC settle: face into the room (away from the doorway you just came through).
    const into = this.entryLook(node.id, this.previousId);
    const endLon = into.lon;
    this.anim = {
      phase: "settle",
      t0: performance.now(),
      dur: 520,
      fromLon: this.lon,
      fromLat: this.lat,
      toLon: this.lon + shortestDelta(this.lon, endLon),
      toLat: into.lat,
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
          this.lat = this.anim.toLat;
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
