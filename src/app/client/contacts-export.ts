/**
 * Contacts export — temporary formats until the final Excel / PDF design is decided.
 * Excel: UTF-8 CSV (opens directly in Excel, Arabic text included).
 * PDF: a print-ready table; the browser's print dialog saves it as PDF.
 */

export type ExportTable = { title: string; head: string[]; rows: string[][] };

const stamp = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contacts";

export function exportExcel(t: ExportTable) {
  const cell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [t.head, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(t.title)}-${stamp()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export function exportPdf(t: ExportTable) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)} — ${stamp()}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font: 11px/1.4 Inter, "Segoe UI", Arial, sans-serif; color: #0d1735; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 14px; color: #7383ac; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 600; border-bottom: 1.5px solid #cfd8ed; padding: 6px 6px; }
  td { border-bottom: 1px solid #e6eaf5; padding: 6px; vertical-align: top; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>${esc(t.title)}</h1><p>${t.rows.length} contact${t.rows.length === 1 ? "" : "s"} · exported ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
<table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td dir="auto">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
</body></html>`);
  doc.close();
  const done = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow?.addEventListener("afterprint", done);
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(done, 60_000); // fallback if afterprint never fires
  }, 150);
}
