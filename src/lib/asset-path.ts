import type { AssetKind } from "@/lib/types";

export function safeRel(raw: string) {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== "." && p !== ".." && p.toLowerCase() !== "__macosx")
    .join("/");
}

export function normalizeRel(kind: AssetKind, rel: string) {
  const clean = safeRel(rel);
  if (kind === "villa_360") {
    const hit = clean.match(/type-[123]\/.+$/i);
    if (hit) return hit[0];
  }
  if (kind === "gallery") {
    const parts = clean.split("/");
    const top = parts[0]?.toLowerCase();
    if ((top === "gallery" || top === "gallerie") && parts.length > 1) return parts.slice(1).join("/");
  }
  return clean;
}

export function mediaObjectPath(url: string) {
  const marker = "/object/public/media/";
  const i = url.indexOf(marker);
  if (i >= 0) return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  if (!url.startsWith("http")) return url;
  return "";
}

export function assetFileLabel(path: string) {
  const clean = decodeURIComponent(path.split("?")[0]).replace(/\\/g, "/");
  const parts = clean.split("/").filter(Boolean);
  return parts.slice(-3).join("/") || path;
}

export function assetRelSegments(path: string, kind: string) {
  const clean = decodeURIComponent(path.split("?")[0]).replace(/\\/g, "/");
  const marker = `/${kind}/`;
  const i = clean.toLowerCase().lastIndexOf(marker.toLowerCase());
  const rel = i >= 0 ? clean.slice(i + marker.length) : clean.split("/").pop() || "";
  return rel.split("/").filter(Boolean);
}

export function mimeFor(name: string, fallback = "") {
  if (fallback && fallback !== "application/octet-stream") return fallback;
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "glb") return "model/gltf-binary";
  if (ext === "pdf") return "application/pdf";
  return fallback || "application/octet-stream";
}
