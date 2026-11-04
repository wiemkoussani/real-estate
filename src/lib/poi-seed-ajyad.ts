import type { PoiPlace } from "@/lib/poi";

/** Nearby pins around Villas Ajyad (≤ ~5 km). Sparse OSM area — prefer close over city-center noise. */
export const AJYAD_POI_SEED: PoiPlace[] = 
[
  {
    "id": "seed-restaurant-13479162004",
    "kind": "restaurant",
    "name": "الكوكب",
    "lat": 18.3079008,
    "lng": 42.749766
  },
  {
    "id": "seed-pharmacy-13476662362",
    "kind": "pharmacy",
    "name": "المتحدة",
    "lat": 18.307735,
    "lng": 42.7530301
  },
  {
    "id": "seed-church-1532670633",
    "kind": "church",
    "name": "مسجد الكناني",
    "lat": 18.3249481,
    "lng": 42.7635886
  },
  {
    "id": "seed-hospital-9098726037",
    "kind": "hospital",
    "name": "مستشفي خميس مشيط المركزي",
    "lat": 18.3503035,
    "lng": 42.7159547
  },
  {
    "id": "seed-hospital-5440609123",
    "kind": "hospital",
    "name": "Al-Nomais",
    "lat": 18.3342318,
    "lng": 42.7336593
  },
  {
    "id": "seed-mall-9156529583",
    "kind": "mall",
    "name": "أسواق ملتقي الثمانين",
    "lat": 18.3640566,
    "lng": 42.7077912
  },
  {
    "id": "seed-mall-9545084777",
    "kind": "mall",
    "name": "خزانة العناية لمستلزمات العناية بالجسم والبشرة‭",
    "lat": 18.3076733,
    "lng": 42.7537156
  },
  {
    "id": "seed-mall-13476662380",
    "kind": "mall",
    "name": "أسواق النخبة",
    "lat": 18.3077566,
    "lng": 42.7528466
  },
  {
    "id": "seed-square-1485073547",
    "kind": "square",
    "name": "حديقة الروضة",
    "lat": 18.3171345,
    "lng": 42.7466868
  }
] as PoiPlace[];
