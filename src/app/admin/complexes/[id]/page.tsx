"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AdminShell from "../../AdminShell";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { AssetKind, AssetRow, ComplexRow, LeadRow, UnitRow, UnitStatus } from "@/lib/types";
import { displayPersonName } from "@/lib/person-name";
import { filesForKind, relativeUploadPath } from "@/lib/upload-files";
import { assetFileLabel, assetRelSegments } from "@/lib/asset-path";
import { IconEye, IconFolder, IconTrash } from "@/components/Icons";

const UPLOAD_STEPS: {
  id: AssetKind;
  title: string;
  why: string;
  where: string;
  pick: "folder" | "files";
  action: string;
}[] = [
  { id: "branding", title: "Logo", why: "Shown when the tour starts.", where: "branding → logo.png", pick: "files", action: "Add logo" },
  { id: "glb", title: "3D model", why: "Lets visitors tap a villa.", where: "models → building.glb", pick: "files", action: "Add model" },
  { id: "frame_low", title: "Orbit photos", why: "The aerial while turning.", where: "panorama → frames_low", pick: "folder", action: "Add folder" },
  { id: "gallery", title: "Gallery", why: "The 10 exterior photos.", where: "gallery", pick: "folder", action: "Add folder" },
  { id: "plan", title: "Plans", why: "Types and floors", where: "plans → types , plans → floors", pick: "folder", action: "Add folder" },
  { id: "villa_360", title: "Inside 360", why: "Each type: RDC, floors, whole villa.", where: "villa-types", pick: "folder", action: "Add folder" },
  { id: "frame_high", title: "Sharp aerials", why: "Last step — large files.", where: "panorama → frames", pick: "folder", action: "Add folder" },
  { id: "document", title: "Private", why: "Contracts. Not on the tour.", where: "Any PDF", pick: "files", action: "Add files" },
];

