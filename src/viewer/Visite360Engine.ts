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
 * Standard CubeTextureLoader order. Do NOT swap px/nx — Three.js scene.background
 * samples cube maps with flipEnvMap = -1, so camera look +X shows the −X face (nx).
 */
export const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"] as const;

/**
 * Official NHC / Virtual Visions rail order (same camera ids + aliases as
 * https://nhc.server.virtualvisions.studio/tour?id=cmvqdz4vg09z1qv0vogpoqoii ).
 */
export const PRIMARY_ROOM_ORDER = [
  "10000", // Main Entrance
  "10001", // Dining Entrance
  "10002", // Main Entrance Bathroom
  "10003", // Living Room 1
  "10004", // Hall 1
  "10005", // Hall 3
  "10006", // Kitchen
  "10007", // Hall 4
  "10008", // Hall 5
  "10009", // Bedroom 1
  "10010", // Hall 6
  "10011", // Bedroom 2
  "10012", // Bathroom
  "10013", // Suite Bedroom
  "10014", // Suite Dressing
  "10015", // Suite Bathroom
  "10016", // Dining Room
  "10017", // Hall 2
  "10018", // Living Room 2
] as const;

/**
 * NHC adjacency (camera index → connected indices). Self-links ignored at runtime.
 * Source: Virtual Visions public visit-tour floors[0].cameras[].connections
 */
const NHC_CONNECTIONS: Record<string, readonly string[]> = {
  "10000": ["10001", "10002", "10003", "10016"],
  "10001": ["10000", "10002", "10004"],
  "10002": ["10000", "10001"],
  "10003": ["10000", "10016", "10018"],
  "10004": ["10001", "10005", "10007", "10008", "10010", "10012", "10016", "10017", "10018"],
  "10005": ["10004", "10006", "10007", "10008", "10010", "10012", "10016", "10017", "10018"],
  "10006": ["10005", "10016", "10017", "10018"],
  "10007": ["10004", "10005", "10008", "10010", "10012", "10016", "10017"],
  "10008": ["10004", "10005", "10007", "10009", "10010", "10012", "10016", "10017"],
  "10009": ["10008"],
  "10010": ["10004", "10005", "10007", "10008", "10011", "10012", "10013", "10016", "10017"],
  "10011": ["10010", "10013"],
  "10012": ["10004", "10005", "10007", "10008", "10010", "10017"],
  "10013": ["10010", "10011", "10014"],
  "10014": ["10013", "10015"],
  "10015": ["10014"],
  "10016": ["10000", "10003", "10004", "10005", "10006", "10007", "10008", "10010", "10017", "10018"],
  "10017": ["10004", "10005", "10006", "10007", "10008", "10010", "10012", "10016", "10018"],
  "10018": ["10003", "10004", "10005", "10006", "10016", "10017"],
};

const PRIMARY_ROOM_SET = new Set<string>(PRIMARY_ROOM_ORDER);

/**
 * Layama open-volume looks — used when “opposite the door” faces a wall panel.
 * Tuned against the AXIS cubemaps (not NHC world yaw numbers).
 */
const OPEN_LOOK: Record<string, number> = {
  // Cubemap lon (not graph yaw). Living Room 1 opens toward the stair volume.
  "10003": -90,
};

const DEG = Math.PI / 180;
/**
 * NHC live behavior (verified by walking the official tour):
 * - 1–2 unlabeled floor rings in doorways you face (+ return ring behind).
 * - Rings sit on the floor in the doorway threshold, not at the far node.
 * - Rings vanish when you look at a wall / vanity (view-dependent).
 * - Passage nodes open looking AT doorways; room nodes open INTO the volume.
 * - Entry look must be computed in Layama graph space (NHC world ≠ Layama world).
 */
const MAX_FORWARD_HOTSPOTS = 2;
/** Soft cap for far matrix links; nearest portals always kept. */
const MAX_HOTSPOT_DIST = 420;
const MIN_NEAR_PORTALS = 3;
const EYE_LAT = -5;
/** Layama node Y ≈ eye height — floor for rings is this far below the camera. */
const EYE_HEIGHT = 152;
const DEFAULT_FOV = 72;
/** One ring per doorway bearing — keep real side-by-side doors (NHC often ~30–40° apart). */
const HOTSPOT_GAP = 26;
/** Forward rings only roughly ahead (return ring exempt). */
const FORWARD_CONE = 105;
/** Doorway = fraction of the way to the neighbor node (NHC threshold feel). */
const DOOR_FRAC = 0.7;
const DOOR_DIST_MIN = 180;
const DOOR_DIST_MAX = 340;
/**
 * Slightly above true floor so doorway rings stay inside vertical FOV on
 * tall phone views, while still reading as floor marks in open volumes.
 */
