"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { COMPLEX } from "@/lib/complex";
import type { ComplexRow, UnitRow, UnitStatus } from "@/lib/types";
import { exportExcel, exportPdf } from "./contacts-export";
import { toUi } from "./ui-scale";
import {
  IcArrowLeft,
  IcArrowRight,
  IcBuilding,
  IcChevronDown,
  IcExport,
  IcFilter,
  IcImport,
  IcPencil,
  IcRotate,
  IcSearch,
  IcTrash,
  IcX,
} from "./DashIcons";

const PAGE = 10;
const STATUS: Record<UnitStatus, string> = { available: "Available", reserved: "Reserved", sold: "Sold" };
const STATUSES = Object.keys(STATUS) as UnitStatus[];

/** Same fallback as the public maquette when no price was entered. */
export function priceOf(u: UnitRow) {
  const model = (u.model || `${u.type}A`).toUpperCase();
  return u.price || COMPLEX.defaultPriceByModel[model] || COMPLEX.defaultPriceByType[u.type] || 0;
}
const fmtPrice = (n: number) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
const modelOf = (u: UnitRow) => u.model || `${u.type}A`;
const details = (u: UnitRow) =>
  [`${u.rooms} bed`, `${u.surface} m²`, `${u.floor} floor${u.floor === 1 ? "" : "s"}`].join(" | ");