async function pool<T>(items: T[], width: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i];
      i += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export default function ComplexAdminPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cx, setCx] = useState<ComplexRow | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [clients, setClients] = useState<{ id: string; email: string | null; full_name: string | null }[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [pickClient, setPickClient] = useState("");
  const [busyKind, setBusyKind] = useState<AssetKind | null>(null);
  const [busyProgress, setBusyProgress] = useState("");
  const [filesKind, setFilesKind] = useState<AssetKind | null>(null);
  const [filesDir, setFilesDir] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"units" | "media" | "leads" | "qr">("units");
  const qrSrc = useMemo(() => (cx ? `/api/qr?slug=${cx.slug}` : ""), [cx]);
  const filesBrowse = useMemo(() => {
    if (!filesKind) {
      return { nested: false, folders: [] as { name: string; count: number }[], files: [] as { name: string; row: AssetRow }[] };
    }
    const rows = assets.filter((a) => a.kind === filesKind || (filesKind === "document" && a.kind === "other"));
    const split = rows.map((row) => ({ row, parts: assetRelSegments(row.path, filesKind) }));
    const nested = split.some((s) => s.parts.length >= 3);
    if (!nested) {
      const files = split
        .map((s) => ({ name: s.parts[s.parts.length - 1] || assetFileLabel(s.row.path), row: s.row }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      return { nested: false, folders: [], files };
    }
    const prefix = filesDir;
    const folderMap = new Map<string, number>();
    const files: { name: string; row: AssetRow }[] = [];
    for (const { row, parts } of split) {
      if (prefix.some((p, i) => parts[i] !== p)) continue;
      if (parts.length === prefix.length + 1) {
        files.push({ name: parts[parts.length - 1], row });
      } else if (parts.length > prefix.length + 1) {
        const name = parts[prefix.length];
        folderMap.set(name, (folderMap.get(name) ?? 0) + 1);
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const folders = [...folderMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { nested: true, folders, files };
  }, [assets, filesKind, filesDir]);

  const load = async () => {
    const sb = createBrowserSupabase();
    if (!sb) {
      setErr("Supabase is not configured");
      return;
    }
    const [{ data: complex }, { data: unitRows }, { data: leadRows }, { data: assetRows }, clRes, memRes] = await Promise.all([
      sb.from("complexes").select("*").eq("id", id).single(),
      sb.from("units").select("*").eq("complex_id", id).order("display_id"),
      sb.from("leads").select("*").eq("complex_id", id).order("created_at", { ascending: false }).limit(200),
      sb.from("assets").select("*").eq("complex_id", id).order("sort_index"),
      fetch("/api/admin/clients"),
      fetch(`/api/admin/complexes/${id}/members`),
    ]);
    setCx(complex as ComplexRow | null);
    setUnits((unitRows as UnitRow[]) ?? []);
    setLeads((leadRows as LeadRow[]) ?? []);
    setAssets((assetRows as AssetRow[]) ?? []);
    const clJson = await clRes.json();
    if (clRes.ok) setClients(clJson.clients ?? []);
    const memJson = await memRes.json();
    if (memRes.ok) setMemberIds(memJson.memberIds ?? []);
    else if ((complex as ComplexRow | null)?.owner_id) setMemberIds([(complex as ComplexRow).owner_id!]);
  };

  useEffect(() => {
    void load();
  }, [id]);

  const saveComplex = async (patch: Partial<ComplexRow>) => {
    const sb = createBrowserSupabase();
    if (!sb || !cx) return;
    const { data, error } = await sb.from("complexes").update(patch).eq("id", cx.id).select("*").single();
    if (error) setErr(error.message);
    else setCx(data as ComplexRow);
  };

  const removeProject = async () => {
    if (!cx) return;
    if (!window.confirm(`Delete ${cx.name}? Villas, photos, and this tour go with it. Clients stay.`)) return;
    const res = await fetch("/api/admin/complexes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cx.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else router.push("/admin");
  };

  const addAssigned = async () => {
    if (!pickClient || !id) return;
    const res = await fetch(`/api/admin/complexes/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: pickClient }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Could not add client");
      return;
    }
    setMemberIds(json.memberIds ?? []);
    setPickClient("");
  };

  const removeAssigned = async (profileId: string) => {
    const res = await fetch(`/api/admin/complexes/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Could not remove client");
      return;
    }
    setMemberIds(json.memberIds ?? []);
  };

  const saveStatus = async (unitId: string, status: UnitStatus) => {
    const sb = createBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.from("units").update({ status }).eq("id", unitId);
    if (error) setErr(error.message);
    else setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, status } : u)));
  };

  const importUnits = async (file: File | null) => {
    if (!file || !id) return;
    setMsg("");
    setErr("");
    let parsed: { units?: unknown };
    try {
      parsed = JSON.parse(await file.text()) as { units?: unknown };
    } catch {
      setErr("That file is not valid JSON");
      return;
    }
    const unitsList = Array.isArray(parsed.units) ? parsed.units : Array.isArray(parsed) ? parsed : [];
    if (!unitsList.length) {
      setErr("No units array in that file");
      return;
    }
    const res = await fetch("/api/admin/import-units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: id, units: unitsList }),
    });
    const json = await res.json();
    if (!res.ok) setErr(json.error || "Import failed");
    else {
      setMsg(`Imported ${json.count} units`);
      void load();
    }
  };

  const removeUnit = async (unitId: string) => {
    const sb = createBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.from("units").delete().eq("id", unitId);
    if (error) setErr(error.message);
    else setUnits((prev) => prev.filter((u) => u.id !== unitId));
  };

  const clearUnits = async () => {
    const sb = createBrowserSupabase();
    if (!sb || !cx || !units.length) return;
    if (!window.confirm(`Delete all ${units.length} units? You can import another units.json after.`)) return;
    const { error } = await sb.from("units").delete().eq("complex_id", cx.id);
    if (error) setErr(error.message);
    else {
      setUnits([]);
      setMsg("All units removed");
    }
  };

  const openPrivate = async (objectPath: string) => {
    const sb = createBrowserSupabase();
    if (!sb) return;
    const { data, error } = await sb.storage.from("private").createSignedUrl(objectPath, 300);
    if (error || !data?.signedUrl) setErr(error?.message || "Could not sign URL");
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const removeAsset = async (row: AssetRow) => {
    const res = await fetch("/api/admin/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else setAssets((prev) => prev.filter((a) => a.id !== row.id));
  };

  const clearKind = async (target: AssetKind) => {
    if (!cx) return;
    const rows = assets.filter((a) => a.kind === target || (target === "document" && a.kind === "other"));
    if (!rows.length) return;
    if (!window.confirm(`Remove all ${rows.length} file(s) from this card?`)) return;
    const res = await fetch("/api/admin/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: cx.id, kind: target }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setErr(json.error || "Could not delete");
    else {
      setMsg(`Removed ${json.count ?? rows.length} file(s)`);
      if (filesKind === target) setFilesKind(null);
      void load();
    }
  };

  const upload = async (files: File[], nextKind: AssetKind) => {
    if (!cx) return;
    const list = filesForKind(files, nextKind);
    if (!list.length) {
      setErr("No usable files in that selection");
      return;
    }
    const sb = createBrowserSupabase();
    if (!sb) {
      setErr("Storage is not configured");
      return;
    }
    setErr("");
    setMsg("");
    setBusyKind(nextKind);
    setBusyProgress(`0 / ${list.length}`);
    let ok = 0;
    let lastErr = "";
    await pool(list, nextKind === "frame_high" ? 2 : 3, async (file) => {
      const prepRes = await fetch("/api/admin/assets/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complexId: cx.id,
          kind: nextKind,
          relativePath: relativeUploadPath(file),
          contentType: file.type,
        }),
      });
      const prep = await prepRes.json().catch(() => ({}));
      if (!prepRes.ok) {
        lastErr = typeof prep.error === "string" ? prep.error : "Could not start upload";
        return;
      }
      const { error: upErr } = await sb.storage.from(prep.bucket).uploadToSignedUrl(prep.objectPath, prep.token, file, {
        contentType: prep.contentType,
      });
      if (upErr) {
        lastErr = upErr.message;
        return;
      }
      const commitRes = await fetch("/api/admin/assets/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complexId: cx.id,
          kind: nextKind,
          stored: prep.stored,
          sort_index: prep.sort_index,
        }),
      });
      const commit = await commitRes.json().catch(() => ({}));
      if (!commitRes.ok) {
        lastErr = typeof commit.error === "string" ? commit.error : "Could not save file";
        return;
      }
      ok += 1;
      setBusyProgress(`${ok} / ${list.length}`);
    });
    setBusyKind(null);
    setBusyProgress("");
    if (lastErr) setErr(lastErr);
    if (ok) setMsg(`${ok} file(s) saved`);
    void load();
  };

  if (!cx) {
    return (
      <AdminShell>
        <p className="muted">{err || "Loading…"}</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <p className="crumb"><Link href="/admin">Projects</Link> / {cx.name}</p>
      <header className="page-head project-head">
        <h1>{cx.name}</h1>
        <button className="icon-btn danger" type="button" title="Delete project" aria-label="Delete project" onClick={() => void removeProject()}>
          <IconTrash size={18} />
        </button>
      </header>
      <div className="tabs-inline">
        <a className={tab === "units" ? "on" : ""} href="#units" onClick={(e) => { e.preventDefault(); setTab("units"); }}>Units</a>
        <a className={tab === "media" ? "on" : ""} href="#media" onClick={(e) => { e.preventDefault(); setTab("media"); }}>Upload</a>
        <a className={tab === "leads" ? "on" : ""} href="#leads" onClick={(e) => { e.preventDefault(); setTab("leads"); }}>Leads ({leads.length})</a>
        <a className={tab === "qr" ? "on" : ""} href="#qr" onClick={(e) => { e.preventDefault(); setTab("qr"); }}>Code</a>
        <Link href={`/c/${cx.slug}`}>View tour</Link>
      </div>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <form className="settings-row" onSubmit={(e) => e.preventDefault()}>
        <label>Name <input value={cx.name} onChange={(e) => setCx({ ...cx, name: e.target.value })} onBlur={() => void saveComplex({ name: cx.name })} /></label>
        <label>
          Visibility
          <select value={cx.published ? "1" : "0"} onChange={(e) => void saveComplex({ published: e.target.value === "1" })}>
            <option value="0">Hidden</option>
            <option value="1">Live</option>
          </select>
        </label>
      </form>
      <div className="assign-box">
        <h3>Clients on this project</h3>
        <p>You can add more than one. Each person signs in and sees this development.</p>
        <div className="assign-list">
          {clients.filter((cl) => memberIds.includes(cl.id)).map((cl) => (
            <span key={cl.id} className="assign-chip">
              {displayPersonName(cl.full_name, cl.email)}
              <button type="button" onClick={() => void removeAssigned(cl.id)} aria-label="Remove">×</button>
            </span>
          ))}
          {!memberIds.length && <span className="muted">None yet</span>}
        </div>
        {clients.some((cl) => !memberIds.includes(cl.id)) && (
          <div className="assign-add">
            <select value={pickClient} onChange={(e) => setPickClient(e.target.value)}>
              <option value="">Add a client…</option>
              {clients.filter((cl) => !memberIds.includes(cl.id)).map((cl) => (
                <option key={cl.id} value={cl.id}>{displayPersonName(cl.full_name, cl.email)} ({cl.email})</option>
              ))}
            </select>
            <button className="btn" type="button" disabled={!pickClient} onClick={() => void addAssigned()}>Add</button>
          </div>
        )}
      </div>

      {tab === "units" && (
        <section className="units-panel">
          <header className="units-toolbar">
            <div>
              <h2>Units</h2>
              <p>Choose the villas file for this project.</p>
            </div>
            <div className="units-actions">
              {units.length > 0 && <span className="units-count">{units.length}</span>}
              <label className="file-pick">
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void importUnits(file);
                  }}
                />
                <span>Import villas</span>
              </label>
              {units.length > 0 && (
                <button className="icon-btn danger" type="button" title="Remove all villas" aria-label="Remove all villas" onClick={() => void clearUnits()}>
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          </header>
          <div className="table-wrap units-table">
          <table>
            <thead>
              <tr><th>ID</th><th>Area</th><th>Type</th><th>Floor</th><th>Rooms</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="unit-id">{u.display_id}</td>
                  <td>{u.surface} m²</td>
                  <td><span className="type-pill">T{u.type}</span></td>
                  <td>{u.floor}</td>
                  <td>{u.rooms}</td>
                  <td>
                    <select
                      className={`status-select status-${u.status}`}
                      value={u.status}
                      onChange={(e) => void saveStatus(u.id, e.target.value as UnitStatus)}
                    >
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="sold">Sold</option>
                    </select>
                  </td>
                  <td>
                    <button className="icon-btn danger" type="button" title="Remove villa" aria-label="Remove villa" onClick={() => void removeUnit(u.id)}>
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {!units.length && <p className="units-empty">No villas yet. Import a file to add them.</p>}
        </section>
      )}

      {tab === "media" && (
        <>
          <h2>Photos & files</h2>
          <p className="muted">Use each card in order. Only open the folder named on that card.</p>
          <div className="upload-grid">
            {UPLOAD_STEPS.map((step) => {
              const rows = assets.filter((a) => a.kind === step.id || (step.id === "document" && a.kind === "other"));
              const n = rows.length;
              const preview = step.id === "branding" ? rows.find((a) => a.path.startsWith("http")) : undefined;
              const folderPick = step.pick === "folder";
              return (
                <article key={step.id} className="upload-card">
                  <header>
                    <div className="upload-title">
                      {preview ? <img className="logo-preview" src={preview.path} alt="" /> : null}
                      <div>
                        <h3>{step.title}</h3>
                        <em className={n ? "has" : ""}>{n ? n : "Empty"}</em>
                      </div>
                    </div>
                    <div className="upload-icons">
                      <button className="icon-btn" type="button" disabled={!n} title="View files" aria-label="View files" onClick={() => { setFilesKind(step.id); setFilesDir([]); }}>
                        <IconEye size={16} />
                      </button>
                      <button className="icon-btn danger" type="button" disabled={!n} title="Remove all" aria-label="Remove all" onClick={() => void clearKind(step.id)}>
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </header>
                  <p>{step.why}</p>
                  <p className="where">{step.where}</p>
                  <label className="upload-pick">
                    <input
                      type="file"
                      multiple={folderPick}
                      accept={step.id === "branding" ? "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" : step.id === "glb" ? ".glb,model/gltf-binary" : step.id === "document" ? ".pdf,application/pdf" : undefined}
                      disabled={busyKind !== null}
                      ref={(el) => {
                        if (!el) return;
                        if (folderPick) el.setAttribute("webkitdirectory", "");
                        else el.removeAttribute("webkitdirectory");
                      }}
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        void upload(list, step.id);
                      }}
                    />
                    <span>{busyKind === step.id ? (busyProgress ? `Adding ${busyProgress}` : "Adding…") : step.action}</span>
                  </label>
                </article>
              );
            })}
          </div>
          {filesKind && (
            <div className="files-sheet" onClick={() => { setFilesKind(null); setFilesDir([]); }}>
              <div className="files-panel" onClick={(e) => e.stopPropagation()}>
                <header>
                  <div>
                    <h3>{UPLOAD_STEPS.find((s) => s.id === filesKind)?.title}</h3>
                    {filesBrowse.nested ? (
                      <nav className="files-crumb">
                        <button type="button" className={!filesDir.length ? "on" : ""} onClick={() => setFilesDir([])}>Root</button>
                        {filesDir.map((name, i) => (
                          <span key={`${name}-${i}`}>
                            <em>/</em>
                            <button type="button" className={i === filesDir.length - 1 ? "on" : ""} onClick={() => setFilesDir(filesDir.slice(0, i + 1))}>{name}</button>
                          </span>
                        ))}
                      </nav>
                    ) : (
                      <p>{filesBrowse.files.length} files</p>
                    )}
                  </div>
                  <button className="icon-btn" type="button" aria-label="Close" onClick={() => { setFilesKind(null); setFilesDir([]); }}>×</button>
                </header>
                {filesBrowse.nested && (
                  <ul className="files-folders">
                    {filesBrowse.folders.map((folder) => (
                      <li key={folder.name}>
                        <button type="button" className="folder-row" onClick={() => setFilesDir([...filesDir, folder.name])}>
                          <IconFolder size={18} />
                          <strong>{folder.name}</strong>
                          <small>{folder.count}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <ul>
                  {filesBrowse.files.map(({ name, row: a }) => (
                    <li key={a.id}>
                      <span title={a.path}>{name}</span>
                      <div className="icon-actions">
                        <button className="icon-btn" type="button" title="Open" aria-label="Open" onClick={() => a.path.startsWith("http") ? window.open(a.path, "_blank", "noopener,noreferrer") : void openPrivate(a.path)}>
                          <IconEye size={16} />
                        </button>
                        <button className="icon-btn danger" type="button" title="Delete" aria-label="Delete" onClick={() => void removeAsset(a)}>
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "leads" && (
        <>
          <h2>Leads</h2>
          <table>
            <thead><tr><th>Date</th><th>Last name</th><th>First name</th><th>Email</th><th>Phone</th><th>Villa</th></tr></thead>
            <tbody>
              {leads.map((l) => (
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
          {!leads.length && <p className="muted">No leads yet.</p>}
        </>
      )}

      {tab === "qr" && (
        <>
          <h2>Visitor code</h2>
          <p className="muted">Print this. Visitors scan it to open the tour.</p>
          <img src={qrSrc} alt="QR" width={280} height={280} />
          <p><a className="btn" href={qrSrc} download={`${cx.slug}-qr.png`}>Download</a></p>
        </>
      )}
    </AdminShell>
  );
}
