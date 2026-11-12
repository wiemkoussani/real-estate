/**
 * Street 360° hotspots on the aerial map: where each street panorama (scene_360/<n>) was taken,
 * in the 3D model's world coordinates (same space as building.glb).
 * Positions come from the Sphere001…Sphere012 markers of the project's 3D scene; SphereN ↔ scene "N"
 * (checked visually: same street views).
 */
export type Street360Pin = { sceneId: string; pos: [number, number, number] };

export const STREET_360_PINS: Record<string, Street360Pin[]> = {
  "villas-ajyad": [
    { sceneId: "1", pos: [-5644, -26, -14856] },
    { sceneId: "2", pos: [-5640, -26, 1751] },
    { sceneId: "3", pos: [2227, -26, 24315] },
    { sceneId: "4", pos: [1204, -26, 1555] },
    { sceneId: "5", pos: [1438, -26, -12121] },
    { sceneId: "6", pos: [8196, -26, -9896] },
    { sceneId: "7", pos: [12966, -26, 9347] },
    { sceneId: "8", pos: [8157, -26, -17758] },
    { sceneId: "9", pos: [22215, -26, -5345] },
    { sceneId: "10", pos: [13170, -26, -10866] },
    { sceneId: "11", pos: [27281, -26, 2602] },
    { sceneId: "12", pos: [20527, -26, -1173] },
  ],
};
