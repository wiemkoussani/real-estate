import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";

type Visit = {
  id: number;
  visitor_id: string;
  created_at: string;
  source: string | null;
  device: string | null;
  os: string | null;
  city: string | null;
  country: string | null;
  duration_s: number | null;
};
type UnitEvent = { visit_id: number | null; visitor_id: string; unit_display_id: string; kind: "view" | "favorite"; duration_s: number; created_at: string };
type Lead = { unit_display_id: string | null; created_at: string };

const DAY = 864e5;
const ENGAGED_S = 60;
const QUICK_EXIT_S = 10;

/** Supabase returns at most 1000 rows per request: page through. */
async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, cap = 60000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error || !Array.isArray(data)) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 1000) / 10 : 0);
const delta = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);
const count = <K extends string>(items: K[]) => {
  const m = new Map<K, number>();
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
/** short, stable, anonymous label for a device id */
const visitorLabel = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `VIS_${String(h % 100000).padStart(5, "0")}`;
};

async function load(service: SupabaseClient, complexId: string, since: string | null) {
  const visits = await fetchAll<Visit>((a, b) => {
    let q = service.from("complex_visits").select("id, visitor_id, created_at, source, device, os, city, country, duration_s").eq("complex_id", complexId);
    if (since) q = q.gte("created_at", since);
    return q.order("created_at", { ascending: false }).range(a, b);
  });
  // before migration 014 the analytics columns do not exist: fall back to the basic ones
  const safeVisits = visits.length
    ? visits
    : await fetchAll<Visit>((a, b) => {
      let q = service.from("complex_visits").select("id, visitor_id, created_at").eq("complex_id", complexId);
      if (since) q = q.gte("created_at", since);
      return q.order("created_at", { ascending: false }).range(a, b);
    });
  const events = await fetchAll<UnitEvent>((a, b) => {
    let q = service.from("unit_events").select("visit_id, visitor_id, unit_display_id, kind, duration_s, created_at").eq("complex_id", complexId);
    if (since) q = q.gte("created_at", since);
    return q.order("created_at", { ascending: false }).range(a, b);
  });
  const leads = await fetchAll<Lead>((a, b) => {
    let q = service.from("leads").select("unit_display_id, created_at").eq("complex_id", complexId);
    if (since) q = q.gte("created_at", since);
    return q.range(a, b);
  });
  return { visits: safeVisits, events, leads };
}

