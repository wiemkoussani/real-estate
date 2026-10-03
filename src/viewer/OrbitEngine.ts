"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  COMPLEX,
  STATUS_COLOR,
  type Unit,
  type UnitStatus,
} from "@/lib/complex";
import { tourFrameUrl, type TourMedia } from "@/lib/tour";

export type EngineEvents = {
  onFrame?: (index: number) => void;
  onHover?: (unit: Unit | null, pos?: { x: number; y: number }) => void;
  onSelect?: (unit: Unit) => void;
  onEmptyClick?: () => void;
  onLoadProgress?: (pct: number) => void;
  onReady?: () => void;
};

const MIN_BG_WIDTH = 1600;
const MAX_BG_WIDTH = 8192;

export class OrbitEngine {
  private container: HTMLElement;
  private bg: HTMLCanvasElement;
  private bgNext: HTMLCanvasElement;
  private threeCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ctxNext: CanvasRenderingContext2D;
  private events: EngineEvents;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private activeCamera = new THREE.PerspectiveCamera(COMPLEX.defaultFov, 1, 0.1, 100000);
  private glbCameras: THREE.Camera[] = [];
  private unitMeshes: Record<string, THREE.Mesh> = {};
  private clickable: THREE.Object3D[] = [];
  private units: Record<string, Unit> = {};

  private currentFrame = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private panMode = false;
  private overlayVisible = false;
  private statusFilter: "all" | UnitStatus = "all";
  private focusedId: string | null = null;
  private hoveredId: string | null = null;
  private previewId: string | null = null;
  private frameHeadings: number[] = [];
  private approaching = false;
  private zoomOx = 0;
  private zoomOy = 0;
  private isDragging = false;
  private isNavigating = false;
  private dragStartX = 0;
  private panStartX = 0;
  private panStartY = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private moved = false;
  private rafDraw: number | null = null;
  private rafLoop: number | null = null;
  private upgradeTimer: number | null = null;
  private crossfadeId: number | null = null;
  private disposed = false;

  private lowImages: HTMLImageElement[] = [];
  private highImages: (HTMLImageElement | null)[] = [];
  private lowBitmaps: (ImageBitmap | null)[] = [];
  private highBitmaps: (ImageBitmap | null)[] = [];
  private lowDecodeQueued = new Set<number>();
  private lowDecodeDone = new Set<number>();
  private highDecodeQueued = new Set<number>();
  private tour: TourMedia;

