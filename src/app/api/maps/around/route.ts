import { NextResponse } from "next/server";
import { POI_FILTERS, kindOfTags, type PoiKind, type PoiPlace } from "@/lib/poi";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const cache = new Map<string, { t: number; body: unknown }>();
const UA = { "User-Agent": "AXIS-tour/1.0 (real-estate map)", Accept: "application/json" };

function cached(key: string, ttl: number) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.body;
  return null;
}

function withinKm(lat: number, lng: number, plat: number, plng: number, km: number) {
  const dy = (plat - lat) * 111;
  const dx = (plng - lng) * 111 * Math.cos((lat * Math.PI) / 180);
  return dx * dx + dy * dy <= km * km;
}

async function geocode(q: string): Promise<{ lat: number; lng: number; address: string } | null> {
  try {
    const photon = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`, {
      headers: UA,
      signal: AbortSignal.timeout(7000),
    });
    if (photon.ok) {
      const json = (await photon.json()) as {
        features?: { geometry?: { coordinates?: number[] }; properties?: { name?: string; city?: string; country?: string; street?: string } }[];
      };
      const f = json.features?.[0];
      const coords = f?.geometry?.coordinates;
      if (coords && coords.length >= 2) {
        const p = f?.properties || {};
        const address = [p.name, p.street, p.city, p.country].filter(Boolean).join(", ") || q;
        return { lat: coords[1], lng: coords[0], address };
      }
    }
  } catch {
    /* nominatim */
  }
  try {
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, {
      headers: UA,
      signal: AbortSignal.timeout(7000),
    });
    if (!geoRes.ok) return null;
    const geo = (await geoRes.json()) as { lat: string; lon: string; display_name: string }[];
    const first = geo[0];
    if (!first) return null;
    return { lat: Number(first.lat), lng: Number(first.lon), address: first.display_name };
  } catch {
    return null;
  }
}

async function overpassPlaces(lat: number, lng: number): Promise<PoiPlace[]> {
  const filters = POI_FILTERS.map((f) =>
    f.query
      .split("\n")
      .map((line) => `${line}(around:5000,${lat},${lng});`)
      .join("\n"),
  ).join("\n");
  const overpass = `[out:json][timeout:12];(\n${filters}\n);out center;`;
  const endpoints = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];
  for (const url of endpoints) {
    try {
      const poiRes = await fetch(url, {
        method: "POST",
        headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: `data=${encodeURIComponent(overpass)}`,
        signal: AbortSignal.timeout(13000),
      });
      if (!poiRes.ok) continue;
      const json = (await poiRes.json()) as {
        elements?: { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
      };
      const places = (json.elements ?? [])
        .map((el) => {
          const kind = kindOfTags(el.tags);
          const plat = el.lat ?? el.center?.lat;
          const plng = el.lon ?? el.center?.lon;
          if (!kind || plat == null || plng == null) return null;
          return {
            id: `${el.type}-${el.id}`,
            kind,
            name: el.tags?.name || el.tags?.["name:ar"] || POI_FILTERS.find((f) => f.id === kind)?.en || kind,
            lat: plat,
            lng: plng,
          } as PoiPlace;
        })
        .filter((p): p is PoiPlace => Boolean(p));
      if (places.length) return places.slice(0, 400);
    } catch {
      /* next */
    }
  }
  return [];
}

function mergePlaces(a: PoiPlace[], b: PoiPlace[]) {
  const seen = new Set<string>();
  const out: PoiPlace[] = [];
  for (const p of [...a, ...b]) {
    const key = `${p.kind}-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 400);
}

async function photonPlaces(lat: number, lng: number): Promise<PoiPlace[]> {
  const queries = POI_FILTERS.flatMap((f) => [
    { kind: f.id as PoiKind, q: f.search, fallback: f.en },
    { kind: f.id as PoiKind, q: f.ar, fallback: f.en },
  ]);
  const near = await Promise.all(
    queries.map(async ({ kind, q, fallback }) => {
      try {
        const r = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=25`,
          { headers: UA, signal: AbortSignal.timeout(5000) },
        );
        if (!r.ok) return [] as PoiPlace[];
        const json = (await r.json()) as {
          features?: { geometry?: { coordinates?: number[] }; properties?: { osm_id?: number; name?: string } }[];
        };
        return (json.features ?? [])
          .map((feat) => {
            const coords = feat.geometry?.coordinates;
            if (!coords || coords.length < 2) return null;
            const plng = coords[0];
            const plat = coords[1];
            if (!withinKm(lat, lng, plat, plng, 5.5)) return null;
            return {
              id: `ph-${kind}-${feat.properties?.osm_id || `${plat}-${plng}`}`,
              kind,
              name: feat.properties?.name || fallback,
              lat: plat,
              lng: plng,
            } as PoiPlace;
          })
          .filter((p): p is PoiPlace => Boolean(p));
      } catch {
        return [] as PoiPlace[];
      }
    }),
  );
  return near.flat();
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const fast = sp.get("fast") === "1";
  let lat = Number(sp.get("lat"));
  let lng = Number(sp.get("lng"));
  let address = sp.get("address") || "";

  if (q && q.length >= 2) {
    const hit = cached(`v7:${q.toLowerCase()}`, 15 * 60_000);
    if (hit && !fast) return NextResponse.json(hit);
    const found = await geocode(q);
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    lat = found.lat;
    lng = found.lng;
    address = found.address;
    if (fast) return NextResponse.json({ lat, lng, address, places: [] });
    if (hit) return NextResponse.json(hit);
  } else if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const light = sp.get("light") === "1";
  const pkey = `v8p:${lat.toFixed(4)}:${lng.toFixed(4)}${light ? ":l" : ""}`;
  const phit = cached(pkey, 15 * 60_000);
  if (phit) return NextResponse.json(phit);

  const photonP = photonPlaces(lat, lng);
  const overP = light ? Promise.resolve([] as PoiPlace[]) : overpassPlaces(lat, lng);
  const [photon, over] = await Promise.all([photonP, overP]);
  const places = mergePlaces(over, photon);
  const body = { lat, lng, address, places };
  if (places.length) cache.set(pkey, { t: Date.now(), body });
  return NextResponse.json(body);
}
