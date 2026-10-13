import { COMPLEX, type Unit } from "@/lib/complex";
import type { AssetKind, AssetRow, ComplexRow } from "@/lib/types";

export type TourScene360 = {
  id: string;
  label: string;
  url: string;
};

export type TourMedia = {
  slug: string;
  name: string;
  locationQuery: string;
  contactEmail: string;
  contactTel: string;
  logoUrl: string;
  glbUrl: string;
  units: Unit[];
  totalFrames: number;
  villaFrames: number;
  renderW: number;
  renderH: number;
  framesLow: string[];
  framesHigh: string[];
  gallery: string[];
  galleryHero: string;
  galleryExterior: string[];
  galleryInterior: string[];
  plans: Record<string, string>;
  villa360: Record<string, string>;
  scenes360: TourScene360[];
  source: "db" | "file" | "local";
};

type Payload = {
  source?: "db" | "file";
  complex?: Partial<ComplexRow> & { slug?: string; name?: string; location_query?: string | null };
  units?: Unit[];
  assets?: Pick<AssetRow, "kind" | "path" | "sort_index">[];
};

function frameNum(path: string) {
  const m = path.match(/(\d+)(?=\.[^.]+$)/);
  return m ? parseInt(m[1], 10) : 0;
}

function sortAssets(rows: Payload["assets"], kind: AssetKind) {
  return (rows ?? [])
    .filter((a) => a.kind === kind && a.path)
    .sort((a, b) => a.sort_index - b.sort_index || frameNum(a.path) - frameNum(b.path) || a.path.localeCompare(b.path));
}

function urls(rows: Payload["assets"], kind: AssetKind) {
  return sortAssets(rows, kind).map((a) => a.path);
}

function relAfterKind(kind: string, path: string) {
  const marker = `/${kind}/`;
  const lower = path.replace(/\\/g, "/");
  const i = lower.toLowerCase().lastIndexOf(marker);
  const slice = i >= 0 ? path.replace(/\\/g, "/").slice(i + marker.length) : path.split("/").pop() || path;
  return decodeURIComponent(slice).replace(/\\/g, "/").toLowerCase();
}

function splitGallery(urls: string[]) {
  const root: string[] = [];
  const exterior: string[] = [];
  const interior: string[] = [];
  for (const u of urls) {
    const rel = relAfterKind("gallery", u).toLowerCase();
    if (/(^|\/)exterior(\/|$)/.test(rel)) exterior.push(u);
    else if (/(^|\/)interior(\/|$)/.test(rel)) interior.push(u);
    else root.push(u);
  }
  if (!exterior.length && !interior.length && root.length) {
    return { hero: root[0] || "", exterior: root.slice(1), interior: [] as string[] };
  }
  return { hero: root[0] || "", exterior: [...root.slice(1), ...exterior], interior };
}

