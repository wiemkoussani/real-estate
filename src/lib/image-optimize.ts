import type { AssetKind } from "@/lib/types";
import { relativeUploadPath } from "@/lib/upload-files";

type Cap = { maxEdge: number; quality: number; mime: "image/webp" | "image/jpeg" };

const CAPS: Partial<Record<AssetKind, Cap>> = {
  frame_low: { maxEdge: 1280, quality: 0.72, mime: "image/webp" },
  frame_high: { maxEdge: 4096, quality: 0.82, mime: "image/webp" },
  gallery: { maxEdge: 2048, quality: 0.8, mime: "image/webp" },
  villa_360: { maxEdge: 2048, quality: 0.78, mime: "image/webp" },
  plan: { maxEdge: 2400, quality: 0.85, mime: "image/webp" },
  branding: { maxEdge: 1024, quality: 0.9, mime: "image/webp" },
};

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

/** Resize/compress tour images before Supabase upload. Non-images and PDF/SVG pass through. */
export async function optimizeUploadFile(file: File, kind: AssetKind): Promise<File> {
  const cap = CAPS[kind];
  if (!cap) return file;

  const base = (relativeUploadPath(file).split("/").pop() || file.name).toLowerCase();
  if (base.endsWith(".svg") || base.endsWith(".pdf") || base.endsWith(".glb")) return file;
  if (!/\.(webp|jpe?g|png)$/i.test(base) && !file.type.startsWith("image/")) return file;

  try {
    const img = await loadImage(file);
    const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = maxDim > cap.maxEdge ? cap.maxEdge / maxDim : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    // Skip rewrite if already small enough and already webp under target weight heuristic
    if (scale >= 1 && file.type === cap.mime && file.size < 900_000) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, cap.mime, cap.quality));
    if (!blob || blob.size >= file.size * 0.98) return file;

    const ext = cap.mime === "image/webp" ? ".webp" : ".jpg";
    const rel = relativeUploadPath(file).replace(/\.[^.]+$/i, ext);
    const name = (rel.split("/").pop() || file.name.replace(/\.[^.]+$/i, ext));
    return withRelativePath(new File([blob], name, { type: cap.mime, lastModified: file.lastModified }), rel);
  } catch {
    return file;
  }
}