const FLOOR_Y_FACTOR = 0.68;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function wrapLon(lon: number) {
  let v = lon;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

/**
 * Layama graph yaw is atan2(dx, dz) with 0 = +Z.
 * Cubemap panorama lon is atan2(dz, dx) with 0 = +X, then +180 because
 * Layama node axes are mirrored vs the exported cube faces (verified on
 * Main Entrance: Living Room content is opposite the geometric neighbor).
 */
function graphYawToLon(graphYaw: number) {
  return wrapLon(270 - graphYaw);
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
      list.push({
        ...e,
        from,
        to: String(e.to),
        yaw: graphYawToLon(e.yaw),
      });
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

  /** Debug: why rings appear / disappear for the current view. */
  debugHotspots() {
    if (!this.currentId) return { currentId: null };
    const ranked = this.rankedNeighbors(this.currentId);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.getWorldDirection(this.camFwd);
    const probes = ranked.map((r) => {
      const placed = this.projectFloorRing(r.edge.yaw, r.dist, w, h);
      return {
        to: r.edge.to,
        label: this.labelOf(r.edge.to),
        yaw: Math.round(r.edge.yaw),
        dist: Math.round(r.dist),
        door: Math.round(placed.dist),
        ahead: Math.round(Math.abs(shortestDelta(this.lon, r.edge.yaw))),
        facing: Math.round((placed.facing || 0) * 100) / 100,
        x: Math.round(placed.x),
        y: Math.round(placed.y),
        ok: placed.ok,
      };
    });
    return {
      currentId: this.currentId,
      lon: this.lon,
      lat: this.lat,
      fov: this.fov,
      previousId: this.previousId,
      entry: this.entryLook(this.currentId),
      size: { w, h },
      probes,
    };
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
      // Always open looking into the room (NHC), never the closed entrance door.
      this.lon = entry.lon;
      this.lat = entry.lat;
      // Slightly wider so the first frame reads as a room, not a door close-up.
      this.fov = Math.max(destFov, 76);
      this.targetFov = this.fov;
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
    } else if (opts?.fromRail) {
      // Room rail: land in the room's open view (never a wall/door close-up).
      lookLon = entry.lon;
      lookLat = entry.lat;
      approachFov = clamp(this.fov * 0.9, 50, 72);
      approachDur = 420;
    } else if (edge) {
      // Walk via doorway: aim with the authored edge yaw (same frame as rings).
      lookLon = wrapLon(edge.yaw);
      lookLat = approachLookLat(edge.pitch);
      approachFov = clamp(this.fov * 0.64, 42, 58);
      approachDur = 680;
    } else {
      lookLon = entry.lon;
      lookLat = entry.lat;
      approachFov = clamp(this.fov * 0.9, 50, 72);
      approachDur = 600;
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

  private labelOf(nodeId: string) {
    return this.nodeById.get(nodeId)?.label ?? "";
  }

  /** Hall / foyer: open looking at doorways (rings ahead). */
  private isPassage(nodeId: string) {
    const label = this.labelOf(nodeId);
    // "Main Entrance Bathroom" is a room, not a passage.
    if (/bathroom|bedroom|kitchen|living|suite|dressing/i.test(label)) return false;
    return /hall/i.test(label) || /^((dining|main)\s+)?entrance$/i.test(label.trim());
  }

  /** Furnished room: open looking into the volume (sofa / bed / vanity). */
  private isDestinationRoom(nodeId: string) {
    if (this.isPassage(nodeId)) return false;
    return /bedroom|bathroom|kitchen|living|dining|suite|dressing/i.test(this.labelOf(nodeId));
  }

  /**
   * Land look in Layama space (NHC coords are a different world — do not copy yaw numbers).
   * Passages → face nearest destination doorway. Rooms → face into the volume (opposite exit).
   */
  private entryLook(nodeId: string, fromId?: string | null) {
    // Cubemap-specific open volume (beats opposite-door when that hits a wall).
    if (OPEN_LOOK[nodeId] != null) {
      return { lon: wrapLon(OPEN_LOOK[nodeId]), lat: EYE_LAT };
    }

    // After a walk into a room: settle opposite the door you came through.
    if (fromId && fromId !== nodeId && this.isDestinationRoom(nodeId)) {
      const back = this.aimToward(nodeId, fromId);
      if (back) return { lon: wrapLon(back.yaw + 180), lat: EYE_LAT };
    }

    const portals = this.nhcPortals(nodeId);
    if (this.isPassage(nodeId)) {
      // Face the doorway that opens the tour — living/hall over side baths.
      const living = portals.find((p) => /living|dining\s*room/i.test(this.labelOf(p.edge.to)));
      const hall = portals.find((p) => /^hall/i.test(this.labelOf(p.edge.to)));
      const dest = portals.find((p) => this.isDestinationRoom(p.edge.to));
      const aim = living ?? hall ?? dest ?? portals[0];
      if (aim) return { lon: wrapLon(aim.edge.yaw), lat: EYE_LAT };
    }

    if (this.isDestinationRoom(nodeId)) {
      const nearest = portals[0];
      if (nearest) return { lon: wrapLon(nearest.edge.yaw + 180), lat: EYE_LAT };
    }

    // Generic fallback: opposite nearest portal.
    if (portals[0]) return { lon: wrapLon(portals[0].edge.yaw + 180), lat: EYE_LAT };
    return { lon: 0, lat: EYE_LAT };
  }

  private aimToward(fromId: string, toId: string) {
    const from = this.nodeById.get(fromId);
    const to = this.nodeById.get(toId);
    if (!from || !to) return null;
    const d = nodePos(to).sub(nodePos(from));
    if (d.lengthSq() < 1e-6) return null;
    // Camera / panorama frame (mirrored Layama axes — see graphYawToLon).
    const yaw = Math.atan2(d.z, d.x) / DEG + 180;
    const pitch = Math.asin(clamp(d.y / d.length(), -1, 1)) / DEG;
    return { yaw: wrapLon(yaw), pitch: clamp(pitch, -55, 55) };
  }

  /** Physical doorway distance — never past the neighbor node. */
  private doorDist(nodeDist: number) {
    const maxAllowed = Math.min(DOOR_DIST_MAX, Math.max(40, nodeDist * 0.85));
    const minAllowed = Math.min(DOOR_DIST_MIN, maxAllowed);
    return clamp(nodeDist * DOOR_FRAC, minAllowed, maxAllowed);
  }

  /** Pitch that aims the camera at the floor ring (walk-in dive). */
  private ringPitch(doorDistance: number) {
    return clamp(
      Math.atan2(-EYE_HEIGHT * FLOOR_Y_FACTOR, doorDistance) / DEG,
      -45,
      -8,
    );
  }

  /**
   * Project a floor ring in the doorway bearing at a real threshold distance.
   * No screen-Y hunting — that was putting rings on walls.
   */
  private projectFloorRing(yawDeg: number, nodeDist: number, w: number, h: number) {
    const yaw = yawDeg * DEG;
    const dist = this.doorDist(nodeDist);
    const floorY = -EYE_HEIGHT * FLOOR_Y_FACTOR;
    this.tmpPos.set(Math.cos(yaw) * dist, floorY, Math.sin(yaw) * dist);
    const len = this.tmpPos.length();
    if (len < 1e-4) {
      return { dist, x: 0, y: 0, z: 1, facing: -1, ok: false };
    }
    const facing = this.tmpPos.dot(this.camFwd) / len;
    const projected = this.tmpPos.clone().project(this.camera);
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    const inFront = projected.z < 1 && projected.z > -1;
    // Floor band above the room rail (rail ~bottom 8%).
    const onFloor =
      x > w * 0.02 &&
      x < w * 0.98 &&
      y > h * 0.4 &&
      y < h * 0.86;
    return {
      dist,
      x,
      y,
      z: projected.z,
      facing,
      ok: inFront && onFloor && facing > 0.05,
    };
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

  /**
   * Aim at a neighbor. Prefer authored graph yaw (doorway-tuned) when it
   * agrees with geometry; otherwise use geometric bearing.
   */
  private edgeTo(fromId: string, toId: string): Visite360Edge | null {
    const from = this.nodeById.get(fromId);
    const to = this.nodeById.get(toId);
    if (!from || !to) {
      return this.outs.get(fromId)?.find((e) => e.to === toId) ?? null;
    }
    const aim = this.aimToward(fromId, toId);
    const existing = this.outs.get(fromId)?.find((e) => e.to === toId);
    const dist = nodePos(from).distanceTo(nodePos(to));
    const door = this.doorDist(dist);
    const pitch = this.ringPitch(door);
    if (aim && existing) {
      const close = Math.abs(shortestDelta(existing.yaw, aim.yaw)) < 28;
      return {
        from: fromId,
        to: toId,
        yaw: close ? existing.yaw : aim.yaw,
        pitch,
      };
    }
    if (aim) return { from: fromId, to: toId, yaw: aim.yaw, pitch };
    if (existing) return { ...existing, pitch };
    return null;
  }

  /** Official NHC portals from this node, nearest first (Layama distances). */
  private nhcPortals(nodeId: string) {
    const cur = this.nodeById.get(nodeId);
    if (!cur) return [] as { edge: Visite360Edge; dist: number; dy: number; score: number }[];
    const origin = nodePos(cur);
    const allowed = NHC_CONNECTIONS[nodeId] ?? [];
    const ranked: { edge: Visite360Edge; dist: number; dy: number; score: number }[] = [];

    for (const toId of allowed) {
      if (toId === nodeId) continue;
      if (PRIMARY_ROOM_SET.size && !PRIMARY_ROOM_SET.has(toId)) continue;
      const target = this.nodeById.get(toId);
      const edge = this.edgeTo(nodeId, toId);
      if (!target || !edge) continue;
      const p = nodePos(target);
      const dist = origin.distanceTo(p);
      const dy = Math.abs(p.y - origin.y);
      ranked.push({ edge, dist, dy, score: dist + dy * 0.2 });
    }
    ranked.sort((a, b) => a.score - b.score || a.dist - b.dist);
    return ranked.filter(
      (item, i) => i < MIN_NEAR_PORTALS || item.dist <= MAX_HOTSPOT_DIST,
    );
  }

  private rankedNeighbors(nodeId: string) {
    // Nearest doorway first. When two portals share a bearing, keep the nearer
    // (e.g. Dining Entrance over Bathroom) — matches NHC entrance rings.
    const unique: ReturnType<Visite360Engine["nhcPortals"]> = [];
    for (const item of this.nhcPortals(nodeId)) {
      const clash = unique.some(
        (u) => Math.abs(shortestDelta(u.edge.yaw, item.edge.yaw)) < HOTSPOT_GAP,
      );
      if (!clash) unique.push(item);
    }
    return unique;
  }

  private prefetchNeighbors(nodeId: string) {
    for (const { edge } of this.rankedNeighbors(nodeId).slice(0, 3)) {
      void this.loadFaces(edge.to).catch(() => {});
    }
    if (this.previousId) void this.loadFaces(this.previousId).catch(() => {});
  }

  private applyCamera() {
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    // lon 0 = +X look → nx hallway (Three.js flipEnvMap); lon 180 → px door.
    this.dirFromYawPitch(this.lon, this.lat, this.tmpDir);
    this.camera.lookAt(this.tmpDir.x, this.tmpDir.y, this.tmpDir.z);
  }

  private emitHotspots() {
    if (!this.currentId || !this.onHotspots) return;
    if (this.anim) {
      this.onHotspots([]);
      return;
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 2 || h < 2) {
      this.onHotspots([]);
      return;
    }

    const ranked = this.rankedNeighbors(this.currentId);
    const cur = this.nodeById.get(this.currentId);
    const origin = cur ? nodePos(cur) : null;
    const picks: { edge: Visite360Edge; dist: number; isReturn: boolean }[] = [];
    const seen = new Set<string>();

    // NHC return ring — turn around and the portal you came from is still walkable.
    if (this.previousId && this.previousId !== this.currentId) {
      const back = this.edgeTo(this.currentId, this.previousId);
      if (back) {
        const target = this.nodeById.get(back.to);
        const dist = origin && target ? origin.distanceTo(nodePos(target)) : 200;
        picks.push({ edge: back, dist, isReturn: true });
        seen.add(back.to);
      }
    }

    // Forward doorways only — rings must sit in the view you are facing (entrance feel).
    let forwardCount = 0;
    for (const item of ranked) {
      if (forwardCount >= MAX_FORWARD_HOTSPOTS) break;
      if (seen.has(item.edge.to)) continue;
      const ahead = Math.abs(shortestDelta(this.lon, item.edge.yaw));
      if (ahead > FORWARD_CONE) continue;
      picks.push({ edge: item.edge, dist: item.dist, isReturn: false });
      seen.add(item.edge.to);
      forwardCount += 1;
    }

    const out: HotspotScreen[] = [];
    this.camera.getWorldDirection(this.camFwd);

    for (const { edge, dist, isReturn } of picks) {
      const target = this.nodeById.get(edge.to);
      const placed = this.projectFloorRing(edge.yaw, dist, w, h);
      // Return ring stays hidden until the user turns toward it.
      if (!placed.ok) continue;
      if (!isReturn && placed.facing < 0.08) continue;

      out.push({
        to: edge.to,
        label: target?.label ?? edge.to,
        x: placed.x,
        y: placed.y,
        scale: clamp(1.9 - placed.dist / 280, 1.15, 1.85),
        visible: true,
        yaw: edge.yaw,
        pitch: this.ringPitch(placed.dist),
      });
    }
    this.onHotspots(out);
  }

  /**
   * Classic Three.js cube panorama lon/lat:
   * lon 0 = +X, lon 90 = +Z, lon 180 = −X, lon −90 = −Z.
   * Graph edge yaw is converted to this frame in loadGraph.
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

    // NHC settle after walk-in: snap to official look_at (into the room), not the door.
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
