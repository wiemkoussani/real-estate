import type { AssetKind } from "@/lib/types";
import { relativeUploadPath } from "@/lib/upload-files";

type Cap = {
  maxEdge: number;
  quality: number;
  mime: "image/webp" | "image/jpeg";
  /** Soft target band in bytes (inclusive). Encoder iterates quality to land inside. */
  minBytes?: number;
  maxBytes?: number;
};

const CAPS: Partial<Record<AssetKind, Cap>> = {
  // Spec: lightweight 100–130 KB each
  frame_low: { maxEdge: 1280, quality: 0.55, mime: "image/webp", minBytes: 100_000, maxBytes: 130_000 },
  // Spec: primary 1.0–1.3 MB each
  frame_high: { maxEdge: 4096, quality: 0.78, mime: "image/webp", minBytes: 1_000_000, maxBytes: 1_300_000 },
  gallery: { maxEdge: 2048, quality: 0.8, mime: "image/webp", maxBytes: 1_000_000 },
  villa_360: { maxEdge: 2048, quality: 0.78, mime: "image/webp" },
  // Equirectangular panoramas need more width (2:1). Cap longest edge at 4096.
  scene_360: { maxEdge: 4096, quality: 0.82, mime: "image/webp" },
  plan: { maxEdge: 2400, quality: 0.85, mime: "image/webp" },
  branding: { maxEdge: 1024, quality: 0.9, mime: "image/webp" },
};

/** Card / strip thumbs named *thumb* get a hard ≤20 KB cap (plans) or small strip size (360). */
function capForFile(kind: AssetKind, fileName: string): Cap | undefined {
  const base = CAPS[kind];
  if (!base) return undefined;
  if (/thumb|thumbnail|_sm|_small/i.test(fileName)) {
    if (kind === "plan") {
      return { maxEdge: 320, quality: 0.6, mime: "image/webp", maxBytes: 20_000 };
    }
    if (kind === "scene_360") {
      return { maxEdge: 512, quality: 0.8, mime: "image/webp", maxBytes: 80_000 };
    }
  }
  return base;
}

function withRelativePath(file: File, rel: string) {
  try {
    Object.defineProperty(file, "webkitRelativePath", { value: rel, configurable: true });
  } catch {
    /* ignore */
  }
  return file;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}

async function encodeInRange(
  canvas: HTMLCanvasElement,
  mime: string,
  startQ: number,
  minBytes?: number,
  maxBytes?: number,
): Promise<Blob | null> {
  let lo = 0.2;
  let hi = 0.95;
  let q = Math.min(hi, Math.max(lo, startQ));
  let best: Blob | null = await canvasToBlob(canvas, mime, q);
  if (!best) return null;
  if (minBytes == null && maxBytes == null) return best;

  for (let i = 0; i < 10; i++) {
    const blob = await canvasToBlob(canvas, mime, q);
    if (!blob) break;
    best = blob;
    const tooSmall = minBytes != null && blob.size < minBytes;
    const tooBig = maxBytes != null && blob.size > maxBytes;
    if (!tooSmall && !tooBig) return blob;
    if (tooBig) hi = q;
    else lo = q;
    const next = (lo + hi) / 2;
    if (Math.abs(next - q) < 0.01) break;
    q = next;
  }

  // If still over max, walk quality down.
  if (best && maxBytes != null && best.size > maxBytes) {
    for (let q2 = q; q2 >= 0.15; q2 -= 0.05) {
      const blob = await canvasToBlob(canvas, mime, q2);
      if (!blob) break;
      best = blob;
      if (blob.size <= maxBytes) break;
    }
  }
  return best;
}

/** Resize/compress tour images before Supabase upload. Non-images and PDF/SVG pass through. */
export async function optimizeUploadFile(file: File, kind: AssetKind): Promise<File> {
  const baseName = (relativeUploadPath(file).split("/").pop() || file.name).toLowerCase();
  const cap = capForFile(kind, baseName);
  if (!cap) return file;

  if (baseName.endsWith(".svg") || baseName.endsWith(".pdf") || baseName.endsWith(".glb")) return file;
  if (!/\.(webp|jpe?g|png)$/i.test(baseName) && !file.type.startsWith("image/")) return file;

  try {
    const img = await loadImage(file);
    let maxEdge = cap.maxEdge;
    let scale = Math.max(img.naturalWidth, img.naturalHeight) > maxEdge ? maxEdge / Math.max(img.naturalWidth, img.naturalHeight) : 1;
    let w = Math.max(1, Math.round(img.naturalWidth * scale));
    let h = Math.max(1, Math.round(img.naturalHeight * scale));

    // Skip rewrite if already webp inside target band at/under max edge
    if (
      scale >= 1 &&
      file.type === cap.mime &&
      (cap.maxBytes == null || file.size <= cap.maxBytes) &&
      (cap.minBytes == null || file.size >= cap.minBytes)
    ) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    let blob = await encodeInRange(canvas, cap.mime, cap.quality, cap.minBytes, cap.maxBytes);

    // Card thumbs: shrink edges further if still over maxBytes
    if (blob && cap.maxBytes != null && blob.size > cap.maxBytes && /thumb|thumbnail/i.test(baseName)) {
      for (let edge = Math.min(maxEdge, 280); edge >= 96 && blob.size > cap.maxBytes; edge = Math.floor(edge * 0.85)) {
        const s = edge / Math.max(img.naturalWidth, img.naturalHeight);
        w = Math.max(1, Math.round(img.naturalWidth * Math.min(1, s)));
        h = Math.max(1, Math.round(img.naturalHeight * Math.min(1, s)));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        blob = (await encodeInRange(canvas, cap.mime, 0.55, undefined, cap.maxBytes)) || blob;
      }
    }

    if (!blob) return file;
    const mustShrink = cap.maxBytes != null && file.size > cap.maxBytes;
    if (!mustShrink && blob.size >= file.size * 0.98) return file;

    const ext = cap.mime === "image/webp" ? ".webp" : ".jpg";
    const rel = relativeUploadPath(file).replace(/\.[^.]+$/i, ext);
    const name = rel.split("/").pop() || file.name.replace(/\.[^.]+$/i, ext);
    return withRelativePath(new File([blob], name, { type: cap.mime, lastModified: file.lastModified }), rel);
  } catch {
    return file;
  }
}
