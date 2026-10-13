import { NextResponse } from "next/server";
import { OpenLocationCode } from "open-location-code";
import { COMPLEX } from "@/lib/complex";
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

const PLUS_CODE = /\b[2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,3}\b/gi;

/** Photon/Nominatim often fail on Google Plus Codes — try city/address fallbacks. */
function geocodeVariants(q: string) {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "").trim();
    if (t.length >= 2 && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  push(q);
  const noPlus = q.replace(PLUS_CODE, " ");
  push(noPlus);
  const parts = noPlus.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) push(parts.slice(-2).join(", "));
  if (parts.length) push(parts[parts.length - 1]);
  return out;
}

async function geocodeOnce(q: string): Promise<{ lat: number; lng: number; address: string } | null> {
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
        return { lat: coords[1], lng: coords[0], address };
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
    return { lat: Number(first.lat), lng: Number(first.lon), address: first.display_name };
  } catch {
    return null;
  }
}

async function geocodePlusCode(q: string): Promise<{ lat: number; lng: number; address: string } | null> {
  const match = q.match(PLUS_CODE);
  if (!match) return null;
  const short = match[0].toUpperCase();
  const rest = q.replace(PLUS_CODE, " ").replace(/^[\s,]+|[\s,]+$/g, "").trim();

  // Villas Ajyad — exact Open Location Code pin (not city centroid).
  if (short === "9P2X+QM3") {
    return { lat: COMPLEX.locationLat, lng: COMPLEX.locationLng, address: COMPLEX.locationQuery };
  }

  let refLat = COMPLEX.locationLat;
  let refLng = COMPLEX.locationLng;
  if (rest) {
    for (const candidate of geocodeVariants(rest)) {
      const city = await geocodeOnce(candidate);
      if (city) {
        refLat = city.lat;
        refLng = city.lng;
        break;
      }
    }
  }

  try {
    const olc = new OpenLocationCode();
    const full = olc.isFull(short) ? short : olc.recoverNearest(short, refLat, refLng);
    const area = olc.decode(full);
    return { lat: area.latitudeCenter, lng: area.longitudeCenter, address: q };
  } catch {
    return null;
  }
}

async function geocode(q: string): Promise<{ lat: number; lng: number; address: string } | null> {
  const gkey = `geo:v3:${q.toLowerCase()}`;
  const hit = cached(gkey, 60 * 60_000) as { lat: number; lng: number; address: string } | null;
  if (hit) return hit;

  const fromPlus = await geocodePlusCode(q);
  if (fromPlus) {
    putCache(gkey, fromPlus);
    return fromPlus;
  }

  for (const candidate of geocodeVariants(q)) {
    const body = await geocodeOnce(candidate);
    if (body) {
      putCache(gkey, body);
      return body;
    }
  }
  return null;
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

/** English search — reliable when Overpass is slow/empty. Light = fewer/faster queries. */
async function photonPlacesLight(
  lat: number,
  lng: number,
  opts?: { timeoutMs?: number; limit?: number; kinds?: number },
): Promise<PoiPlace[]> {
  const timeoutMs = opts?.timeoutMs ?? 4500;
  const limit = opts?.limit ?? 15;
  const filters = opts?.kinds ? POI_FILTERS.slice(0, opts.kinds) : POI_FILTERS;
  const queries = filters.map((f) => ({
    kind: f.id as PoiKind,
    q: f.search,
    fallback: f.en,
  }));
  const near = await Promise.all(
    queries.map(async ({ kind, q, fallback }) => {
      try {
        const r = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=${limit}`,
          { headers: UA, signal: AbortSignal.timeout(timeoutMs) },
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

/** ~16 km cells so nearby pin sets can be reused when the home pin moves slightly. */
function regionKey(lat: number, lng: number, light: boolean) {
  const cell = (v: number) => (Math.round(v / 0.15) * 0.15).toFixed(2);
  return `v11r:${cell(lat)}:${cell(lng)}${light ? ":l" : ""}`;
}

async function loadPlaces(lat: number, lng: number, light: boolean): Promise<PoiPlace[]> {
  const overP = overpassPlaces(
    lat,
    lng,
    light ? { timeout: 4, radius: 3500, signalMs: 4200 } : { timeout: 10, radius: 5000, signalMs: 11000 },
  );
  const photonP = photonPlacesLight(
    lat,
    lng,
    light ? { timeoutMs: 2200, limit: 10, kinds: 8 } : { timeoutMs: 4500, limit: 15 },
  );

  // Photon is usually fast — don't wait the full Overpass budget when pins are already good.
  const photon = await photonP;
  if (photon.length >= 5) {
    const over = await Promise.race([
      overP,
      new Promise<PoiPlace[]>((resolve) => {
        setTimeout(() => resolve([]), light ? 1600 : 2800);
      }),
    ]);
    return mergePlaces(photon, over);
  }
  const over = await overP;
  return mergePlaces(over, photon);
}

function jsonOk(body: unknown, maxAge = 120) {
  const places = (body as { places?: unknown[] } | null)?.places;
  if (Array.isArray(places) && places.length === 0) {
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }
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
    const qkey = `v11:${q.toLowerCase()}${light ? ":l" : ""}`;
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
  } else if (fast) {
    return jsonOk({ lat, lng, address: address || q || "", places: [] }, 300);
  }

  const pkey = `v11p:${lat.toFixed(4)}:${lng.toFixed(4)}${light ? ":l" : ""}`;
  const rkey = regionKey(lat, lng, light);
  const phit = cached(pkey, 30 * 60_000) as { places?: PoiPlace[] } | null;
  if (phit?.places?.length) return jsonOk({ ...phit, lat, lng, address: address || (phit as { address?: string }).address || "" });

  const rhit = cached(rkey, 30 * 60_000) as { places?: PoiPlace[]; address?: string } | null;
  if (rhit?.places?.length) {
    const body = { lat, lng, address: address || rhit.address || "", places: rhit.places };
    putCache(pkey, body);
    return jsonOk(body);
  }

  const places = await loadPlaces(lat, lng, light);
  const body = { lat, lng, address, places };
  // Never cache empty POI sets — that blocks pins for 30 minutes.
  if (places.length) {
    putCache(pkey, body);
    putCache(rkey, body);
    if (q && q.length >= 2) putCache(`v11:${q.toLowerCase()}${light ? ":l" : ""}`, body);
  }
  return jsonOk(body);
}
