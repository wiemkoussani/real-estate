"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ComplexRow } from "@/lib/types";
import { exportExcel } from "./contacts-export";
import ProjectStrip from "./ProjectStrip";
import { Donut, HBars, LineChart, VBars, fmtDur, fmtN, type Slice } from "./AnalyticsCharts";

/* Categorical order validated for colour-blind safety (blue · green · amber · red · indigo); colour follows the source. */
const C = { blue: "#3978F6", green: "#10B981", amber: "#F59E0B", red: "#EF5362", indigo: "#7C83C9" };
const SOURCE: Record<string, { label: string; color: string }> = {
  direct: { label: "Direct Link", color: C.blue },
  qr: { label: "QR Code", color: C.green },
  instagram: { label: "Instagram", color: C.amber },
  facebook: { label: "Facebook", color: C.red },
};
const DEVICE: Record<string, { label: string; color: string }> = {
  mobile: { label: "Mobile", color: "linear-gradient(90deg, #3978F6 0%, #78A5FF 100%)" },
  desktop: { label: "Desktop", color: C.green },
  tablet: { label: "Tablet", color: C.amber },
};

type Data = {
  period: { days: number; from: string; bucketDays: number };
  traffic: {
    sessions: number; sessionsDelta: number | null; unique: number; uniqueDelta: number | null; returning: number; returningDelta: number | null;
    sources: { key: string; n: number; pct: number }[];
    devices: { key: string; n: number; pct: number }[];
    os: { key: string; n: number; pct: number }[];
    series: { t: string; sessions: number; unique: number }[];
    geo: { location: string; visitors: number; sessions: number; avg: number }[];
    locations: number;
    engagement: { engaged: number; returning: number; quick: number };
    recent: { visitor: string; source: string; device: string; location: string; properties: string[]; duration: number; at: string }[];
  };
  property: {
    viewedUnits: number; totalUnits: number; views: number; viewsDelta: number | null; favorites: number; favoritesDelta: number | null;
    inquiries: number; inquiryRate: number;
    units: { villa: string; model: string; viewers: number; views: number; favorites: number; inquiries: number; avgTime: number; rate: number; level: "high" | "medium" | "low" }[];
    byModel: { model: string; avgTime: number; views: number }[];
  };
};

const PERIODS: [number, string][] = [[7, "Last 7 days"], [30, "1 Month"], [90, "3 Months"], [0, "All time"]];

function Delta({ v, all }: { v: number | null; all?: boolean }) {
  if (all) return <span className="axn-delta muted">Since the tour went live</span>;
  if (v === null) return <span className="axn-delta muted">No data for the previous period</span>;
  const up = v >= 0;
  return <span className={`axn-delta ${up ? "up" : "down"}`}>{up ? "↑" : "↓"} {Math.abs(v)}% vs previous period</span>;
}

function Stat({ label, value, sub, icon, tint }: { label: string; value: ReactNode; sub: ReactNode; icon: string; tint: string }) {
  return (
    <div className="axn-stat">
      <div className="axn-stat-top">
        <span>{label}</span>
        <i style={{ background: tint }} aria-hidden="true">{icon}</i>
      </div>
      <strong>{value}</strong>
      {sub}
    </div>
  );
}

