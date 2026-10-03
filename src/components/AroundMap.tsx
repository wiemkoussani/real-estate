"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { IconList } from "@/components/Icons";
import { POI_FILTERS, type PoiKind, type PoiPlace } from "@/lib/poi";

const PIN_SVG: Record<PoiKind, string> = {
  pharmacy: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>`,
  restaurant: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M8 21V13M16 3c0 4-2 6-2 10v8"/></svg>`,
  cafe: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M4 10h12v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4z"/><path d="M16 11h2a3 3 0 0 1 0 6h-2"/><path d="M8 4s.5 1.5 0 3M12 4s.5 1.5 0 3"/></svg>`,
  church: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M12 3v4M10 5h4"/><path d="M5 21V10l7-4 7 4v11"/><path d="M10 21v-5h4v5"/></svg>`,
  culture: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M4 20h16M6 20V9l6-4 6 4v11"/><path d="M10 13h4"/></svg>`,
  parking: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 17V7h4.5a3.5 3.5 0 0 1 0 7H9"/></svg>`,
  square: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M12 22V12"/><path d="M8 12a4 4 0 1 1 8 0"/><path d="M5 22h14"/></svg>`,
  post: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></svg>`,
  bus: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M6 16v2M18 16v2M4 11h16"/></svg>`,
  mall: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>`,
  school: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="m4 10 8-5 8 5"/><path d="M6 11v7h12v-7"/><path d="M12 11v7"/></svg>`,
  bank: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4a5568" stroke-width="2"><path d="m4 10 8-5 8 5"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16"/></svg>`,
};

const ALL_ON = Object.fromEntries(POI_FILTERS.map((f) => [f.id, true])) as Record<PoiKind, boolean>;

type Payload = { lat: number; lng: number; address: string; places: PoiPlace[] };

export function AroundMap({ query, title }: { query: string; title: string }) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [on, setOn] = useState<Record<PoiKind, boolean>>(ALL_ON);
  const [dest, setDest] = useState("");
  const [mode, setMode] = useState<"filters" | "list">("filters");
  const [picked, setPicked] = useState<PoiPlace | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stop = false;
    const key = `poi-map-v2:${query}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Payload;
        if (saved?.lat) setData(saved);
      }
    } catch {
      /* ignore */
    }
    (async () => {
      try {
        const poiRes = await fetch(`/api/maps/around?q=${encodeURIComponent(query)}`);
        const pois = await poiRes.json();
        if (stop) return;
        if (!poiRes.ok) {
          setErr(pois.error || "تعذر تحميل الخريطة");
          return;
        }
        setData(pois);
        try {
          sessionStorage.setItem(key, JSON.stringify(pois));
        } catch {
          /* ignore */
        }
      } catch {
        if (!stop) setErr("تعذر تحميل الخريطة");
      }
    })();
    return () => {
      stop = true;
    };
  }, [query]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = dest.trim().toLowerCase();
    return data.places.filter((p) => on[p.kind] && (!q || p.name.toLowerCase().includes(q)));
  }, [data, on, dest]);

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
      const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false }).setView([data.lat, data.lng], 14);
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
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 60);
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
        pts.push([p.lat, p.lng]);
      });
      if (pts.length > 1) {
        map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible, data, ready]);

  const allOn = POI_FILTERS.every((f) => on[f.id]);
  const toggleAll = () => {
    const next = !allOn;
    setOn(Object.fromEntries(POI_FILTERS.map((f) => [f.id, next])) as Record<PoiKind, boolean>);
  };

  return (
    <div className="poi-explorer" dir="ltr">
      <div className="poi-map-wrap">
        <div ref={mapEl} className="poi-map" />
        {!data && !err && <div className="poi-status">Loading map…</div>}
        {err && <div className="poi-status">{err}</div>}
      </div>
      <aside className="poi-panel">
        <div className="poi-panel-top">
          <button type="button" className={mode === "list" ? "on" : ""} onClick={() => setMode(mode === "list" ? "filters" : "list")}>
            <IconList size={14} /> List
          </button>
        </div>
        <h3>{title}</h3>
        <p className="poi-addr">{picked ? picked.name : data?.address || query}</p>
        <label className="poi-dest">
          <span>Destination</span>
          <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="or click on map" />
        </label>
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
            {!visible.length && <li className="poi-empty">No places for these filters</li>}
          </ul>
        ) : (
          <div className="poi-filters">
            <div className="poi-filters-head">
              <span>Filters</span>
              <button type="button" className={`poi-switch ${allOn ? "on" : ""}`} onClick={toggleAll} aria-label="All filters" />
            </div>
            {POI_FILTERS.map((f) => (
              <div key={f.id} className="poi-row">
                <span className="poi-mini" dangerouslySetInnerHTML={{ __html: PIN_SVG[f.id] }} />
                <span>{f.en}</span>
                <button
                  type="button"
                  className={`poi-switch ${on[f.id] ? "on" : ""}`}
                  onClick={() => setOn((s) => ({ ...s, [f.id]: !s[f.id] }))}
                  aria-label={f.en}
                />
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
