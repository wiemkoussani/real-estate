"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { IconList } from "@/components/Icons";
import { POI_FILTERS, type PoiKind, type PoiPlace } from "@/lib/poi";

const PIN_SVG: Record<PoiKind, string> = {
  pharmacy: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>`,
  restaurant: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 21V13M16 3c0 4-2 6-2 10v8"/></svg>`,
  cafe: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M4 10h12v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4z"/><path d="M16 11h2a3 3 0 0 1 0 6h-2"/><path d="M8 4s.5 1.5 0 3M12 4s.5 1.5 0 3"/></svg>`,
  hospital: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>`,
  church: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M4 21h16"/><path d="M6 21V11"/><path d="M18 21V11"/><path d="M6 11a6 6 0 0 1 12 0"/><path d="M12 5V2"/><path d="M10.5 3.2h3"/></svg>`,
  culture: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M4 20h16M6 20V9l6-4 6 4v11"/><path d="M10 13h4"/></svg>`,
  parking: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 17V7h4.5a3.5 3.5 0 0 1 0 7H9"/></svg>`,
  square: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M12 22V12"/><path d="M8 12a4 4 0 1 1 8 0"/><path d="M5 22h14"/></svg>`,
  post: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>`,
  bus: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M6 16v2M18 16v2M4 11h16"/></svg>`,
  mall: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>`,
  school: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="m4 10 8-5 8 5"/><path d="M6 11v7h12v-7"/><path d="M12 11v7"/></svg>`,
  airport: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2" stroke-linejoin="round"><path d="M10.5 4.5a1.5 1.5 0 0 1 3 0V9l7 4v2l-7-2v4l2 1.5V20L12 19l-3.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4z"/></svg>`,
  bank: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="m4 10 8-5 8 5"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16"/></svg>`,
};

const ALL_ON = Object.fromEntries(POI_FILTERS.map((f) => [f.id, true])) as Record<PoiKind, boolean>;

type Payload = { lat: number; lng: number; address: string; places: PoiPlace[] };
type TravelMode = "car" | "foot";
type RouteInfo = { distance: number; duration: number; path: [number, number][] };