function Card({ title, sub, pill, pillTone = "blue", children, className = "" }: { title: string; sub: string; pill?: ReactNode; pillTone?: "blue" | "green" | "red"; children: ReactNode; className?: string }) {
  return (
    <section className={`axn-card ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        {pill ? <span className={`axn-pill ${pillTone}`}>{pill}</span> : null}
      </header>
      {children}
    </section>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function AnalyticsView({
  cx,
  complexes,
  onPick,
  tabs,
}: {
  cx: ComplexRow;
  complexes: ComplexRow[];
  onPick: (id: string) => void;
  /** project tabs when shown inside a project */
  tabs?: ReactNode;
}) {
  const [sub, setSub] = useState<"traffic" | "property">("traffic");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    fetch(`/api/client/analytics?complexId=${encodeURIComponent(cx.id)}&days=${days}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not load analytics");
        return j as Data;
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setErr(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [cx.id, days]);

  const t = data?.traffic;
  const p = data?.property;

  const sources: Slice[] = useMemo(() => {
    if (!t) return [];
    const out: Slice[] = [];
    let other = 0;
    for (const s of t.sources) {
      if (SOURCE[s.key]) out.push({ key: s.key, label: SOURCE[s.key].label, value: s.n, pct: s.pct, color: SOURCE[s.key].color });
      else other += s.n;
    }
    if (other) out.push({ key: "other", label: "Other", value: other, pct: Math.round((other / Math.max(1, t.sessions)) * 1000) / 10, color: C.indigo });
    // fixed order, so a colour always means the same source
    const order = ["direct", "qr", "facebook", "instagram", "other"];
    return out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [t]);

  const units = useMemo(() => [...(p?.units ?? [])].sort((a, b) => a.villa.localeCompare(b.villa, undefined, { numeric: true })), [p]);
  const selected = units.find((u) => u.villa === picked) ?? [...units].sort((a, b) => b.views - a.views)[0];
  const top = (k: "viewers" | "favorites" | "inquiries", n: number) => [...units].filter((u) => u[k] > 0).sort((a, b) => b[k] - a[k] || b.views - a.views).slice(0, n);
  const maxModel = Math.max(1, ...(p?.byModel ?? []).map((m) => m.avgTime));
  const periodLabel = days ? `Showing last ${days} days` : "Showing all time";

  const exportCsv = () => {
    if (!data) return;
    if (sub === "traffic") {
      exportExcel({
        title: `${cx.name} Traffic Analytics`,
        head: ["Date", "Visits", "Unique visitors"],
        rows: data.traffic.series.map((s) => [s.t.slice(0, 10), String(s.sessions), String(s.unique)]),
      });
    } else {
      exportExcel({
        title: `${cx.name} Property Analytics`,
        head: ["Villa", "Model", "Unique viewers", "Total views", "Favorites", "Inquiries", "Inquiry rate %", "Avg. time (s)", "Interest"],
        rows: units.map((u) => [u.villa, u.model, String(u.viewers), String(u.views), String(u.favorites), String(u.inquiries), String(u.rate), String(u.avgTime), u.level]),
      });
    }
  };

  return (
    <section className="axn">
      <header className="axn-head">
        <div className="axn-title">
          <h1>{sub === "traffic" ? "Traffic Analytics" : "Property Analytics"}</h1>
          <p>
            {sub === "traffic"
              ? "Understand where visitors come from and how they interact with your virtual maquette."
              : "Discover which properties attract attention, generate interest and drive inquiries."}
          </p>
        </div>
        {tabs}
      </header>

      <ProjectStrip cx={cx} complexes={complexes} onPick={onPick} />

      <nav className="axn-subnav" aria-label="Analytics sections">
        <button type="button" className={sub === "traffic" ? "on" : ""} onClick={() => setSub("traffic")}>Traffic Analytics</button>
        <button type="button" className={sub === "property" ? "on" : ""} onClick={() => setSub("property")}>Property Analytics</button>
      </nav>

      <div className="axn-period">
        <span className="axn-period-label">PERIOD</span>
        <div className="axn-seg" role="radiogroup" aria-label="Period">
          {PERIODS.map(([d, label]) => (
            <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>{label}</button>
          ))}
        </div>
        <span className="axn-spacer" />
        <span className="axn-period-note">{loading ? "Loading…" : periodLabel}</span>
        <button type="button" className="axn-btn" onClick={exportCsv} disabled={!data}>↓ Export CSV</button>
      </div>

      {err ? <p className="axd-err" role="alert">{err}</p> : null}

      {!data ? (
        <div className="axn-loading">{loading ? "Loading analytics…" : null}</div>
      ) : sub === "traffic" && t ? (
        <div className={`axn-body${loading ? " stale" : ""}`}>
          <div className="axn-stats three">
            <Stat label="Total Visitors" value={fmtN(t.sessions)} sub={<Delta v={t.sessionsDelta} all={!days} />} icon="♙" tint="#EAF1FF" />
            <Stat label="Unique Visitors" value={fmtN(t.unique)} sub={<Delta v={t.uniqueDelta} all={!days} />} icon="◎" tint="#E7FBF3" />
            <Stat label="Returning Visitors" value={fmtN(t.returning)} sub={<Delta v={t.returningDelta} all={!days} />} icon="◷" tint="#FFF4DF" />
          </div>

          <div className="axn-row half">
            <Card title="Traffic Sources" sub="Where visitors discovered this maquette" pill={`${fmtN(t.sessions)} sessions`}>
              {t.sessions ? <Donut slices={sources} total={t.sessions} unit="Sessions" /> : <p className="axn-empty">No visits in this period yet.</p>}
              <p className="axn-note">QR codes made on the QR page are counted as “QR Code”. Add ?src=facebook (or instagram…) to links you post to see them here.</p>
            </Card>
            <Card title="Device Distribution" sub="Devices used to access the virtual tour">
              <HBars
                rows={["mobile", "desktop", "tablet"].map((k) => {
                  const d = t.devices.find((x) => x.key === k);
                  return { key: k, label: DEVICE[k].label, value: d?.pct ?? 0, max: 100, color: DEVICE[k].color, text: `${d?.pct ?? 0}%` };
                })}
              />
              {t.os.length ? <p className="axn-note">Operating systems: {t.os.slice(0, 4).map((o) => `${o.key} ${o.pct}%`).join(" · ")}</p> : null}
            </Card>
          </div>

          <Card title="Visitors & Sessions Over Time" sub={data.period.bucketDays > 1 ? "Weekly activity across the selected period" : "Daily activity across the selected period"}>
            <LineChart
              points={t.series.map((s) => ({ t: s.t, a: s.sessions, b: s.unique }))}
              labelA="Visits"
              labelB="Unique Visitors"
              colorA={C.blue}
              colorB={C.green}
              bucketDays={data.period.bucketDays}
            />
          </Card>

          <div className="axn-row wide">
            <Card title="Visitor Geography" sub="Top locations by visitor count" pill={`${t.locations} location${t.locations === 1 ? "" : "s"}`}>
              <table className="axn-table">
                <thead><tr><th>Location</th><th>Visitors</th><th>Sessions</th><th>Avg. time</th></tr></thead>
                <tbody>
                  {t.geo.map((g) => (
                    <tr key={g.location}><td className="strong">{g.location}</td><td>{fmtN(g.visitors)}</td><td>{fmtN(g.sessions)}</td><td>{fmtDur(g.avg)}</td></tr>
                  ))}
                </tbody>
              </table>
              {!t.geo.length ? <p className="axn-empty">No visits in this period yet.</p> : null}
              {t.geo.some((g) => g.location === "Unknown") ? <p className="axn-note">Locations are filled in on the live site (the host provides the city); local tests show “Unknown”.</p> : null}
            </Card>
            <Card title="Engagement Summary" sub="Quality of visitor sessions">
              <HBars
                rows={[
                  { key: "e", label: "Engaged sessions", value: t.engagement.engaged, max: 100, color: "linear-gradient(90deg, #3978F6 0%, #78A5FF 100%)", text: `${t.engagement.engaged}%` },
                  { key: "r", label: "Returning visitors", value: t.engagement.returning, max: 100, color: C.green, text: `${t.engagement.returning}%` },
                  { key: "q", label: "Quick exits", value: t.engagement.quick, max: 100, color: C.amber, text: `${t.engagement.quick}%` },
                ]}
              />
              <p className="axn-note">Engaged = stayed 1 minute or more, or opened a villa. Quick exit = left within 10 seconds without opening a villa.</p>
            </Card>
          </div>

          <Card title="Recent Sessions" sub="Latest anonymized visitor activity" pill="Privacy-safe visitor IDs" pillTone="green">
            <div className="axn-scroll">
              <table className="axn-table">
                <thead><tr><th>Visitor</th><th>Source</th><th>Device</th><th>Location</th><th>Properties viewed</th><th>Duration</th><th>Date</th></tr></thead>
                <tbody>
                  {t.recent.map((r, i) => (
                    <tr key={`${r.visitor}-${i}`}>
                      <td className="strong">{r.visitor}</td>
                      <td>{SOURCE[r.source]?.label ?? cap(r.source)}</td>
                      <td>{cap(r.device)}</td>
                      <td>{r.location}</td>
                      <td>{r.properties.length ? r.properties.slice(0, 4).map((v) => `Villa ${v}`).join(", ") + (r.properties.length > 4 ? ` +${r.properties.length - 4}` : "") : "—"}</td>
                      <td>{fmtDur(r.duration)}</td>
                      <td>{when(r.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!t.recent.length ? <p className="axn-empty">No visits in this period yet.</p> : null}
            </div>
          </Card>
        </div>
      ) : p ? (
        <div className={`axn-body${loading ? " stale" : ""}`}>
          <div className="axn-stats four">
            <Stat label="Properties Viewed" value={<>{fmtN(p.viewedUnits)} <small>/ {fmtN(p.totalUnits)}</small></>} sub={<span className="axn-delta muted">Unique units viewed</span>} icon="⌂" tint="#EAF1FF" />
            <Stat label="Total Property Views" value={fmtN(p.views)} sub={<Delta v={p.viewsDelta} all={!days} />} icon="◉" tint="#F1EBFF" />
            <Stat label="Favorites" value={fmtN(p.favorites)} sub={<Delta v={p.favoritesDelta} all={!days} />} icon="♡" tint="#FFEAED" />
            <Stat label="Property Inquiries" value={fmtN(p.inquiries)} sub={<span className="axn-delta muted">{p.inquiryRate}% of maquette visitors</span>} icon="✉" tint="#E7FBF3" />
          </div>

          <div className="axn-row half">
            <Card title="Most Viewed Properties" sub="Ranked by unique visitors" pill="Top 5">
              <RankTable rows={top("viewers", 5).map((u) => [u.villa, fmtN(u.viewers), fmtN(u.views)])} head={["Unique viewers", "Total views"]} onPick={setPicked} />
            </Card>
            <Card title="Most Liked Apartments" sub="Top 20 units by favorites" pill="Top 20" pillTone="red">
              {top("favorites", 20).length ? (
                <>
                  <VBars rows={top("favorites", 20).map((u) => ({ key: u.villa, label: u.villa, value: u.favorites }))} unit="Favorites" />
                  <p className="axn-note">Peak: {fmtN(top("favorites", 1)[0]?.favorites ?? 0)} likes · {top("favorites", 20).length} units shown</p>
                </>
              ) : <p className="axn-empty">No favorites in this period yet.</p>}
            </Card>
          </div>

          <div className="axn-row wide">
            <Card title="Property Interest Heatmap" sub="Click a unit to inspect its metrics" pill={<>Green: high · Amber: medium · Grey: low</>}>
              <div className="axn-heat" role="listbox" aria-label="Villas by interest">
                {units.map((u) => (
                  <button
                    key={u.villa}
                    type="button"
                    role="option"
                    aria-selected={selected?.villa === u.villa}
                    className={`axn-tile ${u.level}${selected?.villa === u.villa ? " on" : ""}`}
                    onClick={() => setPicked(u.villa)}
                    title={`Villa ${u.villa}: ${u.views} views, ${u.favorites} favorites`}
                  >
                    <b>{u.villa}</b>
                    <small>{cap(u.level)}</small>
                  </button>
                ))}
              </div>
            </Card>
            <Card
              title="Selected Property"
              sub={selected ? `Villa ${selected.villa} · Model ${selected.model}` : "Pick a villa in the heatmap"}
              pill={selected ? `${cap(selected.level)} interest` : undefined}
              pillTone={selected?.level === "high" ? "green" : "blue"}
            >
              {selected ? (
                <>
                  <div className="axn-selected">
                    <span>Unique Viewers</span>
                    <strong>{fmtN(selected.viewers)}</strong>
                    <small>During selected period</small>
                  </div>
                  <dl className="axn-kv">
                    <dt>Total views</dt><dd>{fmtN(selected.views)}</dd>
                    <dt>Favorites</dt><dd>{fmtN(selected.favorites)}</dd>
                    <dt>Inquiries</dt><dd>{fmtN(selected.inquiries)}</dd>
                    <dt>Avg. time</dt><dd>{fmtDur(selected.avgTime)}</dd>
                  </dl>
                </>
              ) : <p className="axn-empty">No villas in this project.</p>}
            </Card>
          </div>

          <div className="axn-row half">
            <Card title="Most Contacted Properties" sub="Units generating the most inquiry actions" pill="Top 5" pillTone="green">
              <RankTable rows={top("inquiries", 5).map((u) => [u.villa, fmtN(u.inquiries), `${u.rate}%`])} head={["Inquiries", "Inquiry rate"]} onPick={setPicked} />
            </Card>
            <Card title="Average Engagement by Property Type" sub="Average active time per viewed unit">
              {p.byModel.some((m) => m.views) ? (
                <HBars
                  rows={p.byModel.filter((m) => m.views).slice(0, 6).map((m, i) => ({
                    key: m.model,
                    label: `Model ${m.model}`,
                    value: m.avgTime,
                    max: maxModel,
                    color: [C.blue, C.green, C.amber, C.red, C.indigo, C.blue][i],
                    text: fmtDur(m.avgTime),
                  }))}
                />
              ) : <p className="axn-empty">No villa views in this period yet.</p>}
              <p className="axn-note">Active time is counted only while the villa is open and the page is visible.</p>
            </Card>
          </div>
        </div>
      ) : null}

      <p className="axn-foot">AXIS Studio · Analytics · anonymous visitor data</p>
    </section>
  );
}

function RankTable({ rows, head, onPick }: { rows: [string, string, string][]; head: [string, string]; onPick: (villa: string) => void }) {
  if (!rows.length) return <p className="axn-empty">Nothing in this period yet.</p>;
  return (
    <table className="axn-table">
      <thead><tr><th>Rank</th><th>Property</th><th>{head[0]}</th><th>{head[1]}</th></tr></thead>
      <tbody>
        {rows.map(([villa, a, b], i) => (
          <tr key={villa} className="clickable" onClick={() => onPick(villa)}>
            <td>{String(i + 1).padStart(2, "0")}</td>
            <td className="strong">Villa {villa}</td>
            <td>{a}</td>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
