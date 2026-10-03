"use client";

import { useEffect, useState } from "react";
import AdminShell from "../AdminShell";
import type { ComplexRow } from "@/lib/types";
import { IconSend, IconTrash } from "@/components/Icons";
import { displayPersonName } from "@/lib/person-name";
import { useConfirm } from "@/components/ConfirmDialog";

type ClientRow = { id: string; email: string | null; full_name: string | null; complex_ids?: string[] };

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [complexes, setComplexes] = useState<ComplexRow[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [complexId, setComplexId] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = async () => {
    const [c, x] = await Promise.all([fetch("/api/admin/clients"), fetch("/api/admin/complexes")]);
    const cj = await c.json();
    const xj = await x.json();
    if (!c.ok) setErr(cj.error || "Could not load clients");
    else setClients(cj.clients ?? []);
    if (x.ok) setComplexes(xj.complexes ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const projectsOf = (cl: ClientRow) =>
    complexes.filter((c) => (cl.complex_ids ?? []).includes(c.id) || c.owner_id === cl.id);

  const invite = async (e: React.FormEvent, resendEmail?: string) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOk("");
    const payload = resendEmail
      ? { email: resendEmail, resend: true }
      : { email, full_name: fullName, complex_id: complexId || null };
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json.error || "Could not send invite");
      return;
    }
    setOk(`Invitation sent to ${resendEmail || email}.`);
    if (!resendEmail) {
      setEmail("");
      setFullName("");
    }
    void load();
  };

  const removeClient = async (cl: ClientRow) => {
    if (!(await confirm(`Delete ${displayPersonName(cl.full_name, cl.email) || cl.email}? They will lose access to every project.`, "Delete client"))) return;
    setBusy(true);
    setErr("");
    setOk("");
    const res = await fetch("/api/admin/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cl.id }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json.error || "Could not delete");
      return;
    }
    setOk("Client deleted.");
    void load();
  };

  return (
    <AdminShell>
      <header className="page-head">
        <h1>Clients</h1>
        <p>One person can sit on several projects. One project can have several people.</p>
      </header>
      {err && <p className="err">{err}</p>}
      {ok && <p className="ok">{ok}</p>}
      <div className="two-col">
        <div className="client-grid">
          {clients.map((cl) => {
            const projects = projectsOf(cl);
            return (
              <article key={cl.id} className="person-card">
                <header className="person-head">
                  <strong>{displayPersonName(cl.full_name, cl.email) || "—"}</strong>
                  <span className="icon-actions">
                    {cl.email && (
                      <button className="icon-btn" type="button" disabled={busy} aria-label="Resend invitation" title="Resend" onClick={(e) => void invite(e, cl.email!)}>
                        <IconSend size={16} />
                      </button>
                    )}
                    <button className="icon-btn danger" type="button" disabled={busy} aria-label="Delete client" title="Delete" onClick={() => void removeClient(cl)}>
                      <IconTrash size={16} />
                    </button>
                  </span>
                </header>
                <span>{cl.email}</span>
                <div className="assign-list">
                  {projects.map((p) => (
                    <span key={p.id} className="assign-chip">{p.name}</span>
                  ))}
                  {!projects.length && <span className="muted">No project</span>}
                </div>
              </article>
            );
          })}
          {!clients.length && <p className="muted">No clients yet.</p>}
        </div>
        <form className="panel-card stack invite-card" onSubmit={(e) => void invite(e)}>
          <h2>New invitation</h2>
          <label>Person's name <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First name" /></label>
          <label>Email <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" /></label>
          <label>
            First project
            <select value={complexId} onChange={(e) => setComplexId(e.target.value)}>
              <option value="">Choose later</option>
              {complexes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send invitation"}</button>
        </form>
      </div>
      {dialog}
    </AdminShell>
  );
}
