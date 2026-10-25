"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  src: string;
  className?: string;
};

/** Equirectangular 360 — hold and drag to look around; release to stop. */
export default function PanoramaViewer({ src, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !src) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 0, 0.01);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    canvas.style.pointerEvents = "auto";
    host.appendChild(canvas);

    const geo = new THREE.SphereGeometry(500, 64, 40);
    geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a2230 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let disposed = false;
    loader.load(
      src,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      },
      undefined,
      () => {
        /* keep dark placeholder */
      },
    );

    let lon = 0;
    let lat = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = "grabbing";
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dx === 0 && dy === 0) return;
      lon -= dx * 0.2;
      lat = Math.max(-85, Math.min(85, lat + dy * 0.2));
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("lostpointercapture", onUp);

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta),
      );
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      dragging = false;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("lostpointercapture", onUp);
      mat.map?.dispose();
      mat.dispose();
      geo.dispose();
      renderer.dispose();
      if (canvas.parentNode === host) host.removeChild(canvas);
    };
  }, [src]);

  return <div ref={hostRef} className={className} style={{ width: "100%", height: "100%", touchAction: "none" }} />;
}
