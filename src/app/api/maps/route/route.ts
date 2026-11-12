import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const cache = new Map<string, { t: number; body: unknown }>();
const TTL = 6 * 60 * 60 * 1000;
const UA = { "User-Agent": "AXIS-tour/1.0 (real-estate map)", Accept: "application/json" };

// Public OSRM instances (FOSSGIS) — separate servers per profile.
const BASES: Record<string, string> = {
  car: "https://routing.openstreetmap.de/routed-car/route/v1/driving",
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1/foot",
};

const num = (v: string | null) => (v == null || v === "" ? NaN : Number(v));

export async function GET(req: Request) {
  const u = new URL(req.url);
  const from = [num(u.searchParams.get("fromLat")), num(u.searchParams.get("fromLng"))];
  const to = [num(u.searchParams.get("toLat")), num(u.searchParams.get("toLng"))];
  const mode = u.searchParams.get("mode") === "foot" ? "foot" : "car";
  if (![...from, ...to].every(Number.isFinite)) {
    return NextResponse.json({ error: "bad coordinates" }, { status: 400 });
  }

  const key = `${mode}:${from.map((n) => n.toFixed(5))}:${to.map((n) => n.toFixed(5))}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.body);

  // OSRM expects lng,lat order.
  const url = `${BASES[mode]}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
    const json = (await res.json()) as {
      code?: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };
    const r = json.routes?.[0];
    if (!res.ok || json.code !== "Ok" || !r) {
      return NextResponse.json({ error: "no route" }, { status: 502 });
    }
    const body = {
      mode,
      distance: r.distance, // meters
      duration: r.duration, // seconds
      path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    };
    cache.set(key, { t: Date.now(), body });
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "routing unavailable" }, { status: 504 });
  }
}