  constructor(
    container: HTMLElement,
    canvases: { bg: HTMLCanvasElement; bgNext: HTMLCanvasElement; three: HTMLCanvasElement },
    events: EngineEvents = {},
    tour: TourMedia,
  ) {
    this.container = container;
    this.bg = canvases.bg;
    this.bgNext = canvases.bgNext;
    this.threeCanvas = canvases.three;
    this.events = events;
    this.tour = tour;

    const ctx = this.bg.getContext("2d");
    const ctxNext = this.bgNext.getContext("2d");
    if (!ctx || !ctxNext) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.ctxNext = ctxNext;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.threeCanvas,
      alpha: true,
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  async start() {
    this.bind();
    this.resize();
    await this.loadOne(0);
    this.events.onLoadProgress?.(28);
    void this.loadGlb();
    await this.loadUnits();
    this.syncCamera();
    this.draw("low");
    this.loop();
    this.scheduleUpgrade();
    this.events.onReady?.();
    void this.preloadLow();
  }

  dispose() {
    this.disposed = true;
    if (this.rafLoop) cancelAnimationFrame(this.rafLoop);
    if (this.rafDraw) cancelAnimationFrame(this.rafDraw);
    if (this.upgradeTimer) window.clearTimeout(this.upgradeTimer);
    if (this.crossfadeId) cancelAnimationFrame(this.crossfadeId);
    this.unbind();
    this.lowBitmaps.forEach((b) => b?.close());
    this.highBitmaps.forEach((b) => b?.close());
    this.renderer.dispose();
  }

  getFrame() {
    return this.currentFrame;
  }

  getHeading() {
    return this.frameHeadings[this.currentFrame] ?? 0;
  }

  getHeadingDir() {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
    return dirs[Math.round(this.getHeading() / 45) % 8];
  }

  rotateToNextCardinal() {
    const h = this.getHeading();
    const dirIndex = Math.round(h / 45) % 8;
    this.rotateToHeading((dirIndex + 1) * 45);
  }

  rotateToHeading(targetHeading: number) {
    if (!this.frameHeadings.length) return;
    let best = this.currentFrame;
    let bestDist = Infinity;
    this.frameHeadings.forEach((heading, i) => {
      const d = Math.min(Math.abs(heading - targetHeading), 360 - Math.abs(heading - targetHeading));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best === this.currentFrame) return;
    const n = this.tour.totalFrames;
    const dir = best > this.currentFrame ? 1 : -1;
    this.clearCrossfade();
    this.isNavigating = true;
    this.currentFrame = best;
    this.warmAround(this.currentFrame, dir);
    this.draw("low");
    this.syncCamera();
    this.events.onFrame?.(this.currentFrame);
    this.scheduleUpgrade();
    void n;
  }

  setOverlayVisible(v: boolean) {
    this.overlayVisible = v;
    this.syncMeshVisibility();
  }

  setStatusFilter(v: "all" | UnitStatus) {
    this.statusFilter = v;
    this.syncMeshVisibility();
  }

  setFocus(id: string | null) {
    this.focusedId = id;
    this.syncMeshVisibility();
  }

  setPreview(id: string | null) {
    this.previewId = id;
    this.syncMeshVisibility();
  }

  resetView() {
    this.clearCrossfade();
    this.bgNext.width = 1;
    this.bgNext.height = 1;
    this.focusedId = null;
    this.previewId = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
    this.syncMeshVisibility();
    this.draw("low");
    this.settle();
  }

  settle() {
    this.isNavigating = false;
    this.fadeToHigh(this.currentFrame);
  }

  setPanMode(v: boolean) {
    this.panMode = v;
    this.container.classList.toggle("hand-mode", v);
    this.container.style.cursor = v ? "grab" : "";
    if (v && this.zoom < 2) this.zoom = 2;
    this.applyTransform();
  }

  zoomBy(delta: number) {
    const min = this.panMode ? 1.25 : COMPLEX.zoomMin;
    const next = Math.min(COMPLEX.zoomMax, Math.max(min, this.zoom + delta));
    if (next === this.zoom) return false;
    this.zoom = next;
    this.applyTransform();
    this.scheduleUpgrade();
    return true;
  }

  rotateBy(dir: 1 | -1) {
    const n = this.tour.totalFrames;
    if (!n) return;
    this.clearCrossfade();
    this.isNavigating = true;
    this.currentFrame = (this.currentFrame + dir + n) % n;
    this.warmAround(this.currentFrame, dir);
    this.draw("low");
    this.syncCamera();
    this.events.onFrame?.(this.currentFrame);
    void this.ensureHigh((this.currentFrame + dir + n) % n);
    this.scheduleUpgrade();
  }

  private clearCrossfade() {
    if (this.crossfadeId) cancelAnimationFrame(this.crossfadeId);
    this.crossfadeId = null;
    this.bgNext.style.opacity = "0";
    this.ctxNext.setTransform(1, 0, 0, 1, 0, 0);
    this.ctxNext.clearRect(0, 0, this.bgNext.width, this.bgNext.height);
  }

  private bind() {
    this.container.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    this.container.addEventListener("touchstart", this.onTouchStart, { passive: true });
    window.addEventListener("touchmove", this.onTouchMove, { passive: false });
    window.addEventListener("touchend", this.onPointerUp);
    this.container.addEventListener("mouseleave", this.onLeave);
    this.container.addEventListener("wheel", this.onWheel, { passive: false });
    this.container.addEventListener("click", this.onClick);
    window.addEventListener("resize", this.onResize);
  }

  private unbind() {
    this.container.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.container.removeEventListener("touchstart", this.onTouchStart);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onPointerUp);
    this.container.removeEventListener("mouseleave", this.onLeave);
    this.container.removeEventListener("wheel", this.onWheel);
    this.container.removeEventListener("click", this.onClick);
    window.removeEventListener("resize", this.onResize);
  }

  private onResize = () => this.resize();

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    if (this.zoom === 1) {
      this.zoomOx = w / 2;
      this.zoomOy = h / 2;
    }
    this.applyTransform();
    this.syncCamera();
    if (this.lowImages[this.currentFrame]?.complete) this.draw("high");
  }