const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} كم`);
const fmtTime = (s: number) => {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} دقيقة`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} س ${rest} د` : `${h} ساعة`;
};

export function AroundMap({
  query,
  title,
  lat,
  lng,
}: {
  query: string;
  title: string;
  lat?: number;
  lng?: number;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const routeLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const pointsRef = useRef<[number, number][]>([]);
  const framedSize = useRef({ x: 0, y: 0 });
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [on, setOn] = useState<Record<PoiKind, boolean>>(ALL_ON);
  const [dest, setDest] = useState("");
  const [mode, setMode] = useState<"filters" | "list">("filters");
  const [picked, setPicked] = useState<PoiPlace | null>(null);
  const [ready, setReady] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [travel, setTravel] = useState<TravelMode>("car");
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    let stop = false;
    const hasExact = Number.isFinite(lat) && Number.isFinite(lng);
    const key = hasExact ? `poi-map-v17:${lat!.toFixed(5)},${lng!.toFixed(5)}` : `poi-map-v17:${query}`;
    const aroundUrl = (extra: string) =>
      hasExact
        ? `/api/maps/around?lat=${lat}&lng=${lng}&address=${encodeURIComponent(query)}&${extra}`
        : `/api/maps/around?q=${encodeURIComponent(query)}&${extra}`;
    let hadGoodCache = false;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Payload;
        if (saved?.places?.length) {
          const pinned = hasExact
            ? { ...saved, lat: lat!, lng: lng!, address: query || saved.address }
            : saved;
          setData(pinned);
          hadGoodCache = true;
        } else if (saved?.lat && !hasExact) {
          setData({ ...saved, places: saved.places || [] });
        }
      }
    } catch {
      /* ignore */
    }
    (async () => {
      try {
        // Paint the map center immediately (exact pin or fast geocode).
        if (!hadGoodCache) {
          if (hasExact) {
            setErr("");
            setData({ lat: lat!, lng: lng!, address: query, places: [] });
          } else {
            const fastRes = await fetch(aroundUrl("fast=1"), { signal: AbortSignal.timeout(5000) });
            const fast = (await fastRes.json()) as Payload & { error?: string };
            if (stop) return;
            if (fastRes.ok && fast.lat) {
              setErr("");
              setData({ lat: fast.lat, lng: fast.lng, address: fast.address, places: [] });
            } else {
              setErr("تعذر تحميل الخريطة");
              return;
            }
          }
        }

        setPlacesLoading(true);
        // Fast path: seed + Photon (no Overpass wait).
        const lightRes = await fetch(aroundUrl("light=1"), { signal: AbortSignal.timeout(4000) });
        const light = (await lightRes.json()) as Payload & { error?: string };
        if (stop) return;
        if (lightRes.ok && light.places?.length) {
          setData(light);
          try {
            sessionStorage.setItem(key, JSON.stringify(light));
          } catch {
            /* ignore */
          }
        }

        // Background enrich: wait longer for Overpass (can take ~15–20s when slow).
        void fetch(aroundUrl(""), { signal: AbortSignal.timeout(28000) })
          .then(async (fullRes) => {
            if (!fullRes.ok || stop) return;
            const full = (await fullRes.json()) as Payload;
            if (!full.places?.length) return;
            setData((prev) => {
              const better = !prev?.places?.length || full.places.length >= (prev.places.length || 0);
              if (!better) return prev;
              try {
                sessionStorage.setItem(key, JSON.stringify(full));
              } catch {
                /* ignore */
              }
              return full;
            });
          })
          .catch(() => {
            /* keep light pins */
          })
          .finally(() => {
            if (!stop) setPlacesLoading(false);
          });
      } catch {
        if (!stop && !hadGoodCache) setErr("تعذر تحميل الخريطة");
        if (!stop) setPlacesLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [query, lat, lng]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = dest.trim().toLowerCase();
    return data.places.filter((p) => on[p.kind] && (!q || p.name.toLowerCase().includes(q)));
  }, [data, on, dest]);

  const framePins = (map: import("leaflet").Map) => {
    const pts = pointsRef.current;
    const size = map.getSize();
    if (!pts.length || size.x < 48 || size.y < 48) return;
    const tablet = window.matchMedia("(min-width: 721px) and (max-width: 800px)").matches;
    const pad = Math.max(8, Math.min(tablet ? 48 : 24, Math.floor(Math.min(size.x, size.y) / 8)));
    framedSize.current = { x: size.x, y: size.y };
    if (pts.length > 1) map.fitBounds(pts, { padding: [pad, pad], maxZoom: tablet ? 12 : 15 });
    else map.setView(pts[0], tablet ? 12 : 14);
  };

  useEffect(() => {
    if (!data || !mapEl.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const tablet = window.matchMedia("(min-width: 721px) and (max-width: 800px)").matches;
      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false }).setView(
        [data.lat, data.lng],
        tablet ? 12 : 14,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: "bottomleft" }).addTo(map);
      const home = L.divIcon({
        className: "poi-icon-wrap",
        html: `<span class="poi-home"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3b7dd8" stroke-width="2"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.2"/></svg></span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      L.marker([data.lat, data.lng], { icon: home, zIndexOffset: 800 }).addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      const fit = () => {
        if (mapRef.current !== map) return;
        map.invalidateSize();
        const size = map.getSize();
        if (size.x < 48 || size.y < 48) return;
        const changed = Math.abs(size.x - framedSize.current.x) > 12 || Math.abs(size.y - framedSize.current.y) > 12;
        if (!changed) return;
        framedSize.current = { x: size.x, y: size.y };
        framePins(map);
      };
      requestAnimationFrame(fit);
      const later = window.setTimeout(fit, 280);
      const again = window.setTimeout(fit, 700);
      const watch = new ResizeObserver(fit);
      if (mapEl.current) watch.observe(mapEl.current);
      map.once("unload", () => {
        window.clearTimeout(later);
        window.clearTimeout(again);
        watch.disconnect();
      });
    })();
    return () => {
      cancelled = true;
      setReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [data?.lat, data?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !data || !ready) return;
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!alive) return;
      layer.clearLayers();
      const pts: [number, number][] = [[data.lat, data.lng]];
      visible.forEach((p) => {
        const icon = L.divIcon({
          className: "poi-icon-wrap",
          html: `<span class="poi-pin">${PIN_SVG[p.kind]}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: 200 });
        m.on("click", () => setPicked(p));
        m.addTo(layer);
        if (p.kind !== "airport") pts.push([p.lat, p.lng]);
      });
      pointsRef.current = pts;
      framedSize.current = { x: 0, y: 0 };
      map.invalidateSize();
      framePins(map);
      window.setTimeout(() => {
        if (mapRef.current === map) {
          map.invalidateSize();
          framedSize.current = { x: 0, y: 0 };
          framePins(map);
        }
      }, 200);
    })();
    return () => {
      alive = false;
    };
  }, [visible, data, ready]);

  // Fetch the route from the project to the picked place.
  useEffect(() => {
    if (!data || !picked) {
      setRoute(null);
      setRouteState("idle");
      return;
    }
    const ctrl = new AbortController();
    setRoute(null);
    setRouteState("loading");
    const qs = new URLSearchParams({
      fromLat: String(data.lat),
      fromLng: String(data.lng),
      toLat: String(picked.lat),
      toLng: String(picked.lng),
      mode: travel,
    });
    fetch(`/api/maps/route?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json = (await res.json()) as RouteInfo & { error?: string };
        if (!res.ok || !json.path?.length) throw new Error(json.error || "no route");
        setRoute(json);
        setRouteState("idle");
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setRouteState("error");
      });
    return () => ctrl.abort();
  }, [picked, travel, data?.lat, data?.lng]);

  // Draw the route line on the map and frame it.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer || !ready) return;
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!alive) return;
      layer.clearLayers();
      if (!route) return;
      L.polyline(route.path, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layer);
      const line = L.polyline(route.path, {
        color: travel === "car" ? "#3b7dd8" : "#2dce89",
        weight: 5,
        opacity: 0.95,
        dashArray: travel === "foot" ? "2 10" : undefined,
        lineCap: "round",
      }).addTo(layer);
      line.bindTooltip(`<span dir="rtl">${fmtTime(route.duration)} · ${fmtKm(route.distance)}</span>`, {
        permanent: true,
        direction: "center",
        className: "poi-route-tip",
      });
      map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 17 });
    })();
    return () => {
      alive = false;
    };
  }, [route, ready, travel]);

  const clearRoute = () => {
    setPicked(null);
    routeLayerRef.current?.clearLayers();
    const map = mapRef.current;
    if (map) {
      framedSize.current = { x: 0, y: 0 };
      framePins(map);
    }
  };

  const allOn = POI_FILTERS.every((f) => on[f.id]);
  const toggleAll = () => {
    const next = !allOn;
    setOn(Object.fromEntries(POI_FILTERS.map((f) => [f.id, next])) as Record<PoiKind, boolean>);
  };

  return (
    <div className="poi-explorer" dir="ltr">
      <div className="poi-map-wrap">
        <div ref={mapEl} className="poi-map" />
        {!data && !err && <div className="poi-status" dir="rtl">جارٍ تحميل الخريطة…</div>}
        {data && placesLoading && <div className="poi-status poi-status-soft" dir="rtl">جارٍ تحميل الأماكن…</div>}
        {err && <div className="poi-status">{err}</div>}
      </div>
      <aside className="poi-panel">
        <div className="poi-panel-top">
          <button type="button" className={mode === "list" ? "on" : ""} onClick={() => setMode(mode === "list" ? "filters" : "list")}>
            <IconList size={14} /> القائمة
          </button>
        </div>
        <h3>{title}</h3>
        <p className="poi-addr">{picked ? picked.name : data?.address || query}</p>
        <label className="poi-dest" dir="rtl">
          <span>الوجهة</span>
          <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="أو انقر على الخريطة" />
        </label>
        {picked && (
          <div className="poi-route" dir="rtl">
            <div className="poi-route-head">
              <span className="poi-mini" dangerouslySetInnerHTML={{ __html: PIN_SVG[picked.kind] }} />
              <strong>{picked.name}</strong>
              <button type="button" className="poi-route-x" onClick={clearRoute} aria-label="إغلاق المسار">
                ×
              </button>
            </div>
            <div className="poi-route-modes">
              <button type="button" className={travel === "car" ? "on" : ""} onClick={() => setTravel("car")}>
                سيارة
              </button>
              <button type="button" className={travel === "foot" ? "on" : ""} onClick={() => setTravel("foot")}>
                مشياً
              </button>
            </div>
            {routeState === "loading" && <p className="poi-route-msg">جارٍ حساب المسار…</p>}
            {routeState === "error" && <p className="poi-route-msg">المسار غير متاح</p>}
            {route && routeState === "idle" && (
              <div className="poi-route-stats">
                <div>
                  <b>{fmtTime(route.duration)}</b>
                  <span>الوقت</span>
                </div>
                <div>
                  <b>{fmtKm(route.distance)}</b>
                  <span>المسافة</span>
                </div>
              </div>
            )}
          </div>
        )}
        {mode === "list" ? (
          <ul className="poi-list">
            {visible.slice(0, 80).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(p);
                    mapRef.current?.setView([p.lat, p.lng], 17);
                  }}
                >
                  <span className="poi-mini" dangerouslySetInnerHTML={{ __html: PIN_SVG[p.kind] }} />
                  <span>{p.name}</span>
                </button>
              </li>
            ))}
            {!visible.length && <li className="poi-empty" dir="rtl">لا توجد أماكن لهذه الفلاتر</li>}
          </ul>
        ) : (
          <div className="poi-filters">
            <div className="poi-filters-head">
              <span className="poi-mini" aria-hidden />
              <span>تصفية</span>
              <button type="button" className={`poi-switch ${allOn ? "on" : ""}`} onClick={toggleAll} aria-label="كل التصنيفات" />
            </div>
            {POI_FILTERS.map((f) => (
              <div key={f.id} className="poi-row">
                <span className="poi-mini" dangerouslySetInnerHTML={{ __html: PIN_SVG[f.id] }} />
                <span>{f.ar}</span>
                <button
                  type="button"
                  className={`poi-switch ${on[f.id] ? "on" : ""}`}
                  onClick={() => setOn((s) => ({ ...s, [f.id]: !s[f.id] }))}
                  aria-label={f.ar}
                />
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
