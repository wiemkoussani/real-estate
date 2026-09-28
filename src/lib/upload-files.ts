import type { AssetKind } from "@/lib/types";

const SKIP = /(^|\/)(\.ds_store|thumbs\.db|desktop\.ini|__macosx)(\/|$)/i;

const ALLOW: Partial<Record<AssetKind, RegExp>> = {
  branding: /\.(png|jpe?g|webp|svg)$/i,
  glb: /\.glb$/i,
  frame_low: /\.(webp|jpe?g|png)$/i,
  frame_high: /\.(webp|jpe?g|png)$/i,
  gallery: /\.(webp|jpe?g|png)$/i,
  plan: /\.(webp|jpe?g|png|pdf)$/i,
  villa_360: /\.(webp|jpe?g|png)$/i,
  document: /\.(pdf|png|jpe?g|webp|docx?)$/i,
};

export function relativeUploadPath(file: File) {
  return ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

export function filesForKind(files: File[], kind: AssetKind) {
  const allow = ALLOW[kind];
  return files.filter((file) => {
    if (!file.size) return false;
    const rel = relativeUploadPath(file);
    if (SKIP.test(rel)) return false;
    const base = rel.split("/").pop() || "";
    if (!base || base.startsWith(".")) return false;
    return allow ? allow.test(base) : true;
  });
}