/** Minimal CSV reader (quotes, commas or semicolons). */
function parseCsv(text: string): string[][] {
  const sep = (text.split(/\r?\n/)[0].match(/;/g)?.length ?? 0) > (text.split(/\r?\n/)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function statusFromText(s: string): UnitStatus | undefined {
  const t = s.trim().toLowerCase();
  if (/^(available|متاح|متاحة)$/.test(t)) return "available";
  if (/^(reserved|محجوز|محجوزة)$/.test(t)) return "reserved";
  if (/^(sold|مباع|مباعة)$/.test(t)) return "sold";
  return undefined;
}

type Edit = { id: string; x: number; y: number; status: UnitStatus; price: string };

export default function ApartmentsView({
  cx,
  units,
  onUnits,
  tabs,
  focus,
}: {
  cx: ComplexRow;
  units: UnitRow[];
  onUnits: (next: (prev: UnitRow[]) => UnitRow[]) => void;
  tabs: ReactNode;
  /** from "Search anything": show this villa (clears filters, opens its page, flashes the row) */
  focus?: { id: string; n: number } | null;
}) {
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | UnitStatus>("");
  const [model, setModel] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const popRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => units.filter((u) => u.complex_id === cx.id), [units, cx.id]);
  const models = useMemo(() => [...new Set(list.map(modelOf))].sort(), [list]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/[^\d]/g, "");
    return list
      .filter((u) => {
        if (status && u.status !== status) return false;
        if (model && modelOf(u) !== model) return false;
        if (!needle) return true;
        return (
          `villa ${u.display_id}`.toLowerCase().includes(needle) ||
          modelOf(u).toLowerCase().includes(needle) ||
          STATUS[u.status].toLowerCase().includes(needle) ||
          (digits.length > 2 && String(priceOf(u)).includes(digits))
        );
      })
      .sort((a, b) => a.display_id.localeCompare(b.display_id, undefined, { numeric: true }));
  }, [list, q, status, model]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);
  const keepPage = useRef(false);
  useEffect(() => {
    if (keepPage.current) {
      keepPage.current = false;
      return;
    }
    setPage(1);
  }, [q, status, model]);

  // jump to a villa picked in "Search anything"
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!focus) return;
    const sorted = [...list].sort((a, b) => a.display_id.localeCompare(b.display_id, undefined, { numeric: true }));
    const i = sorted.findIndex((u) => u.id === focus.id);
    if (i < 0) return;
    keepPage.current = Boolean(q || status || model);
    setQ("");
    setStatus("");
    setModel("");
    setPage(Math.floor(i / PAGE) + 1);
    setFlash(focus.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);
  useEffect(() => {
    if (!flash) return;
    document.querySelector(`[data-row="${CSS.escape(flash)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(t);
  }, [flash, page]);

  // popups close on click elsewhere / Escape / scroll
  useEffect(() => {
    if (!edit && !exportOpen) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (edit && !popRef.current?.contains(t)) setEdit(null);
      if (exportOpen && !exportRef.current?.contains(t)) setExportOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setEdit(null);
      setExportOpen(false);
    };
    const scroll = () => setEdit(null);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [edit, exportOpen]);

  const openEdit = (e: React.MouseEvent, u: UnitRow) => {
    // screen pixels → dashboard pixels (the page is zoomed to fit the window)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = 280;
    setEdit({
      id: u.id,
      x: Math.max(8, Math.min(toUi(r.right) - w, toUi(window.innerWidth) - w - 8)),
      y: Math.min(toUi(r.bottom) + 6, toUi(window.innerHeight) - 260),
      status: u.status,
      price: String(priceOf(u)),
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    const price = Number(edit.price.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(price) || price < 0) {
      setErr("Enter a valid price");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/client/units", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: edit.id, status: edit.status, price }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    onUnits((prev) => prev.map((u) => (u.id === edit.id ? { ...u, status: edit.status, price: Math.round(price) } : u)));
    setErr("");
    setEdit(null);
  };

  const remove = async (u: UnitRow) => {
    const ok = await confirm(
      `Remove villa ${u.display_id} from this project? It will no longer be listed or selectable in the tour.`,
      "Remove villa",
    );
    if (!ok) return;
    const res = await fetch("/api/client/units", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Could not delete");
      return;
    }
    onUnits((prev) => prev.filter((x) => x.id !== u.id));
  };

  const exportAs = (format: "excel" | "pdf") => {
    setExportOpen(false);
    const table = {
      title: `${cx.name} Apartments`,
      head: ["Villa", "Model", "Status", "Price (SAR)", "Bedrooms", "Area (m²)", "Floors"],
      rows: filtered.map((u) => [
        u.display_id,
        modelOf(u),
        STATUS[u.status],
        String(priceOf(u)),
        String(u.rooms),
        String(u.surface),
        String(u.floor),
      ]),
    };
    if (format === "excel") exportExcel(table);
    else exportPdf(table);
  };

  /** Import: a sheet with Villa + Status and/or Price columns (the Excel export works as a template). */
  const importFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setErr("");
    setMsg("");
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setErr("Import a .csv file (in Excel: File → Save as → CSV). Tip: use Export → Excel as a template.");
      return;
    }
    const table = parseCsv((await file.text()).replace(/^﻿/, ""));
    const head = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (re: RegExp) => head.findIndex((h) => re.test(h));
    const iVilla = col(/^(villa|name|unit|id|الفيلا|رقم)/);
    const iStatus = col(/^(status|الحالة)/);
    const iPrice = col(/^(price|السعر)/);
    if (iVilla < 0 || (iStatus < 0 && iPrice < 0)) {
      setErr("The file needs a Villa column and a Status and/or Price column.");
      return;
    }
    const body = table.slice(1).map((r) => ({
      villa: (r[iVilla] ?? "").replace(/^villa\s+/i, "").trim(),
      status: iStatus >= 0 ? statusFromText(r[iStatus] ?? "") : undefined,
      price: iPrice >= 0 && (r[iPrice] ?? "").replace(/[^\d.]/g, "") ? Number((r[iPrice] ?? "").replace(/[^\d.]/g, "")) : undefined,
    }));
    const res = await fetch("/api/client/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complexId: cx.id, rows: body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error || "Import failed");
      return;
    }
    // reflect the changes locally
    const byVilla = new Map(body.map((r) => [r.villa.toLowerCase(), r]));
    onUnits((prev) =>
      prev.map((u) => {
        if (u.complex_id !== cx.id) return u;
        const r = byVilla.get(u.display_id.toLowerCase());
        if (!r) return u;
        return { ...u, status: r.status ?? u.status, price: r.price !== undefined ? Math.round(r.price) : u.price };
      }),
    );
    setMsg(
      `${json.updated} villa${json.updated === 1 ? "" : "s"} updated` +
        (json.missingCount ? ` · ${json.missingCount} not found (${json.missing.join(", ")}${json.missingCount > json.missing.length ? "…" : ""})` : ""),
    );
  };

  const pageButtons = (() => {
    if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
    const start = Math.min(Math.max(1, current - 1), pages - 2);
    return [start, start + 1, start + 2];
  })();

  return (
    <section className="axc axc-scoped axa">
      <header className="axc-head">
        <span className="axa-emblem"><IcBuilding size={46} stroke={2.2} /></span>
        <div>
          <h1>{cx.name}</h1>
          <p className="axa-sub">{cx.description || "Apartments of this project"}</p>
        </div>
        {tabs}
      </header>

      <div className="axc-filters">
        <div className="axc-filters-title">
          <span className="axc-filter-emblem"><IcFilter size={18} /></span>
          Filters
        </div>
        <div className="axc-controls">
          <label className="axc-search">
            <IcSearch size={19} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name , price , status" aria-label="Search villas" />
          </label>
          <label className="axc-select wide">
            <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
              <option value="">All Models</option>
              {models.map((m) => <option key={m} value={m}>Model {m}</option>)}
            </select>
            <IcChevronDown size={17} />
          </label>
          <label className="axc-select">
            <select value={status} onChange={(e) => setStatus(e.target.value as "" | UnitStatus)} aria-label="Status">
              <option value="">Status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
            </select>
            <IcChevronDown size={17} />
          </label>
          <span className="axc-spacer" />
          <button type="button" className="axc-btn" onClick={() => fileRef.current?.click()} title="Update status / price of many villas from a CSV file">
            <IcImport size={18} stroke={1.8} />
            Import
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
          <div className="axc-export" ref={exportRef}>
            <button type="button" className="axc-btn" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((v) => !v)}>
              <IcExport size={18} />
              Export
            </button>
            {exportOpen ? (
              <div className="axc-pop axc-export-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => exportAs("excel")}><b className="xls">XLS</b> Excel</button>
                <button type="button" role="menuitem" onClick={() => exportAs("pdf")}><b className="pdf">PDF</b> PDF</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="axc-btn" onClick={() => { setQ(""); setStatus(""); setModel(""); }}>
            <IcRotate size={18} />
            Clear Filters
          </button>
        </div>
      </div>

      {msg || err ? (
        <div className="axa-bar">
          {msg ? <p className="axa-msg" role="status">{msg}</p> : null}
          {err ? <p className="axd-err" role="alert">{err}</p> : null}
        </div>
      ) : null}

      <div className="axa-card">
        <div className="axa-scroll">
          <table className="axa-table">
            <colgroup>
              <col style={{ width: "33%" }} />
              <col style={{ width: "16.5%" }} />
              <col style={{ width: "15.5%" }} />
              <col style={{ width: "23.5%" }} />
              <col style={{ width: "11.5%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Price</th>
                <th>Details</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} data-row={u.id} className={flash === u.id ? "flash" : undefined}>
                  <td>
                    <span className="axa-name">Villa {u.display_id}</span>
                    <span className="axa-desc">Model {modelOf(u)}</span>
                  </td>
                  <td><span className={`axa-badge ${u.status}`}>{STATUS[u.status]}</span></td>
                  <td className="axa-price">{fmtPrice(priceOf(u))}</td>
                  <td className="axa-details-cell">{details(u)}</td>
                  <td className="right">
                    <span className="axa-actions">
                      <button type="button" onClick={(e) => openEdit(e, u)} title="Edit status and price" aria-label={`Edit villa ${u.display_id}`}>
                        <IcPencil size={14} stroke={1.6} />
                      </button>
                      <button type="button" className="danger" onClick={() => void remove(u)} title="Remove villa" aria-label={`Remove villa ${u.display_id}`}>
                        <IcTrash size={14} stroke={1.6} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="axc-empty">{list.length ? "No villas match these filters." : "No villas in this project yet."}</p> : null}
        </div>
        <footer className="axc-foot">
          <span>{filtered.length} found</span>
          {pages > 1 ? (
            <nav className="axc-pages" aria-label="Pages">
              <button type="button" className="axc-page arrow" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><IcArrowLeft size={19} /></button>
              {pageButtons.map((n) => (
                <button key={n} type="button" className={`axc-page${n === current ? " on" : ""}`} onClick={() => setPage(n)} aria-current={n === current ? "page" : undefined}>{n}</button>
              ))}
              <button type="button" className="axc-page arrow" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="Next page"><IcArrowRight size={19} /></button>
            </nav>
          ) : null}
        </footer>
      </div>

      {edit ? (
        <div ref={popRef} className="axc-pop axa-edit" role="dialog" aria-label="Edit villa" style={{ left: edit.x, top: edit.y }}>
          <button type="button" className="axc-pop-x" onClick={() => setEdit(null)} aria-label="Close"><IcX size={16} /></button>
          <strong>Villa {list.find((u) => u.id === edit.id)?.display_id}</strong>
          <span className="axa-edit-label">Status</span>
          <div className="axa-edit-status">
            {STATUSES.map((s) => (
              <button key={s} type="button" className={`axa-badge ${s}${edit.status === s ? " on" : ""}`} aria-pressed={edit.status === s} onClick={() => setEdit({ ...edit, status: s })}>
                {STATUS[s]}
              </button>
            ))}
          </div>
          <label className="axa-edit-label" htmlFor="axa-price">Price (SAR)</label>
          <input
            id="axa-price"
            className="axa-edit-input"
            inputMode="numeric"
            value={edit.price}
            onChange={(e) => setEdit({ ...edit, price: e.target.value.replace(/[^\d]/g, "") })}
            onKeyDown={(e) => e.key === "Enter" && void saveEdit()}
          />
          <div className="axa-edit-actions">
            <button type="button" className="ghost" onClick={() => setEdit(null)}>Cancel</button>
            <button type="button" className="primary" disabled={saving} onClick={() => void saveEdit()}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}