function humanizeSceneLabel(raw: string) {
  const base = decodeURIComponent(raw).replace(/\.[^.]+$/, "").trim();
  // Pure index filenames like "(2)", "10", "(5-)" → no caption on thumbs
  if (/^[()\d\s._-]+$/.test(base)) return "";
  const cleaned = base
    .replace(/[()]/g, "")
    .replace(/^\d+[-_\s.]*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^\d+$/.test(cleaned)) return "";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sceneSortKey(raw: string) {
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** One scene per top-level folder (cover = first image), or one scene per flat file. */
export function buildScenes360(paths: string[]): TourScene360[] {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const rel = relAfterKind("scene_360", path);
    const parts = rel.split("/").filter(Boolean);
    if (!parts.length) continue;
    const key = parts.length >= 2 ? parts[0] : parts[0].replace(/\.[^.]+$/, "");
    const list = groups.get(key) || [];
    list.push(path);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => sceneSortKey(a[0]) - sceneSortKey(b[0]) || a[0].localeCompare(b[0]))
    .map(([key, list]) => ({
      id: key.toLowerCase().replace(/\s+/g, "-"),
      label: humanizeSceneLabel(key),
      url: list[0],
    }));
}

function emptyShell(slug: string, name?: string): TourMedia {
  return {
    slug,
    name: name || slug,
    locationQuery: COMPLEX.locationQuery,
    contactEmail: COMPLEX.contactEmail,
    contactTel: COMPLEX.contactTel,
    logoUrl: "",
    glbUrl: "",
    units: [],
    totalFrames: 0,
    villaFrames: COMPLEX.villaFrames,
    renderW: COMPLEX.renderW,
    renderH: COMPLEX.renderH,
    framesLow: [],
    framesHigh: [],
    gallery: [],
    galleryHero: "",
    galleryExterior: [],
    galleryInterior: [],
    plans: {},
    villa360: {},
    scenes360: [],
    source: "db",
  };
}

export function buildTour(payload: Payload, slug: string): TourMedia {
  const cx = payload.complex;
  const assets = payload.assets ?? [];
  const framesLow = urls(assets, "frame_low");
  const framesHigh = urls(assets, "frame_high");
  const gallery = urls(assets, "gallery");
  const split = splitGallery(gallery);
  const branding = urls(assets, "branding");
  const glb = urls(assets, "glb");
  const plans: Record<string, string> = {};
  sortAssets(assets, "plan").forEach((a) => {
    const name = relAfterKind("plan", a.path).split("/").pop() || a.path;
    plans[name.toLowerCase()] = a.path;
  });
  const villa360: Record<string, string> = {};
  sortAssets(assets, "villa_360").forEach((a) => {
    villa360[relAfterKind("villa_360", a.path)] = a.path;
  });
  const scenes360 = buildScenes360(urls(assets, "scene_360"));

  const storedFrames = framesLow.length || framesHigh.length;
  const logo =
    branding.find((u) => /logo/i.test(u)) ||
    branding[0] ||
    (cx?.logo_path && String(cx.logo_path).startsWith("http") ? cx.logo_path : "") ||
    COMPLEX.logoPath ||
    "";
  const glbUrl =
    glb[0] || (cx?.glb_path && String(cx.glb_path).startsWith("http") ? String(cx.glb_path) : "") || "";

  return {
    slug: cx?.slug || slug,
    name: cx?.name || slug,
    locationQuery: COMPLEX.locationQuery,
    contactEmail: COMPLEX.contactEmail,
    contactTel: COMPLEX.contactTel,
    logoUrl: logo,
    glbUrl,
    units: payload.units ?? [],
    totalFrames: storedFrames,
    villaFrames: cx?.villa_frames || COMPLEX.villaFrames,
    renderW: cx?.render_w || COMPLEX.renderW,
    renderH: cx?.render_h || COMPLEX.renderH,
    framesLow,
    framesHigh,
    gallery,
    galleryHero: split.hero,
    galleryExterior: split.exterior,
    galleryInterior: split.interior,
    plans,
    villa360,
    scenes360,
    source: payload.source === "file" ? "file" : "db",
  };
}

export function tourFrameUrl(tour: TourMedia, index: number, quality: "low" | "high") {
  const primary = quality === "low" ? tour.framesLow : tour.framesHigh;
  const other = quality === "low" ? tour.framesHigh : tour.framesLow;
  return primary[index] || other[index] || "";
}

export function tourVillaUrl(tour: TourMedia, type: number, folder: string, index: number) {
  const typeFolder = COMPLEX.villaTypes[type] ?? "type-1";
  const num = String(index + 1).padStart(2, "0");
  const names = [`frame-${num}.webp`, `frame-${num}.jpg`, `frame-${num}.png`];
  const folders = [folder, folder.toLowerCase(), folder.toUpperCase()];
  for (const f of folders) {
    for (const n of names) {
      const key = `${typeFolder}/${f}/${n}`.toLowerCase();
      if (tour.villa360[key]) return tour.villa360[key];
    }
  }
  const needle = `${typeFolder}/${folder}/frame-${num}`.toLowerCase();
  const hit = Object.entries(tour.villa360).find(([k]) => k.includes(needle));
  if (hit) return hit[1];
  return "";
}

export function tourPlanUrl(tour: TourMedia, unit: Unit) {
  if (unit.planImage.startsWith("http")) return unit.planImage;
  const base = (unit.planImage.split("/").pop() || "").toLowerCase();
  return tour.plans[base] || tour.plans[`type-${unit.type}.webp`] || tour.plans[`type-${unit.type}.jpg`] || "";
}

export function emptyTour(slug: string): TourMedia {
  return emptyShell(slug);
}