  private loadOne(idx: number) {
    return new Promise<void>((resolve) => {
      const existing = this.lowImages[idx];
      if (existing?.complete && existing.naturalWidth) {
        resolve();
        return;
      }
      const src = tourFrameUrl(this.tour, idx, "low");
      if (!src) {
        resolve();
        return;
      }
      const img = existing ?? new Image();
      img.decoding = "async";
      this.lowImages[idx] = img;
      if (img.complete && img.naturalWidth) {
        void this.warmLow(idx);
        resolve();
        return;
      }
      const done = () => {
        void this.warmLow(idx);
        if (idx === this.currentFrame) this.draw("low");
        resolve();
      };
      img.onload = done;
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  private async preloadLow() {
    const total = this.tour.totalFrames;
    if (!total) {
      this.events.onLoadProgress?.(100);
      return;
    }
    let loaded = this.lowImages.filter((img) => img?.complete).length;
    const order = [0, 1, total - 1, 14, ...Array.from({ length: total }, (_, i) => i).filter((i) => i !== 0 && i !== 1 && i !== 14 && i !== total - 1)];
    const batch = 6;
    for (let start = 0; start < total; start += batch) {
      if (this.disposed) return;
      const slice = order.slice(start, start + batch);
      await Promise.all(slice.map((idx) => this.loadOne(idx)));
      loaded = Math.min(total, loaded + slice.length);
      this.events.onLoadProgress?.(Math.min(99, 28 + Math.round((loaded / total) * 72)));
    }
    this.events.onLoadProgress?.(100);
  }

  private async loadGlb() {
    const loader = new GLTFLoader();
    if (!this.tour.glbUrl) return;
    const gltf = await loader.loadAsync(this.tour.glbUrl);
    this.scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld(true);

    const registerCam = (cam: THREE.Camera) => {
      if (cam.name.includes(".Target")) return;
      const match = cam.name.match(/camera(\d+)/i);
      if (match) this.glbCameras[parseInt(match[1], 10) - 1] = cam;
    };
    gltf.cameras.forEach(registerCam);
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Camera) registerCam(obj);
      if (!(obj instanceof THREE.Mesh)) return;
      if (COMPLEX.maskNames.includes(obj.name) || !obj.name.startsWith("jjjjjjjjj_ID")) {
        obj.visible = false;
        return;
      }
      obj.material = new THREE.MeshBasicMaterial({
        color: STATUS_COLOR.available,
        transparent: true,
        opacity: COMPLEX.overlayOpacity,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      obj.userData.targetOpacity = COMPLEX.overlayOpacity;
      obj.renderOrder = 1;
      obj.visible = false;
      this.unitMeshes[obj.name] = obj;
      this.clickable.push(obj);
    });

    const mask =
      gltf.scene.getObjectByName("jijijijijiji") ??
      gltf.scene.getObjectByName(COMPLEX.maskNames[0]);
    if (mask instanceof THREE.Mesh) {
      mask.material = new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        side: THREE.FrontSide,
      });
      mask.renderOrder = 0;
      mask.visible = true;
    }
    this.computeHeadings();
    this.syncCamera();
    this.events.onFrame?.(this.currentFrame);
  }

