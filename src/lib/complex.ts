export type UnitStatus = "available" | "reserved" | "sold";

export type Unit = {
  id: string;
  displayId: string;
  type: 1 | 2 | 3;
  /** Filter / display model code: 1A, 1B, 2A, 2B, 3A, 3B */
  model: string;
  status: UnitStatus;
  surface: number;
  rooms: number;
  floor: number;
  price: number;
  planImage: string;
};

export const UNIT_MODELS = ["1A", "1B", "2A", "2B", "3A", "3B"] as const;
export type UnitModel = (typeof UNIT_MODELS)[number];

export function modelOf(u: Pick<Unit, "type" | "model" | "displayId">): string {
  if (u.model && /^[123][AB]$/i.test(u.model)) return u.model.toUpperCase();
  const t = u.type === 2 || u.type === 3 ? u.type : 1;
  return `${t}A`;
}

export const STATUS_COLOR = {
  available: 0x3dba67,
  reserved: 0xf4b326,
  sold: 0xe25656,
} as const;

export const COMPLEX = {
  slug: "villas-ajyad",
  name: "Villas Ajyad",
  assetBase: "/complexes/villas-ajyad",
  glbPath: "/complexes/villas-ajyad/models/building.glb",
  dataPath: "/complexes/villas-ajyad/data/units.json",
  logoPath: "/complexes/villas-ajyad/logo.webp",
  framesPath: "/complexes/villas-ajyad/panorama/frames/",
  framesLowPath: "/complexes/villas-ajyad/panorama/frames_low/",
  framePrefix: "frame-",
  frameExt: ".jpg",
  frameLowExt: ".webp",
  totalFrames: 90,
  villaFrames: 60,
  renderW: 13000,
  renderH: 7312,
  defaultFov: 45,
  dragSensitivity: 3,
  lowResUpgradeDelay: 200,
  overlayOpacity: 0.2,
  showAllOpacity: 0.25,
  hoverOverlayOpacity: 0.5,
  maskNames: ["jijijijijiji", "jjjjjjjjj"],
  zoomMin: 1,
  zoomMax: 3,
  zoomStep: 0.1,
  approachFill: 0.9,
  /** Plus Code short form + city — human-readable address on the map. */
  locationQuery: "9P2X+QM3, Khamis Mushait 62484, Saudi Arabia",
  /** Exact pin from Open Location Code 9P2X+QM3 near Khamis Mushait (~14 m cell). */
  locationLat: 18.3518875,
  locationLng: 42.749171875,
  contactEmail: "info@ajyadre.com",
  contactTel: "+966575555782",
  gallery: Array.from({ length: 10 }, (_, i) => `/complexes/villas-ajyad/gallery/${String(i + 1).padStart(2, "0")}.jpg`),
  villa360: {
    basePath: "/complexes/villas-ajyad/villa-types/",
    framePrefix: "frame-",
    frameExt: ".webp",
    whole: "tout_villa",
    floors: [
      { id: "rdc", subfolder: "RDC", label: "RDC" },
      { id: "etage_1", subfolder: "etage_1", label: "1st" },
      { id: "etage_2", subfolder: "etage_2", label: "Final" },
    ],
    facadeFrames: [
      { index: 0, label: "Front" },
      { index: 15, label: "Right" },
      { index: 30, label: "Back" },
      { index: 45, label: "Left" },
    ],
  },
  villaTypes: { 1: "type-1", 2: "type-2", 3: "type-3" } as Record<number, string>,
  typeLabels: { 1: "1A", 2: "2A", 3: "3A" } as Record<number, string>,
  defaultPriceByType: { 1: 280_000, 2: 340_000, 3: 380_000 } as Record<number, number>,
  defaultPriceByModel: {
    "1A": 280_000,
    "1B": 295_000,
    "2A": 340_000,
    "2B": 355_000,
    "3A": 380_000,
    "3B": 395_000,
  } as Record<string, number>,
};

export function formatSar(n: number) {
  // Currency first (left), number second — keep as one LTR run so RTL UI does not flip it.
  return `\u200Eر.س\u00A0${Math.round(n).toLocaleString("en-US")}`;
}

export function frameUrl(index: number, quality: "low" | "high") {
  const num = String(index + 1).padStart(2, "0");
  if (quality === "low") {
    return `${COMPLEX.framesLowPath}${COMPLEX.framePrefix}${num}${COMPLEX.frameLowExt}`;
  }
  return `${COMPLEX.framesPath}${COMPLEX.framePrefix}${num}${COMPLEX.frameExt}`;
}

export function villaFrameUrl(type: number, floorFolder: string, index: number) {
  const folder = COMPLEX.villaTypes[type] ?? "type-1";
  const num = String(index + 1).padStart(2, "0");
  return `${COMPLEX.villa360.basePath}${folder}/${floorFolder}/${COMPLEX.villa360.framePrefix}${num}${COMPLEX.villa360.frameExt}`;
}

export function planUrl(unit: Unit) {
  const file = unit.planImage.replace(/^assets\//, "");
  return `${COMPLEX.assetBase}/${file}`;
}
