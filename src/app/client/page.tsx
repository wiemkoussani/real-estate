"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ClientShell, { type ClientView } from "./ClientShell";
import { IcBuilding, IcCalendar, IcClock, IcEye, IcHandshake, IcPin } from "./DashIcons";
import type { ComplexRow, LeadRow, ProjectStats, UnitRow, UnitStatus } from "@/lib/types";
import { displayPersonName } from "@/lib/person-name";

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) {
    return <div className="hist empty" />;
  }
  return (
    <div className="hist">
      {rows.map(([label, n]) => (
        <div key={label} className="hist-col">
          <em>{n}</em>
          <div className="hist-grow">
            <span className="hist-bar" style={{ height: `${Math.max(8, Math.round((n / max) * 100))}%` }} />
          </div>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

function ProjectCard({
  cx,
  stats,
  cover,
  units,
  onOpen,
}: {
  cx: ComplexRow;
  stats?: ProjectStats;
  cover?: string;
  units: UnitRow[];
  onOpen: () => void;
}) {
  const sold = units.filter((u) => u.status === "sold").length;
  const reserved = units.filter((u) => u.status === "reserved").length;
  const available = units.filter((u) => u.status === "available").length;
  const badge = stats?.badge ?? 0;
  return (
    <button type="button" className="axd-card" onClick={onOpen} aria-label={`Open ${cx.name}`}>
      {badge > 0 ? (
        <span className="axd-badge" title={`${stats?.newVisitors ?? 0} new visitors, ${stats?.newLeads ?? 0} new interested`}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <span className="axd-card-photo">
        {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}
      </span>
      <span className="axd-card-row">
        <span className="axd-cat"><IcBuilding size={28} stroke={2.1} /></span>
        <span className="axd-visitors">
          <IcEye size={17} />
          <span>{fmt(stats?.visitors ?? 0)} Visitors</span>
          {stats?.newVisitors ? <b>(+{fmt(stats.newVisitors)} new)</b> : null}
        </span>
      </span>
      <span className="axd-card-name">{cx.name}</span>
      {cx.description ? <span className="axd-card-desc">{cx.description}</span> : null}
      <span className="axd-card-meta">
        {cx.city ? (
          <span><IcPin size={20} stroke={2.4} />{cx.city}</span>
        ) : null}
        {cx.created_at ? (
          <span><IcCalendar size={20} stroke={2.4} />{fmtDate(cx.created_at)}</span>
        ) : null}
      </span>
      <span className="axd-pills">
        <span className="axd-pill sold">{fmt(sold)} Villas Sold</span>
        <span className="axd-pill reserved">{fmt(reserved)} Villas Reserved</span>
        <span className="axd-pill available">{fmt(available)} Villas Available</span>
      </span>
    </button>
  );
}

function NextProjectCard() {
  return (
    <div className="axd-next" aria-label="Looking forward to our next project">
      <span className="axd-next-glow a" />
      <span className="axd-next-glow b" />
      <svg className="axd-next-deco" viewBox="0 0 245 230" aria-hidden="true">
        <defs>
          <linearGradient id="axdArc" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0.17" stopColor="#EBF1FF" stopOpacity="0.8" />
            <stop offset="0.83" stopColor="#E2EBFF" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="axdRibbon" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0.1" stopColor="#E6EDFF" stopOpacity="0.15" />
            <stop offset="0.47" stopColor="#C9D9FF" />
            <stop offset="0.65" stopColor="#A3BFFF" />
            <stop offset="0.8" stopColor="#C3D6FF" />
          </linearGradient>
        </defs>
        <circle cx="215" cy="70" r="110" fill="url(#axdArc)" stroke="#E6EDFF" strokeWidth="0.8" />
        <circle cx="235" cy="120" r="75" fill="url(#axdArc)" stroke="#fff" strokeWidth="0.8" />
        <path d="M0 214C78 212 150 186 245 104V146C158 200 86 224 0 230Z" fill="url(#axdRibbon)" />
        <path d="M0 222C86 216 160 192 245 126" stroke="#fff" strokeWidth="0.8" fill="none" />
      </svg>

      <span className="axd-next-icon"><IcHandshake size={30} stroke={1.8} /></span>
      <h2 className="axd-next-title">
        Looking Forward
        <br />
        to Our <span className="blue">Next <span className="underlined">Project</span></span>
      </h2>
      <p className="axd-next-text">We&apos;re always here and excited to work with you again on your next project.</p>
      <span className="axd-next-callout">
        <IcClock size={16} stroke={1.8} />
        <i aria-hidden="true" />
        Let&apos;s create something great together.
      </span>
    </div>
  );
}

export default function ClientHome() {
  const [complexes, setComplexes] = useState<ComplexRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>("");
  const [view, setView] = useState<ClientView>("projects");
  const [sub, setSub] = useState<"overview" | "units" | "qr">("overview");
  const [chart, setChart] = useState<"villas" | "rooms" | "size" | "type">("villas");
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = async () => {
    const res = await fetch("/api/client/dashboard");
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Could not load");
      setReady(true);
      return;
    }
    setName(json.profile?.full_name || "");
    setEmail(json.profile?.email || "");
    setAvatar(json.profile?.avatar_url || null);
    setComplexes(json.complexes ?? []);
    setUnits(json.units ?? []);
    setLeads(json.leads ?? []);
    setStats(json.stats ?? {});
    setCovers(json.covers ?? {});
    setActive((prev) => prev || json.complexes?.[0]?.id || "");
    setReady(true);
  };

  useEffect(() => {
    void load();
  }, []);

  const notifications = useMemo(() => Object.values(stats).reduce((n, s) => n + s.badge, 0), [stats]);

  const openProject = (cx: ComplexRow) => {
    setActive(cx.id);
    setView("analytics");
    setSub("overview");
    // the owner has now seen everything new on this project
    setStats((prev) => {
      const s = prev[cx.id];
      return s ? { ...prev, [cx.id]: { ...s, badge: 0, newVisitors: 0, newLeads: 0, lastSeenAt: new Date().toISOString() } } : prev;
    });
    void fetch("/api/client/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: cx.id }),
    });
  };

  const cx = complexes.find((c) => c.id === active) || complexes[0] || null;
  const cxUnits = useMemo(() => units.filter((u) => u.complex_id === cx?.id), [units, cx]);
  const cxLeads = useMemo(() => leads.filter((l) => l.complex_id === cx?.id), [leads, cx]);
  const counts = useMemo(() => ({
    available: cxUnits.filter((u) => u.status === "available").length,
    reserved: cxUnits.filter((u) => u.status === "reserved").length,
    sold: cxUnits.filter((u) => u.status === "sold").length,
  }), [cxUnits]);
  const insights = useMemo(() => {
    const byId = new Map(cxUnits.map((u) => [u.display_id, u]));
    const linked = cxLeads.map((l) => byId.get(l.unit_display_id || "") || cxUnits.find((u) => u.id === l.unit_id)).filter(Boolean) as UnitRow[];
    const tally = (items: string[]) => {
      const map = new Map<string, number>();
      for (const item of items) map.set(item, (map.get(item) || 0) + 1);
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      villa: tally(cxLeads.map((l) => l.unit_display_id || "Unknown").filter(Boolean)).slice(0, 8),
      rooms: tally(linked.map((u) => `${u.rooms} rooms`)),
      types: tally(linked.map((u) => u.model || `T${u.type}`)),
      surfaces: tally(linked.map((u) => {
        if (u.surface < 180) return "Under 180 m²";
        if (u.surface < 280) return "180–280 m²";
        if (u.surface < 380) return "280–380 m²";
        return "Over 380 m²";
      })),
    };
  }, [cxUnits, cxLeads]);
  const qrSrc = cx ? `/api/qr?slug=${cx.slug}` : "";

  const setStatus = async (id: string, status: UnitStatus) => {
    const res = await fetch("/api/client/units", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const json = await res.json();
      setErr(json.error || "Could not update");
      return;
    }
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
  };

  return (
    <ClientShell
      view={view}
      onView={setView}
      notifications={notifications}
      name={displayPersonName(name, email) || name}
      avatarUrl={avatar}
      onAvatar={setAvatar}
    >
      {view === "projects" ? (
        <section className="axd-page">
          <header className="axd-head">
            <span className="axd-accent" aria-hidden="true" />
            <div>
              <h1>My Projects</h1>
              <p>Select a project to manage apartments and view analytics</p>
            </div>
          </header>
          {err ? <p className="axd-err">{err}</p> : null}
          {!ready ? (
            <p className="axd-muted">Loading…</p>
          ) : (
            <div className="axd-grid">
              {complexes.map((c) => (
                <ProjectCard
                  key={c.id}
                  cx={c}
                  stats={stats[c.id]}
                  cover={covers[c.id]}
                  units={units.filter((u) => u.complex_id === c.id)}
                  onOpen={() => openProject(c)}
                />
              ))}
              <NextProjectCard />
            </div>
          )}
        </section>
      ) : (
        /* Analytics + Contacts: previous screens, redesigned in the next steps */
        <main className="portal-main axd-legacy">
          <header className="page-head">
            <h1>{view === "analytics" ? "Analytics" : "Contacts"}</h1>
            {cx ? <p>{cx.name}</p> : <p>No project is linked to this account yet.</p>}
          </header>
          {err && <p className="err">{err}</p>}
          {cx && (
            <>
              {complexes.length > 1 && (
                <label className="project-pick">
                  Project
                  <select value={cx.id} onChange={(e) => setActive(e.target.value)}>
                    {complexes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}

              {view === "analytics" && (
                <div className="tabs-inline">
                  <a className={sub === "overview" ? "on" : ""} href="#ov" onClick={(e) => { e.preventDefault(); setSub("overview"); }}>Overview</a>
                  <a className={sub === "units" ? "on" : ""} href="#un" onClick={(e) => { e.preventDefault(); setSub("units"); }}>Units</a>
                  <a className={sub === "qr" ? "on" : ""} href="#qr" onClick={(e) => { e.preventDefault(); setSub("qr"); }}>Code</a>
                  <Link href={`/c/${cx.slug}`}>View tour</Link>
                </div>
              )}

              {view === "analytics" && sub === "overview" && (
                <>
                  <div className="admin-grid">
                    <div className="admin-card stat"><span>Available</span><strong>{counts.available}</strong></div>
                    <div className="admin-card stat"><span>Reserved</span><strong>{counts.reserved}</strong></div>
                    <div className="admin-card stat"><span>Sold</span><strong>{counts.sold}</strong></div>
                    <div className="admin-card stat"><span>Leads</span><strong>{cxLeads.length}</strong></div>
                  </div>
                  <article className="chart-card chart-hero">
                    <header>
                      <h3>Interest</h3>
                      <div className="chart-switch" role="tablist">
                        {([
                          ["villas", "All"],
                          ["rooms", "Rooms"],
                          ["size", "Size"],
                          ["type", "Type"],
                        ] as const).map(([key, label]) => (
                          <button key={key} type="button" className={chart === key ? "on" : ""} onClick={() => setChart(key)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </header>
                    <Bars
                      rows={
                        chart === "villas" ? insights.villa
                          : chart === "rooms" ? insights.rooms
                            : chart === "size" ? insights.surfaces
                              : insights.types
                      }
                    />
                  </article>
                </>
              )}

              {view === "analytics" && sub === "units" && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>ID</th><th>Area</th><th>Type</th><th>Rooms</th><th>Status</th></tr></thead>
                    <tbody>
                      {cxUnits.map((u) => (
                        <tr key={u.id}>
                          <td>{u.display_id}</td>
                          <td>{u.surface} m²</td>
                          <td>{u.model || `T${u.type}`}</td>
                          <td>{u.rooms}</td>
                          <td>
                            <select value={u.status} onChange={(e) => void setStatus(u.id, e.target.value as UnitStatus)}>
                              <option value="available">Available</option>
                              <option value="reserved">Reserved</option>
                              <option value="sold">Sold</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {view === "analytics" && sub === "qr" && (
                <div className="panel-card">
                  <p className="muted">Visitors scan this to open the tour.</p>
                  <img src={qrSrc} alt="QR" width={180} height={180} />
                  <p><a className="btn" href={qrSrc} download={`${cx.slug}-qr.png`}>Download</a></p>
                </div>
              )}

              {view === "contacts" && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Last name</th><th>First name</th><th>Email</th><th>Phone</th><th>Villa</th><th>Favourites</th></tr></thead>
                    <tbody>
                      {cxLeads.map((l) => (
                        <tr key={l.id}>
                          <td>{new Date(l.created_at).toLocaleString()}</td>
                          <td>{l.nom}</td>
                          <td>{l.prenom}</td>
                          <td>{l.email}</td>
                          <td>{l.tel}</td>
                          <td>{l.unit_display_id}</td>
                          <td>{l.favorite_units?.length ? l.favorite_units.join(", ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      )}
    </ClientShell>
  );
}