  private computeHeadings() {
    this.frameHeadings = [];
    const v = new THREE.Vector3();
    let prev: number | null = null;
    let accum = 0;
    const n = Math.max(this.tour.totalFrames, this.glbCameras.length);
    for (let i = 0; i < n; i++) {
      const cam = this.glbCameras[i];
      if (!cam) {
        this.frameHeadings[i] = i > 0 ? this.frameHeadings[i - 1] : 0;
        continue;
      }
      cam.getWorldDirection(v);
      const yaw = Math.atan2(v.x, v.z);
      if (prev !== null) {
        let d = yaw - prev;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        accum += d;
      }
      prev = yaw;
      this.frameHeadings[i] = ((accum * 180) / Math.PI % 360 + 360) % 360;
    }
  }

  private async loadUnits() {
    let list: Unit[] = this.tour.units.slice();
    if (!list.length) {
      try {
        const api = await fetch(`/api/complexes/${this.tour.slug}`, { cache: "no-store" });
        if (api.status === 404 || api.status === 403) return;
        if (api.ok) {
          const json = (await api.json()) as { units?: Unit[] };
          if (json.units?.length) list = json.units;
        }
      } catch {
        /* ignore */
      }
    }
    list.forEach((u) => {
      this.units[u.id] = u;
    });
    Object.entries(this.unitMeshes).forEach(([name, mesh]) => {
      const unit = this.units[name];
      if (!unit) {
        mesh.visible = false;
        this.clickable = this.clickable.filter((o) => o !== mesh);
        return;
      }
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(STATUS_COLOR[unit.status as UnitStatus] ?? 0x94a3b0);
      mat.needsUpdate = true;
    });
    this.syncMeshVisibility();
    this.events.onLoadProgress?.(100);
  }

  getUnits() {
    return Object.values(this.units);
  }

  highlight(id: string | null) {
    this.focusedId = id;
    this.syncMeshVisibility();
  }