export async function GET(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const complexId = url.searchParams.get("complexId") ?? "";
  const days = Math.max(0, Math.min(3650, Number(url.searchParams.get("days") ?? 30) || 0)); // 0 = all time
  const service = createServiceSupabase() ?? auth.supabase;
  const projects = await listComplexIdsForUser(service, auth.user.id);
  if (!projects.includes(complexId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = Date.now();
  const start = days ? now - days * DAY : 0;
  const prevStart = days ? now - 2 * days * DAY : 0;
  const { visits: allVisits, events: allEvents, leads: allLeads } = await load(service, complexId, days ? new Date(prevStart).toISOString() : null);
  const inPeriod = <T extends { created_at: string }>(rows: T[]) => rows.filter((r) => Date.parse(r.created_at) >= start);
  const inPrev = <T extends { created_at: string }>(rows: T[]) => (days ? rows.filter((r) => { const t = Date.parse(r.created_at); return t >= prevStart && t < start; }) : []);

  const visits = inPeriod(allVisits);
  const prevVisits = inPrev(allVisits);
  const events = inPeriod(allEvents);
  const prevEvents = inPrev(allEvents);
  const leads = inPeriod(allLeads);

  const { data: unitRows } = await service.from("units").select("display_id, model, type").eq("complex_id", complexId);
  const units = (unitRows ?? []) as { display_id: string; model: string | null; type: number }[];

  /* ---------------- traffic ---------------- */
  const perVisitor = new Map<string, number>();
  for (const v of visits) perVisitor.set(v.visitor_id, (perVisitor.get(v.visitor_id) ?? 0) + 1);
  const unique = perVisitor.size;
  const returning = [...perVisitor.values()].filter((n) => n > 1).length;
  const prevUnique = new Set(prevVisits.map((v) => v.visitor_id)).size;
  const prevReturning = (() => {
    const m = new Map<string, number>();
    for (const v of prevVisits) m.set(v.visitor_id, (m.get(v.visitor_id) ?? 0) + 1);
    return [...m.values()].filter((n) => n > 1).length;
  })();

  const viewedVisits = new Set(events.filter((e) => e.kind === "view" && e.visit_id).map((e) => e.visit_id as number));
  const engaged = visits.filter((v) => (v.duration_s ?? 0) >= ENGAGED_S || viewedVisits.has(v.id)).length;
  const quick = visits.filter((v) => (v.duration_s ?? 0) < QUICK_EXIT_S && !viewedVisits.has(v.id)).length;

  // daily series (weekly buckets for long ranges)
  const firstT = visits.reduce((m, v) => Math.min(m, Date.parse(v.created_at)), visits.length ? Infinity : now - 29 * DAY);
  const from = days ? start : firstT;
  const spanDays = Math.max(1, Math.ceil((now - from) / DAY));
  const bucketDays = spanDays > 120 ? 7 : 1;
  const buckets = Math.ceil(spanDays / bucketDays);
  const bucketStart = (i: number) => from + i * bucketDays * DAY;
  const series = Array.from({ length: buckets }, (_, i) => ({ t: new Date(bucketStart(i)).toISOString(), sessions: 0, visitors: new Set<string>() }));
  for (const v of visits) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor((Date.parse(v.created_at) - from) / (bucketDays * DAY))));
    series[i].sessions += 1;
    series[i].visitors.add(v.visitor_id);
  }

  const place = (v: Visit) => (v.city ? `${v.city}${v.country ? `, ${v.country}` : ""}` : v.country || "Unknown");
  const geoMap = new Map<string, { visitors: Set<string>; sessions: number; time: number }>();
  for (const v of visits) {
    const k = place(v);
    const g = geoMap.get(k) ?? { visitors: new Set(), sessions: 0, time: 0 };
    g.visitors.add(v.visitor_id);
    g.sessions += 1;
    g.time += v.duration_s ?? 0;
    geoMap.set(k, g);
  }
  const geoRows = [...geoMap.entries()].map(([k, g]) => ({ location: k, visitors: g.visitors.size, sessions: g.sessions, avg: g.sessions ? Math.round(g.time / g.sessions) : 0 }));
  geoRows.sort((a, b) => b.visitors - a.visitors);
  const topGeo = geoRows.slice(0, 4);
  const rest = geoRows.slice(4);
  if (rest.length) {
    const sessions = rest.reduce((n, r) => n + r.sessions, 0);
    topGeo.push({
      location: "Other locations",
      visitors: rest.reduce((n, r) => n + r.visitors, 0),
      sessions,
      avg: sessions ? Math.round(rest.reduce((n, r) => n + r.avg * r.sessions, 0) / sessions) : 0,
    });
  }

  const viewsByVisit = new Map<number, string[]>();
  for (const e of events) {
    if (e.kind !== "view" || !e.visit_id) continue;
    const list = viewsByVisit.get(e.visit_id) ?? [];
    if (!list.includes(e.unit_display_id)) list.push(e.unit_display_id);
    viewsByVisit.set(e.visit_id, list);
  }
  const recent = visits.slice(0, 8).map((v) => ({
    visitor: visitorLabel(v.visitor_id),
    source: v.source ?? "direct",
    device: v.device ?? "unknown",
    location: place(v),
    properties: viewsByVisit.get(v.id) ?? [],
    duration: v.duration_s ?? 0,
    at: v.created_at,
  }));

  /* ---------------- properties ---------------- */
  type U = { villa: string; model: string; viewers: Set<string>; views: number; favorites: number; inquiries: number; time: number };
  const byUnit = new Map<string, U>();
  const unitOf = (villa: string) => {
    let u = byUnit.get(villa);
    if (!u) {
      const row = units.find((x) => x.display_id === villa);
      u = { villa, model: row?.model || (row ? `${row.type}A` : "—"), viewers: new Set(), views: 0, favorites: 0, inquiries: 0, time: 0 };
      byUnit.set(villa, u);
    }
    return u;
  };
  for (const r of units) unitOf(r.display_id);
  for (const e of events) {
    const u = unitOf(e.unit_display_id);
    if (e.kind === "view") {
      u.views += 1;
      u.viewers.add(e.visitor_id);
      u.time += e.duration_s;
    } else u.favorites += 1;
  }
  for (const l of leads) if (l.unit_display_id) unitOf(l.unit_display_id).inquiries += 1;

  const unitStats = [...byUnit.values()].map((u) => ({
    villa: u.villa,
    model: u.model,
    viewers: u.viewers.size,
    views: u.views,
    favorites: u.favorites,
    inquiries: u.inquiries,
    avgTime: u.views ? Math.round(u.time / u.views) : 0,
    rate: u.viewers.size ? Math.round((u.inquiries / u.viewers.size) * 1000) / 10 : 0,
  }));
  // interest level: thirds of the units that were viewed at least once
  const viewedSorted = unitStats.filter((u) => u.views > 0).map((u) => u.views).sort((a, b) => a - b);
  const q = (p: number) => viewedSorted[Math.floor((viewedSorted.length - 1) * p)] ?? 0;
  const hi = q(0.66);
  const mid = q(0.33);
  const level = (v: number) => (v === 0 ? "low" : v >= hi ? "high" : v >= mid ? "medium" : "low");

  const byModel = new Map<string, { time: number; views: number }>();
  for (const u of byUnit.values()) {
    const m = byModel.get(u.model) ?? { time: 0, views: 0 };
    m.time += u.time;
    m.views += u.views;
    byModel.set(u.model, m);
  }

  const views = events.filter((e) => e.kind === "view").length;
  const favorites = events.filter((e) => e.kind === "favorite").length;

  return NextResponse.json({
    period: { days, from: new Date(from).toISOString(), bucketDays },
    traffic: {
      sessions: visits.length,
      sessionsDelta: delta(visits.length, prevVisits.length),
      unique,
      uniqueDelta: delta(unique, prevUnique),
      returning,
      returningDelta: delta(returning, prevReturning),
      sources: count(visits.map((v) => v.source ?? "direct")).map(([k, n]) => ({ key: k, n, pct: pct(n, visits.length) })),
      devices: count(visits.map((v) => v.device ?? "unknown")).map(([k, n]) => ({ key: k, n, pct: pct(n, visits.length) })),
      os: count(visits.filter((v) => v.os).map((v) => v.os as string)).map(([k, n]) => ({ key: k, n, pct: pct(n, visits.length) })),
      series: series.map((s) => ({ t: s.t, sessions: s.sessions, unique: s.visitors.size })),
      geo: topGeo,
      locations: geoRows.filter((g) => g.location !== "Unknown").length,
      engagement: { engaged: pct(engaged, visits.length), returning: pct(returning, unique), quick: pct(quick, visits.length) },
      recent,
    },
    property: {
      viewedUnits: unitStats.filter((u) => u.views > 0).length,
      totalUnits: units.length,
      views,
      viewsDelta: delta(views, prevEvents.filter((e) => e.kind === "view").length),
      favorites,
      favoritesDelta: delta(favorites, prevEvents.filter((e) => e.kind === "favorite").length),
      inquiries: leads.length,
      inquiryRate: pct(leads.length, unique),
      units: unitStats.map((u) => ({ ...u, level: level(u.views) })),
      byModel: [...byModel.entries()].map(([model, m]) => ({ model, avgTime: m.views ? Math.round(m.time / m.views) : 0, views: m.views })).sort((a, b) => b.avgTime - a.avgTime),
    },
  });
}
