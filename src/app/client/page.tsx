"use client";

import { useEffect, useMemo, useState } from "react";
import ClientShell, { type ClientView } from "./ClientShell";
import ContactsView, { buildContacts } from "./ContactsView";
import type { SearchHit } from "./GlobalSearch";
import { priceOf } from "./ApartmentsView";
import ApartmentsView from "./ApartmentsView";
import QrView from "./QrView";
import AnalyticsView from "./AnalyticsView";
import { IcBuilding, IcCalendar, IcChart, IcClock, IcDoor, IcEye, IcHandshake, IcPin, IcQr, IcUsers } from "./DashIcons";
import type { ComplexRow, LeadRow, ProjectStats, UnitRow } from "@/lib/types";
import { displayPersonName } from "@/lib/person-name";

const fmt = (n: number) => n.toLocaleString("en-US");

type ProjectTab = "apartments" | "qr" | "analytics" | "contacts";

/** Pill tabs at the top right of a project page. */
function ProjectTabs({ tab, onTab }: { tab: ProjectTab; onTab: (t: ProjectTab) => void }) {
  const items: [ProjectTab, string, React.ReactNode][] = [
    ["apartments", "Apartments", <IcDoor key="d" size={16} stroke={1.6} />],
    ["qr", "QR", <IcQr key="q" size={17} stroke={1.7} />],
    ["analytics", "Analytics", <IcChart key="c" size={17} stroke={1.8} />],
    ["contacts", "Contacts", <IcUsers key="u" size={17} stroke={2} />],
  ];
  return (
    <nav className="axp-tabs" aria-label="Project sections">
      {items.map(([key, label, icon]) => (
        <button key={key} type="button" className={tab === key ? "on" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => onTab(key)}>
          {icon}
          {label}
        </button>
      ))}
    </nav>
  );
}
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
  const [projectTab, setProjectTab] = useState<ProjectTab>("apartments");
  /** row to show after a "Search anything" pick (n changes on every pick) */
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
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
    setView("project");
    setProjectTab("apartments");
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
  // manual navigation forgets the row picked in "Search anything"
  const pickView = (v: ClientView) => {
    setFocus(null);
    setView(v);
  };
  const pickTab = (t: ProjectTab) => {
    setFocus(null);
    setProjectTab(t);
  };

  const searchItems = useMemo<SearchHit[]>(() => {
    const items: SearchHit[] = [];
    const goProject = (c: ComplexRow, tab: ProjectTab) => () => {
      setActive(c.id);
      setView("project");
      setProjectTab(tab);
    };
    items.push(
      { key: "p:projects", group: "Pages", title: "My Projects", terms: ["home", "projects", "dashboard"], go: () => setView("projects") },
      { key: "p:contacts", group: "Pages", title: "All Contacts", terms: ["leads", "clients", "contacts", "interested"], go: () => setView("contacts") },
      { key: "p:analytics", group: "Pages", title: "Analytics", terms: ["stats", "statistics", "charts"], go: () => setView("analytics") },
    );
    const label: Record<ProjectTab, [string, string[]]> = {
      apartments: ["Apartments", ["villas", "units", "prices", "status"]],
      qr: ["QR Code", ["qr", "code", "scan", "print"]],
      analytics: ["Analytics", ["stats", "interest"]],
      contacts: ["Contacts", ["leads", "clients"]],
    };
    for (const c of complexes) {
      items.push({
        key: `c:${c.id}`,
        group: "Projects",
        title: c.name,
        sub: [c.description, c.city].filter(Boolean).join(" · ") || undefined,
        terms: [c.slug],
        go: () => openProject(c),
      });
      for (const tab of Object.keys(label) as ProjectTab[]) {
        items.push({
          key: `t:${c.id}:${tab}`,
          group: "Pages",
          title: `${c.name} · ${label[tab][0]}`,
          terms: label[tab][1],
          go: goProject(c, tab),
        });
      }
    }
    const names = new Map(complexes.map((c) => [c.id, c]));
    for (const u of units) {
      const c = names.get(u.complex_id);
      if (!c) continue;
      const model = u.model || `${u.type}A`;
      const status = u.status === "available" ? "Available" : u.status === "reserved" ? "Reserved" : "Sold";
      items.push({
        key: `u:${u.id}`,
        group: "Villas",
        title: `Villa ${u.display_id}`,
        sub: `${c.name} · Model ${model} · ${status} · SAR ${priceOf(u).toLocaleString("en-US")}`,
        terms: [String(priceOf(u)), `${u.rooms} bed`, `${u.surface} m2`],
        go: () => {
          goProject(c, "apartments")();
          setFocus({ id: u.id, n: Date.now() });
        },
      });
    }
    for (const ct of buildContacts(leads, complexes)) {
      items.push({
        key: `l:${ct.key}`,
        group: "Contacts",
        title: ct.name || ct.email || "Contact",
        sub: [ct.email, ct.project].filter(Boolean).join(" · "),
        terms: [ct.phone, ct.note, ...ct.villas.map((v) => `villa ${v}`)],
        go: () => {
          setView("contacts");
          setFocus({ id: ct.key, n: Date.now() });
        },
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexes, units, leads]);

  return (
    <ClientShell
      searchItems={searchItems}
      view={view}
      onView={pickView}
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
      ) : view === "contacts" ? (
        <ContactsView leads={leads} units={units} complexes={complexes} onLeads={setLeads} focus={focus} />
      ) : view === "project" && cx && projectTab === "contacts" ? (
        <ContactsView
          leads={leads}
          units={units}
          complexes={complexes}
          onLeads={setLeads}
          scope={cx}
          tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />}
        />
      ) : view === "project" && cx && projectTab === "apartments" ? (
        <ApartmentsView cx={cx} units={units} onUnits={setUnits} focus={focus} tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />} />
      ) : view === "project" && cx && projectTab === "qr" ? (
        <QrView cx={cx} complexes={complexes} onPick={setActive} tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />} />
      ) : view === "project" && cx ? (
        <AnalyticsView cx={cx} complexes={complexes} onPick={setActive} tabs={<ProjectTabs tab={projectTab} onTab={pickTab} />} />
      ) : cx ? (
        <AnalyticsView cx={cx} complexes={complexes} onPick={setActive} />
      ) : (
        <section className="axd-page">
          <p className="axd-muted">{ready ? "No project is linked to this account yet." : "Loading…"}</p>
        </section>
      )}
    </ClientShell>
  );
}
