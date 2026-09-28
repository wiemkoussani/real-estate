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
  private focusedId: string | null = null;
  private hoveredId: string | null = null;
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
    await Promise.all([this.preloadLow(), this.loadGlb(), this.loadUnits()]);
    this.syncCamera();
    this.draw("low");
    this.loop();
    this.scheduleUpgrade();
    this.events.onReady?.();
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

  setOverlayVisible(v: boolean) {
    this.overlayVisible = v;
    this.syncMeshVisibility();
  }

  setFocus(id: string | null) {
    this.focusedId = id;
    this.syncMeshVisibility();
  }

  resetView() {
    this.clearCrossfade();
    this.bgNext.width = 1;
    this.bgNext.height = 1;
    this.focusedId = null;
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
  }

  zoomBy(delta: number) {
    const next = Math.min(COMPLEX.zoomMax, Math.max(COMPLEX.zoomMin, this.zoom + delta));
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
    this.container.addEventListener("pointerdown", this.onDown);
    this.container.addEventListener("pointermove", this.onMove);
    this.container.addEventListener("pointerup", this.onUp);
    this.container.addEventListener("pointercancel", this.onUp);
    this.container.addEventListener("pointerleave", this.onLeave);
    this.container.addEventListener("wheel", this.onWheel, { passive: false });
    this.container.addEventListener("click", this.onClick);
    window.addEventListener("resize", this.onResize);
  }

  private unbind() {
    this.container.removeEventListener("pointerdown", this.onDown);
    this.container.removeEventListener("pointermove", this.onMove);
    this.container.removeEventListener("pointerup", this.onUp);
    this.container.removeEventListener("pointercancel", this.onUp);
    this.container.removeEventListener("pointerleave", this.onLeave);
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

  private async preloadLow() {
    const total = this.tour.totalFrames;
    if (!total) {
      this.events.onLoadProgress?.(96);
      return;
    }
    let loaded = 0;
    const order = [0, 14, ...Array.from({ length: total }, (_, i) => i).filter((i) => i !== 0 && i !== 14)];
    const batch = 8;
    for (let start = 0; start < total; start += batch) {
      const slice = order.slice(start, start + batch);
      await Promise.all(
        slice.map(
          (idx) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.decoding = "async";
              this.lowImages[idx] = img;
              img.onload = () => {
                loaded += 1;
                this.events.onLoadProgress?.(Math.round((loaded / total) * 92));
                this.warmLow(idx);
                resolve();
              };
              img.onerror = () => {
                loaded += 1;
                this.events.onLoadProgress?.(Math.round((loaded / total) * 92));
                resolve();
              };
              const src = tourFrameUrl(this.tour, idx, "low");
              if (!src) {
                loaded += 1;
                this.events.onLoadProgress?.(Math.round((loaded / total) * 92));
                resolve();
                return;
              }
              img.src = src;
            }),
        ),
      );
    }
    await Promise.all(order.map((i) => this.warmLow(i)));
    this.events.onLoadProgress?.(96);
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
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      obj.renderOrder = 2;
      obj.visible = true;
      this.unitMeshes[obj.name] = obj;
      this.clickable.push(obj);
    });
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
    const { cw, ch, dw, dh, dx, dy } = this.getDrawRect();
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
      const sx = dx + (p.x * 0.5 + 0.5) * dw;
      const sy = dy + (-p.y * 0.5 + 0.5) * dh;
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

  private syncMeshVisibility() {
    Object.entries(this.unitMeshes).forEach(([name, mesh]) => {
      const unit = this.units[name];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (!unit) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const focused = this.focusedId === name || this.hoveredId === name;
      if (this.overlayVisible) {
        mat.opacity = focused ? COMPLEX.hoverOverlayOpacity : COMPLEX.overlayOpacity;
      } else {
        mat.opacity = focused ? COMPLEX.hoverOverlayOpacity : 0;
      }
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
    this.activeCamera.clearViewOffset();
    this.activeCamera.updateProjectionMatrix();
    this.renderer.setViewport(dx, ch - dy - dh, dw, dh);
    this.renderer.setScissor(0, 0, cw, ch);
    this.renderer.setScissorTest(true);
  }

  private applyTransform() {
    this.zoomOx = this.container.clientWidth / 2;
    this.zoomOy = this.container.clientHeight / 2;
    const t = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    [this.bg, this.bgNext, this.threeCanvas].forEach((el) => {
      el.style.transformOrigin = "50% 50%";
      el.style.transform = t;
    });
  }

  private loop = () => {
    if (this.disposed) return;
    this.rafLoop = requestAnimationFrame(this.loop);
    this.renderer.render(this.scene, this.activeCamera);
  };

  private onDown = (e: PointerEvent) => {
    if (this.approaching) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("button, a, input, select, nav, .hud, .panel, .modal, .tour, .detail")) return;
    this.container.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStartZoom = this.zoom;
      return;
    }
    this.isDragging = true;
    this.isNavigating = true;
    this.moved = false;
    this.dragStartX = e.clientX;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
  };

  private onMove = (e: PointerEvent) => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStartDist > 0) {
        const factor = dist / this.pinchStartDist;
        const next = Math.min(COMPLEX.zoomMax, Math.max(COMPLEX.zoomMin, this.pinchStartZoom * factor));
        this.zoom = next;
        this.applyTransform();
      }
      return;
    }
    if (!this.isDragging) {
      this.hover(e);
      return;
    }
    if (this.panMode || (e.shiftKey && e.buttons === 1) || e.buttons === 2) {
      this.panX += e.clientX - this.panStartX;
      this.panY += e.clientY - this.panStartY;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.applyTransform();
      return;
    }
    const delta = e.clientX - this.dragStartX;
    if (Math.abs(delta) >= COMPLEX.dragSensitivity) {
      const n = this.tour.totalFrames;
      if (!n) return;
      const dir = delta > 0 ? -1 : 1;
      this.moved = true;
      this.clearCrossfade();
      this.currentFrame = (this.currentFrame + dir + n) % n;
      this.warmAround(this.currentFrame, dir);
      this.requestDraw();
      this.events.onFrame?.(this.currentFrame);
      this.dragStartX = e.clientX;
    }
  };

  private onLeave = () => {
    this.hoveredId = null;
    this.syncMeshVisibility();
    this.events.onHover?.(null);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStartDist = 0;
    if (this.pointers.size === 0) {
      this.isDragging = false;
      this.scheduleUpgrade();
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY > 0 ? -COMPLEX.zoomStep : COMPLEX.zoomStep);
  };

  private hover(e: PointerEvent) {
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
    const { dw, dh, dx, dy } = this.getDrawRect();
    const rect = this.container.getBoundingClientRect();
    const x = rect.left + dx + (top.x * 0.5 + 0.5) * dw;
    const y = rect.top + dy + (-top.y * 0.5 + 0.5) * dh;
    this.events.onHover?.(unit, { x, y });
  }

  private onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("button, a, input, select, nav, .hud, .panel, .modal, .tour, .detail")) return;
    if (this.moved || this.approaching) return;
    const unit = this.hit(e);
    if (unit) this.events.onSelect?.(unit);
    else this.events.onEmptyClick?.();
  };

  private hit(e: MouseEvent | PointerEvent): Unit | null {
    const { cw, ch, dw, dh, dx, dy } = this.getDrawRect();
    const rect = this.threeCanvas.getBoundingClientRect();
    const scaleX = rect.width / Math.max(1, cw);
    const scaleY = rect.height / Math.max(1, ch);
    const vx = rect.left + dx * scaleX;
    const vy = rect.top + dy * scaleY;
    const vw = dw * scaleX;
    const vh = dh * scaleY;
    this.pointer.x = ((e.clientX - vx) / vw) * 2 - 1;
    this.pointer.y = -((e.clientY - vy) / vh) * 2 + 1;
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