  async approach(id: string) {
    const mesh = this.unitMeshes[id];
    if (!mesh) return;
    this.approaching = true;
    this.isNavigating = false;
    this.highlight(id);
    this.syncCamera();
    const { cw, ch } = this.getDrawRect();
    const box = new THREE.Box3().setFromObject(mesh);
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    corners.forEach((p) => {
      p.project(this.activeCamera);
      const sx = (p.x * 0.5 + 0.5) * cw;
      const sy = (-p.y * 0.5 + 0.5) * ch;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    });
    const villaX = (minX + maxX) / 2;
    const villaY = (minY + maxY) / 2;
    const bw = Math.max(24, maxX - minX);
    const bh = Math.max(24, maxY - minY);
    const fill = COMPLEX.approachFill;
    const toZoom = Math.min(COMPLEX.zoomMax, Math.max(3.4, Math.min((cw * fill) / bw, (ch * fill) / bh)));
    const fromZoom = this.zoom;
    const fromPanX = this.panX;
    const fromPanY = this.panY;
    const toPanX = toZoom * (cw / 2 - villaX);
    const toPanY = toZoom * (ch / 2 - villaY);
    await this.ensureHigh(this.currentFrame, toZoom);
    this.draw("high");
    this.applyTransform();
    const duration = 1100;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - t, 3);
        this.zoom = fromZoom + (toZoom - fromZoom) * e;
        this.panX = fromPanX + (toPanX - fromPanX) * e;
        this.panY = fromPanY + (toPanY - fromPanY) * e;
        this.applyTransform();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    this.zoom = toZoom;
    this.panX = toPanX;
    this.panY = toPanY;
    this.applyTransform();
    this.approaching = false;
    this.settle();
  }

  private paintUnitColor(mesh: THREE.Mesh, unit: Unit) {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(STATUS_COLOR[unit.status as UnitStatus] ?? 0x94a3b0);
    mat.needsUpdate = true;
  }

  private syncMeshVisibility() {
    Object.entries(this.unitMeshes).forEach(([name, mesh]) => {
      const unit = this.units[name];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (!unit) {
        mesh.visible = false;
        return;
      }
      const inFilter = this.statusFilter === "all" || unit.status === this.statusFilter;
      const highlighted = this.focusedId === name || this.hoveredId === name || this.previewId === name;
      this.paintUnitColor(mesh, unit);
      if (!inFilter && !highlighted) {
        mesh.visible = false;
        mesh.userData.targetOpacity = 0;
        mat.opacity = 0;
        return;
      }
      mesh.visible = this.overlayVisible || highlighted;
      if (highlighted) mesh.userData.targetOpacity = COMPLEX.hoverOverlayOpacity;
      else if (this.overlayVisible) mesh.userData.targetOpacity = COMPLEX.showAllOpacity;
      else mesh.userData.targetOpacity = 0;
      if (!mesh.visible) mat.opacity = 0;
    });
  }

  private getDrawRect() {
    const RW = this.tour.renderW;
    const RH = this.tour.renderH;
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    const scale = Math.max(cw / RW, ch / RH);
    const dw = RW * scale;
    const dh = RH * scale;
    return { cw, ch, dw, dh, dx: (cw - dw) / 2, dy: (ch - dh) / 2 };
  }

  private paint(ctx: CanvasRenderingContext2D, img: CanvasImageSource, quality: "low" | "high") {
    const { cw, ch, dw, dh, dx, dy } = this.getDrawRect();
    const { dpr, scale, w, h } = this.getBgSize(quality);
    const canvas = ctx.canvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private bgCapWidth(quality: "low" | "high") {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = this.container.clientWidth;
    if (quality === "low") return Math.min(2048, Math.max(MIN_BG_WIDTH, Math.round(cw * dpr * 0.9)));
    return Math.min(MAX_BG_WIDTH, Math.round(cw * dpr));
  }

  private getBgScale(quality: "low" | "high") {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = this.container.clientWidth;
    const dev = Math.max(1, cw * dpr);
    if (quality === "low") return Math.min(1, this.bgCapWidth("low") / dev);
    return Math.min(MAX_BG_WIDTH / dev, 1);
  }

  private getBgSize(quality: "low" | "high") {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cw, ch } = this.getDrawRect();
    const scale = this.getBgScale(quality);
    return { dpr, scale, w: Math.round(cw * dpr * scale), h: Math.round(ch * dpr * scale) };
  }

  private lowDecodeTarget(img: HTMLImageElement) {
    const { cw } = this.getDrawRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const srcW = img.naturalWidth || 1280;
    const srcH = img.naturalHeight || 720;
    const targetW = Math.min(srcW, 1280, Math.max(1024, Math.ceil(cw * dpr * 0.9)));
    const targetH = Math.round(targetW * (srcH / srcW));
    return { targetW, targetH };
  }

  private highDecodeTarget(img: HTMLImageElement, zoom = this.zoom) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { cw } = this.getDrawRect();
    const srcW = img.naturalWidth || this.tour.renderW;
    const srcH = img.naturalHeight || this.tour.renderH;
    const targetW = Math.min(srcW, MAX_BG_WIDTH, Math.max(1600, Math.ceil(cw * dpr * zoom)));
    const targetH = Math.round(targetW * (srcH / srcW));
    return { targetW, targetH };
  }

  private ensureHigh(index: number, zoom = this.zoom): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => resolve();
      let highImg = this.highImages[index];
      const decode = (img: HTMLImageElement) => {
        if (typeof createImageBitmap !== "function") {
          finish();
          return;
        }
        const { targetW, targetH } = this.highDecodeTarget(img, zoom);
        createImageBitmap(img, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: "high" })
          .then((bmp) => {
            this.highBitmaps[index]?.close();
            this.highBitmaps[index] = bmp;
            this.highDecodeQueued.add(index);
            finish();
          })
          .catch(finish);
      };
      if (highImg?.complete && highImg.naturalWidth) {
        decode(highImg);
        return;
      }
      highImg = new Image();
      this.highImages[index] = highImg;
      highImg.onload = () => decode(highImg!);
      highImg.onerror = finish;
      highImg.src = tourFrameUrl(this.tour, index, "high");
    });
  }

  private warmLow(index: number): Promise<void> {
    if (this.lowDecodeQueued.has(index)) {
      return Promise.resolve();
    }
    const img = this.lowImages[index];
    if (!img?.complete) return Promise.resolve();
    this.lowDecodeQueued.add(index);
    if (typeof createImageBitmap !== "function") {
      this.lowDecodeDone.add(index);
      return Promise.resolve();
    }
    const { targetW, targetH } = this.lowDecodeTarget(img);
    return createImageBitmap(img, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: "low" })
      .then((bmp) => {
        this.lowBitmaps[index] = bmp;
        this.lowDecodeDone.add(index);
      })
      .catch(() => {
        this.lowDecodeDone.add(index);
      });
  }

  private warmAround(current: number, dir = 0) {
    const n = this.tour.totalFrames;
    if (!n) return;
    this.warmLow(current);
    const ahead = dir === 0 ? 12 : 18;
    const behind = dir === 0 ? 12 : 6;
    for (let d = 1; d <= ahead; d++) this.warmLow((current + (dir || 1) * d + n * 2) % n);
    for (let d = 1; d <= behind; d++) this.warmLow((current - (dir || 1) * d + n * 2) % n);
  }

  private requestDraw() {
    if (this.rafDraw !== null) return;
    this.rafDraw = requestAnimationFrame(() => {
      this.rafDraw = null;
      this.draw("low");
      this.syncCamera();
    });
  }

  private draw(quality: "low" | "high") {
    const wantHigh = quality === "high" && (!this.isNavigating || this.approaching);
    const high = this.highBitmaps[this.currentFrame] || this.highImages[this.currentFrame];
    const img = wantHigh
      ? high || this.lowBitmaps[this.currentFrame] || this.lowImages[this.currentFrame]
      : this.lowBitmaps[this.currentFrame] || this.lowImages[this.currentFrame];
    if (!img) return;
    if (img instanceof HTMLImageElement && (!img.complete || !img.naturalWidth)) return;
    this.paint(this.ctx, img as CanvasImageSource, wantHigh && high ? "high" : "low");
    if (!wantHigh) this.scheduleUpgrade();
  }

  private scheduleUpgrade() {
    if (this.upgradeTimer) window.clearTimeout(this.upgradeTimer);
    this.upgradeTimer = window.setTimeout(() => {
      this.isNavigating = false;
      this.fadeToHigh(this.currentFrame);
    }, COMPLEX.lowResUpgradeDelay);
  }

  private fadeToHigh(index: number) {
    if (this.isNavigating || this.currentFrame !== index) return;
    let highImg = this.highImages[index];
    if (!highImg) {
      highImg = new Image();
      this.highImages[index] = highImg;
      highImg.onload = () => {
        if (this.currentFrame === index) this.fadeToHigh(index);
      };
      highImg.src = tourFrameUrl(this.tour, index, "high");
      return;
    }
    if (!highImg.complete) return;
    if (this.highBitmaps[index]) {
      this.draw("high");
      return;
    }
    if (this.highDecodeQueued.has(index)) return;
    this.highDecodeQueued.add(index);
    if (typeof createImageBitmap !== "function") {
      this.draw("high");
      return;
    }
    const { targetW, targetH } = this.highDecodeTarget(highImg);
    createImageBitmap(highImg, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: "high" })
      .then((bmp) => {
        this.highBitmaps[index]?.close();
        this.highBitmaps[index] = bmp;
        this.pruneHigh(index);
        if (this.currentFrame === index && !this.isNavigating) this.draw("high");
      })
      .catch(() => {
        this.highDecodeQueued.delete(index);
      });
  }

  private pruneHigh(current: number) {
    const n = this.tour.totalFrames;
    if (!n) return;
    const keep = new Set(
      [-2, -1, 0, 1, 2].map((d) => (current + d + n) % n),
    );
    this.highBitmaps.forEach((bmp, i) => {
      if (!bmp || keep.has(i)) return;
      bmp.close();
      this.highBitmaps[i] = null;
      this.highDecodeQueued.delete(i);
      this.highImages[i] = null;
    });
  }

  private crossfadeHigh(index: number) {
    if (this.currentFrame !== index || this.isNavigating) return;
    this.draw("high");
  }

  private syncCamera() {
    const cam = this.glbCameras[this.currentFrame];
    if (!cam) return;
    cam.updateMatrixWorld(true);
    this.activeCamera.copy(cam);
    this.activeCamera.layers.enableAll();
    const dist = this.activeCamera.position.length();
    this.activeCamera.near = dist * 0.001;
    this.activeCamera.far = Math.max(dist * 10, 100000);
    const { cw, ch, dw, dh, dx, dy } = this.getDrawRect();
    this.activeCamera.aspect = dw / dh;
    this.activeCamera.setViewOffset(dw, dh, -dx, -dy, cw, ch);
    this.activeCamera.updateProjectionMatrix();
    this.renderer.setViewport(0, 0, cw, ch);
    this.renderer.setScissorTest(false);
  }

  private applyTransform() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.zoomOx = w / 2;
    this.zoomOy = h / 2;
    const maxX = Math.max(0, (w * (this.zoom - 1)) / 2);
    const maxY = Math.max(0, (h * (this.zoom - 1)) / 2);
    this.panX = Math.min(maxX, Math.max(-maxX, this.panX));
    this.panY = Math.min(maxY, Math.max(-maxY, this.panY));
    const t = `translate3d(${this.zoomOx + this.panX}px, ${this.zoomOy + this.panY}px, 0) scale(${this.zoom}) translate3d(${-this.zoomOx}px, ${-this.zoomOy}px, 0)`;
    [this.bg, this.bgNext, this.threeCanvas].forEach((el) => {
      el.style.transformOrigin = "0 0";
      el.style.willChange = "transform";
      el.style.transform = t;
    });
  }

  private uiBlock(t: EventTarget | null) {
    return (t as HTMLElement | null)?.closest("button, a, input, select, nav, .hud, .panel, .modal, .tour, .detail, .bottom-controls, .rail");
  }

  private beginDrag(x: number, y: number) {
    this.isDragging = true;
    this.isNavigating = !this.panMode;
    this.moved = false;
    this.dragStartX = x;
    this.panStartX = x;
    this.panStartY = y;
    if (this.panMode) {
      if (this.zoom < 2) {
        this.zoom = 2;
        this.applyTransform();
      }
      this.container.style.cursor = "grabbing";
    }
  }

  private dragTo(x: number, y: number) {
    if (this.panMode) {
      this.moved = true;
      this.panX += x - this.panStartX;
      this.panY += y - this.panStartY;
      this.panStartX = x;
      this.panStartY = y;
      this.applyTransform();
      return;
    }
    const delta = x - this.dragStartX;
    if (Math.abs(delta) < COMPLEX.dragSensitivity) return;
    const n = this.tour.totalFrames;
    if (!n) return;
    const dir = delta > 0 ? -1 : 1;
    this.moved = true;
    this.clearCrossfade();
    this.currentFrame = (this.currentFrame + dir + n) % n;
    this.warmAround(this.currentFrame, dir);
    this.requestDraw();
    this.events.onFrame?.(this.currentFrame);
    this.dragStartX = x;
  }

  private endDrag = () => {
    this.isDragging = false;
    this.pointers.clear();
    this.pinchStartDist = 0;
    if (this.panMode) this.container.style.cursor = "grab";
    this.scheduleUpgrade();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.approaching || e.button !== 0) return;
    if (this.uiBlock(e.target)) return;
    e.preventDefault();
    try {
      this.container.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.beginDrag(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) {
      if (!this.panMode && e.pointerType === "mouse") this.hover(e);
      return;
    }
    this.dragTo(e.clientX, e.clientY);
  };

  private onPointerUp = (e?: Event) => {
    if (e && "pointerId" in e) {
      try {
        const id = (e as PointerEvent).pointerId;
        if (this.container.hasPointerCapture(id)) this.container.releasePointerCapture(id);
      } catch {
        /* ignore */
      }
    }
    this.endDrag();
  };

  private onTouchStart = (e: TouchEvent) => {
    if (this.approaching) return;
    if (this.uiBlock(e.target)) return;
    const t = e.touches[0];
    if (!t) return;
    if (e.touches.length === 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      this.pinchStartDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      this.pinchStartZoom = this.zoom;
      return;
    }
    this.beginDrag(t.clientX, t.clientY);
  };

  private onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const a = e.touches[0];
      const b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (this.pinchStartDist > 0) {
        this.zoom = Math.min(COMPLEX.zoomMax, Math.max(COMPLEX.zoomMin, this.pinchStartZoom * (dist / this.pinchStartDist)));
        this.applyTransform();
      }
      return;
    }
    if (!this.isDragging) return;
    e.preventDefault();
    const t = e.touches[0];
    if (t) this.dragTo(t.clientX, t.clientY);
  };

  private loop = () => {
    if (this.disposed) return;
    this.rafLoop = requestAnimationFrame(this.loop);
    Object.values(this.unitMeshes).forEach((m) => {
      const mat = m.material as THREE.MeshBasicMaterial;
      const target = m.userData.targetOpacity;
      if (typeof target !== "number") return;
      if (Math.abs(mat.opacity - target) > 0.002) mat.opacity += (target - mat.opacity) * 0.18;
      else mat.opacity = target;
    });
    this.renderer.render(this.scene, this.activeCamera);
  };

  private onLeave = () => {
    this.hoveredId = null;
    this.syncMeshVisibility();
    this.events.onHover?.(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY > 0 ? -COMPLEX.zoomStep : COMPLEX.zoomStep);
  };

  private hover(e: MouseEvent) {
    const unit = this.hit(e);
    this.hoveredId = unit?.id ?? null;
    this.syncMeshVisibility();
    if (!unit) {
      this.events.onHover?.(null);
      return;
    }
    const mesh = this.unitMeshes[unit.id];
    const world = new THREE.Vector3();
    mesh.getWorldPosition(world);
    const box = new THREE.Box3().setFromObject(mesh);
    const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    top.project(this.activeCamera);
    const rect = this.threeCanvas.getBoundingClientRect();
    const x = rect.left + (top.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-top.y * 0.5 + 0.5) * rect.height;
    this.events.onHover?.(unit, { x, y });
  }

  private onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("button, a, input, select, nav, .hud, .panel, .modal, .tour, .detail, .bottom-controls, .rail")) return;
    if (this.moved || this.approaching || this.panMode) return;
    const unit = this.hit(e);
    if (unit) this.events.onSelect?.(unit);
    else this.events.onEmptyClick?.();
  };

  private hit(e: MouseEvent | PointerEvent): Unit | null {
    const rect = this.threeCanvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (Math.abs(this.pointer.x) > 1.05 || Math.abs(this.pointer.y) > 1.05) return null;
    this.raycaster.setFromCamera(this.pointer, this.activeCamera);
    const hits = this.raycaster.intersectObjects(this.clickable, false);
    for (const hit of hits) {
      const unit = this.units[hit.object.name];
      if (unit) return unit;
    }
    return null;
  }
}
