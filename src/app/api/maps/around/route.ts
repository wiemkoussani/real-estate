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

function putCache(key: string, body: unknown) {
  cache.set(key, { t: Date.now(), body });
}

function withinKm(lat: number, lng: number, plat: number, plng: number, km: number) {
  const dy = (plat - lat) * 111;
  const dx = (plng - lng) * 111 * Math.cos((lat * Math.PI) / 180);
  return dx * dx + dy * dy <= km * km;
}

async function geocode(q: string): Promise<{ lat: number; lng: number; address: string } | null> {
  const gkey = `geo:${q.toLowerCase()}`;
  const hit = cached(gkey, 60 * 60_000) as { lat: number; lng: number; address: string } | null;
  if (hit) return hit;

  try {
    const photon = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`, {
      headers: UA,
      signal: AbortSignal.timeout(4000),
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
        const body = { lat: coords[1], lng: coords[0], address };
        putCache(gkey, body);
        return body;
      }
    }
  } catch {
    /* nominatim */
  }
  try {
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, {
      headers: UA,
      signal: AbortSignal.timeout(4000),
    });
    if (!geoRes.ok) return null;
    const geo = (await geoRes.json()) as { lat: string; lon: string; display_name: string }[];
    const first = geo[0];
    if (!first) return null;
    const body = { lat: Number(first.lat), lng: Number(first.lon), address: first.display_name };
    putCache(gkey, body);
    return body;
  } catch {
    return null;
  }
}

async function overpassPlaces(
  lat: number,
  lng: number,
  opts: { timeout: number; radius: number; signalMs: number },
): Promise<PoiPlace[]> {
  const filters = POI_FILTERS.map((f) =>
    f.query
      .split("\n")
      .map((line) => `${line}(around:${opts.radius},${lat},${lng});`)
      .join("\n"),
  ).join("\n");
  const overpass = `[out:json][timeout:${opts.timeout}];(\n${filters}\n);out center;`;
  const endpoints = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];
  for (const url of endpoints) {
    try {
      const poiRes = await fetch(url, {
        method: "POST",
        headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: `data=${encodeURIComponent(overpass)}`,
        signal: AbortSignal.timeout(opts.signalMs),
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

/** English search only (12 calls) — reliable when Overpass is slow/empty. */
async function photonPlacesLight(lat: number, lng: number): Promise<PoiPlace[]> {
  const queries = POI_FILTERS.map((f) => ({
    kind: f.id as PoiKind,
    q: f.search,
    fallback: f.en,
  }));
  const near = await Promise.all(
    queries.map(async ({ kind, q, fallback }) => {
      try {
        const r = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=15`,
          { headers: UA, signal: AbortSignal.timeout(4500) },
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
            if (!withinKm(lat, lng, plat, plng, 5)) return null;
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

function jsonOk(body: unknown, maxAge = 120) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=600`,
    },
  });
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const fast = sp.get("fast") === "1";
  const light = sp.get("light") === "1";
  let lat = Number(sp.get("lat"));
  let lng = Number(sp.get("lng"));
  let address = sp.get("address") || "";

  if (q && q.length >= 2) {
    const qkey = `v9:${q.toLowerCase()}${light ? ":l" : ""}`;
    const hit = cached(qkey, 30 * 60_000);
    if (hit && !fast) return jsonOk(hit);

    const found = await geocode(q);
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    lat = found.lat;
    lng = found.lng;
    address = found.address;
    if (fast) return jsonOk({ lat, lng, address, places: [] }, 300);
  } else if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const pkey = `v9p:${lat.toFixed(4)}:${lng.toFixed(4)}${light ? ":l" : ""}`;
  const phit = cached(pkey, 30 * 60_000);
  if (phit) return jsonOk(phit);

  // Overpass + Photon in parallel so pins still show if one source fails.
  const overP = overpassPlaces(lat, lng, light
    ? { timeout: 7, radius: 4000, signalMs: 8000 }
    : { timeout: 10, radius: 5000, signalMs: 11000 });
  const photonP = photonPlacesLight(lat, lng);
  const [over, photon] = await Promise.all([overP, photonP]);
  const places = mergePlaces(over, photon);

  const body = { lat, lng, address, places };
  // Never cache empty POI sets — that blocks pins for 30 minutes.
  if (places.length) {
    putCache(pkey, body);
    if (q && q.length >= 2) putCache(`v9:${q.toLowerCase()}${light ? ":l" : ""}`, body);
  }
  return jsonOk(body);
}
