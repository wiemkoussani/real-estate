"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell from "./AdminShell";
import type { ComplexRow } from "@/lib/types";
import { IconTrash } from "@/components/Icons";

type ClientRow = { id: string; complex_ids?: string[] };

export default function AdminHome() {
  const [rows, setRows] = useState<ComplexRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = async () => {
    const [p, c] = await Promise.all([fetch("/api/admin/complexes"), fetch("/api/admin/clients")]);
    const pj = await p.json();
    const cj = await c.json();
    if (p.ok) setRows(pj.complexes ?? []);
    else setErr(pj.error || "Could not load");
    if (c.ok) setClients(cj.clients ?? []);
    setReady(true);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/complexes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json.error || "Could not create");
      return;
    }
    setName("");
    void load();
  };

  const removeProject = async (c: ComplexRow) => {
    if (!window.confirm(`Delete ${c.name}? Villas, photos, and this tour go with it. Clients stay.`)) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/complexes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setErr(json.error || "Could not delete");
    else void load();
  };

  return (
    <AdminShell>
      <header className="page-head">
        <h1>Projects</h1>
        <p>Open a development to add photos, villas, and the visitor code.</p>
      </header>
      {err && <p className="err">{err}</p>}
      {!ready && <p className="muted">Loading projects…</p>}
      {ready && (
        <>
      <div className="admin-grid">
        {rows.map((c) => {
          const n = clients.filter((cl) => (cl.complex_ids ?? []).includes(c.id) || c.owner_id === cl.id).length;
          return (
            <article key={c.id} className="admin-card project-card">
              <header>
                <strong>{c.name}</strong>
                <span className="icon-actions">
                  <em>{c.published ? "Live" : "Hidden"}</em>
                  <button className="icon-btn danger" type="button" disabled={busy} title="Delete project" aria-label="Delete project" onClick={() => void removeProject(c)}>
                    <IconTrash size={16} />
                  </button>
                </span>
              </header>
              <p>{n === 0 ? "No clients yet" : n === 1 ? "1 client" : `${n} clients`}</p>
              <span className="card-actions">
                <Link className="btn ghost" href={`/admin/complexes/${c.id}`}>Open</Link>
                <Link className="btn ghost" href={`/c/${c.slug}`}>Tour</Link>
              </span>
            </article>
          );
        })}
      </div>
      <h2>New project</h2>
      <form className="panel-card stack invite-card" onSubmit={create}>
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <button className="btn" type="submit" disabled={busy}>Create</button>
      </form>
        </>
      )}
    </AdminShell>
  );
}
