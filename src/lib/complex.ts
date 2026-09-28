export type UnitStatus = "available" | "reserved" | "sold";

export type Unit = {
  id: string;
  displayId: string;
  type: 1 | 2 | 3;
  status: UnitStatus;
  surface: number;
  rooms: number;
  floor: number;
  planImage: string;
};

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
  logoPath: "/complexes/villas-ajyad/logo.png",
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
  overlayOpacity: 0.4,
  hoverOverlayOpacity: 0.7,
  maskNames: ["jijijijijiji", "jjjjjjjjj"],
  zoomMin: 1,
  zoomMax: 8,
  zoomStep: 0.1,
  approachFill: 0.9,
  locationQuery: "Villas Ajyad",
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
  typeLabels: { 1: "Type 1", 2: "Type 2", 3: "Type 3" } as Record<number, string>,
};

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
