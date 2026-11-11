"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import type { ComplexRow } from "@/lib/types";
import { IcChevronDown, IcRotate } from "./DashIcons";
import ProjectStrip from "./ProjectStrip";

const SIZES = [
  { px: 512, label: "Small · 512 px (screens)" },
  { px: 1024, label: "Medium · 1024 px (flyers)" },
  { px: 2048, label: "Large · 2048 px (posters)" },
];

type Spec = { url: string; size: number; label: string };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "qr";

function validUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** PNG at the chosen size, with the label printed under the code when there is one. */
async function renderPng(spec: Spec) {
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, spec.url, { width: spec.size, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0b1220", light: "#ffffff" } });
  if (!spec.label.trim()) return qr.toDataURL("image/png");
  const band = Math.round(spec.size * 0.14);
  const out = document.createElement("canvas");
  out.width = spec.size;
  out.height = spec.size + band;
  const ctx = out.getContext("2d");
  if (!ctx) return qr.toDataURL("image/png");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(qr, 0, 0);
  ctx.fillStyle = "#0b1220";
  ctx.font = `700 ${Math.round(spec.size * 0.055)}px Inter, "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.label.trim(), spec.size / 2, spec.size + band * 0.38, spec.size * 0.9);
  return out.toDataURL("image/png");
}

export default function QrView({
  cx,
  complexes,
  onPick,
  tabs,
}: {
  cx: ComplexRow;
  complexes: ComplexRow[];
  onPick: (id: string) => void;
  tabs: ReactNode;
}) {
  // ?src=qr lets Analytics count visits that came from a scanned code
  const tourUrl = useMemo(() => (typeof window === "undefined" ? `/c/${cx.slug}?src=qr` : `${window.location.origin}/c/${cx.slug}?src=qr`), [cx.slug]);
  const initial: Spec = { url: tourUrl, size: 1024, label: cx.name };
  const [draft, setDraft] = useState<Spec>(initial);
  const [spec, setSpec] = useState<Spec>(initial);
  const [preview, setPreview] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // switching project resets the generator to that project's tour
  useEffect(() => {
    const next = { url: tourUrl, size: 1024, label: cx.name };
    setDraft(next);
    setSpec(next);
  }, [cx.id, cx.name, tourUrl]);

  // preview of the generated code (screen size; the PNG uses the chosen size)
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(spec.url, { width: 440, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1220", light: "#ffffff" } })
      .then((d) => alive && setPreview(d))
      .catch(() => alive && setPreview(""));
    return () => {
      alive = false;
    };
  }, [spec.url]);

  const changed = draft.url !== spec.url || draft.size !== spec.size || draft.label !== spec.label;

  const generate = () => {
    const url = draft.url.trim();
    if (!validUrl(url)) {
      setErr("Enter a full link starting with https://");
      return;
    }
    setErr("");
    setSpec({ ...draft, url });
  };

  const download = async () => {
    setBusy(true);
    try {
      const data = await renderPng(spec);
      const a = document.createElement("a");
      a.href = data;
      a.download = `${slugify(spec.label || cx.name)}-qr-${spec.size}.png`;
      a.click();
    } catch {
      setErr("Could not create the image");
    } finally {
      setBusy(false);
    }
  };

  const pointsToTour = spec.url === tourUrl;

  return (
    <section className="axq">
      <header className="axq-head">
        <div>
          <h1>QR Codes</h1>
          <p>Create and share scannable codes that open your virtual maquette</p>
        </div>
        {tabs}
      </header>

      <ProjectStrip cx={cx} complexes={complexes} onPick={onPick} />

      <div className="axq-grid">
        <div className="axq-section">
          <div className="axq-section-head">
            <div>
              <h2>QR Code Generator</h2>
              <p>Point the code to any link, then download it for print or screen</p>
            </div>
            <span className="axq-pill blue">Live preview</span>
          </div>

          <div className="axq-form">
            <label className="axq-field full">
              <span>Destination URL</span>
              <input
                type="url"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && generate()}
                spellCheck={false}
              />
            </label>
            <label className="axq-field">
              <span>Size</span>
              <span className="axq-select">
                <select value={draft.size} onChange={(e) => setDraft({ ...draft, size: Number(e.target.value) })}>
                  {SIZES.map((s) => <option key={s.px} value={s.px}>{s.label}</option>)}
                </select>
                <IcChevronDown size={14} />
              </span>
            </label>
            <label className="axq-field">
              <span>Label</span>
              <input value={draft.label} maxLength={40} onChange={(e) => setDraft({ ...draft, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && generate()} />
            </label>
            {err ? <p className="axd-err full" role="alert">{err}</p> : null}
            {!cx.published && pointsToTour ? (
              <p className="axq-note full">This project is not live yet: the code will open the tour once it is published.</p>
            ) : null}
            <button type="button" className="axq-dark full" onClick={generate}>
              <IcRotate size={15} stroke={1.6} />
              Generate QR code
            </button>
            {draft.url !== tourUrl ? (
              <button type="button" className="axq-reset full" onClick={() => setDraft({ ...draft, url: tourUrl })}>
                Use this project&apos;s tour link
              </button>
            ) : null}
          </div>
        </div>

        <div className="axq-section">
          <div className="axq-section-head">
            <div>
              <h2>Preview</h2>
              <p>Scan with any phone camera</p>
            </div>
            <span className={`axq-pill ${changed ? "amber" : "green"}`}>{changed ? "Not generated" : "Ready"}</span>
          </div>
          <div className="axq-preview">
            <div className="axq-code">
              {preview ? <img src={preview} alt={`QR code to ${spec.url}`} width={220} height={220} /> : <span className="axq-code-empty" />}
            </div>
            {spec.label ? <strong>{spec.label}</strong> : null}
            <a className="axq-url" href={spec.url} target="_blank" rel="noreferrer">{spec.url}</a>
            <button type="button" className="axq-dark" onClick={() => void download()} disabled={busy || !preview}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              {busy ? "Preparing…" : "Download PNG"}
            </button>
          </div>
        </div>
      </div>

      <div className="axq-section axq-tips">
        <div className="axq-section-head">
          <div>
            <h2>Placement Tips</h2>
            <p>Get the most scans out of every code</p>
          </div>
        </div>
        <div className="axq-tip-grid">
          <div className="axq-tip">
            <b>Keep it large</b>
            <p>Print codes at least 3 × 3 cm so phone cameras can lock on quickly.</p>
          </div>
          <div className="axq-tip">
            <b>High contrast</b>
            <p>Place dark modules on a light background and avoid glossy surfaces.</p>
          </div>
          <div className="axq-tip">
            <b>Unique per placement</b>
            <p>Use a distinct URL or UTM link for each campaign to track scans.</p>
          </div>
        </div>
      </div>

      <p className="axq-foot">AXIS Studio · Codes are generated on this page and never expire</p>
    </section>
  );
}
