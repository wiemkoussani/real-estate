"use client";

import { useEffect, useMemo, useState } from "react";
import ClientShell from "./ClientShell";
import type { ComplexRow, LeadRow, UnitRow, UnitStatus } from "@/lib/types";
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

export default function ClientHome() {
  const [complexes, setComplexes] = useState<ComplexRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [active, setActive] = useState<string>("");
  const [tab, setTab] = useState<"overview" | "units" | "leads" | "qr">("overview");
  const [chart, setChart] = useState<"villas" | "rooms" | "size" | "type">("villas");
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
    setComplexes(json.complexes ?? []);
    setUnits(json.units ?? []);
    setLeads(json.leads ?? []);
    setActive((prev) => prev || json.complexes?.[0]?.id || "");
    setReady(true);
  };

  useEffect(() => {
    void load();
  }, []);

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
    const villa = tally(cxLeads.map((l) => l.unit_display_id || "Unknown").filter(Boolean));
    const rooms = tally(linked.map((u) => `${u.rooms} rooms`));
    const types = tally(linked.map((u) => `Type ${u.type}`));
    const surfaces = tally(linked.map((u) => {
      if (u.surface < 180) return "Under 180 m²";
      if (u.surface < 280) return "180–280 m²";
      if (u.surface < 380) return "280–380 m²";
      return "Over 380 m²";
    }));
    const stockRooms = tally(cxUnits.map((u) => `${u.rooms} rooms`));
    return {
      villa: villa.slice(0, 8),
      rooms,
      types,
      surfaces,
      stockRooms,
      topVilla: villa[0],
      topRooms: rooms[0],
      topSurface: surfaces[0],
      interested: linked.length,
    };
  }, [cxUnits, cxLeads]);
  const greet = displayPersonName(name, email);
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
    <ClientShell tab={tab} onTab={setTab} leads={cxLeads.length} tourHref={cx ? `/c/${cx.slug}` : undefined}>
      {!ready ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <header className="page-head">
            <h1>Hello{greet ? `, ${greet}` : ""}</h1>
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

              {tab === "overview" && (
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
                          <button
                            key={key}
                            type="button"
                            className={chart === key ? "on" : ""}
                            onClick={() => setChart(key)}
                          >
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

              {tab === "units" && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>ID</th><th>Area</th><th>Type</th><th>Rooms</th><th>Status</th></tr></thead>
                    <tbody>
                      {cxUnits.map((u) => (
                        <tr key={u.id}>
                          <td>{u.display_id}</td>
                          <td>{u.surface} m²</td>
                          <td>T{u.type}</td>
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

              {tab === "leads" && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Last name</th><th>First name</th><th>Email</th><th>Phone</th><th>Villa</th></tr></thead>
                    <tbody>
                      {cxLeads.map((l) => (
                        <tr key={l.id}>
                          <td>{new Date(l.created_at).toLocaleString()}</td>
                          <td>{l.nom}</td>
                          <td>{l.prenom}</td>
                          <td>{l.email}</td>
                          <td>{l.tel}</td>
                          <td>{l.unit_display_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "qr" && (
                <div className="panel-card">
                  <p className="muted">Visitors scan this to open the tour.</p>
                  <img src={qrSrc} alt="QR" width={180} height={180} />
                  <p><a className="btn" href={qrSrc} download={`${cx.slug}-qr.png`}>Download</a></p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </ClientShell>
  );
}
