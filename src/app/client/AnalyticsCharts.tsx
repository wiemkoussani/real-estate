"use client";

import { useEffect, useRef, useState } from "react";
import { toUi } from "./ui-scale";

/* Shared formatting */
export const fmtN = (n: number) => n.toLocaleString("en-US");
export const fmtK = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : fmtN(n));
export const fmtDur = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** width of an element, kept up to date (charts draw in real pixels so text never stretches) */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Tip = { x: number; y: number; lines: [string, string][]; title?: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="axn-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.title ? <b>{tip.title}</b> : null}
      {tip.lines.map(([k, v]) => (
        <span key={k}>
          {k} <strong>{v}</strong>
        </span>
      ))}
    </div>
  );
}

/* ---------------- donut ---------------- */
export type Slice = { key: string; label: string; value: number; pct: number; color: string };

export function Donut({ slices, total, unit }: { slices: Slice[]; total: number; unit: string }) {
  const [tip, setTip] = useState<Tip>(null);
  const size = 145;
  const r = 58;
  const width = 26;
  const c = 2 * Math.PI * r;
  const sum = slices.reduce((n, s) => n + s.value, 0) || 1;
  let offset = 0;
  return (
    <div className="axn-donut-wrap">
      <div className="axn-donut" style={{ width: size, height: size }} onMouseLeave={() => setTip(null)}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${unit}: ${slices.map((s) => `${s.label} ${s.pct}%`).join(", ")}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#edf1f8" strokeWidth={width} />
          {slices.map((s) => {
            const len = (s.value / sum) * c;
            const gap = slices.length > 1 ? 2 : 0; // 2px surface gap between segments
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={width}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: toUi(e.clientX - box.left) + 12, y: toUi(e.clientY - box.top) + 12, title: s.label, lines: [[unit, fmtN(s.value)], ["Share", `${s.pct}%`]] });
                }}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="axn-donut-center">
          <strong>{fmtK(total)}</strong>
          <small>{unit}</small>
        </div>
        <Tooltip tip={tip} />
      </div>
      <ul className="axn-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.pct}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- horizontal bars ---------------- */
export function HBars({ rows }: { rows: { key: string; label: string; value: number; max: number; color: string; text: string }[] }) {
  return (
    <div className="axn-hbars">
      {rows.map((r) => (
        <div className="axn-hbar" key={r.key} title={`${r.label}: ${r.text}`}>
          <span className="axn-hbar-label">{r.label}</span>
          <span className="axn-hbar-track">
            <span style={{ width: `${r.max && r.value > 0 ? Math.max(1.5, (r.value / r.max) * 100) : 0}%`, background: r.color }} />
          </span>
          <b>{r.text}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------------- line chart (one y-axis, two series of the same unit) ---------------- */
type Point = { t: string; a: number; b: number };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10) * p;
}

export function LineChart({ points, labelA, labelB, colorA, colorB, bucketDays }: { points: Point[]; labelA: string; labelB: string; colorA: string; colorB: string; bucketDays: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 190;
  const padL = 40;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const iw = Math.max(10, w - padL - padR);
  const ih = h - padT - padB;
  const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.a, p.b))));
  const x = (i: number) => padL + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const y = (v: number) => padT + ih - (v / max) * ih;
  const path = (k: "a" | "b") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");
  const area = points.length ? `${path("a")}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const fmtDay = (t: string) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 90))));
  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="axn-line" ref={ref}>
      {w > 0 ? (
        <svg
          width={w}
          height={h}
          role="img"
          aria-label={`${labelA} and ${labelB} over time`}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = toUi(e.clientX - box.left);
            const i = Math.round(((px - padL) / iw) * (points.length - 1));
            setHover(points.length ? Math.max(0, Math.min(points.length - 1, i)) : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={padL + iw} y1={y(max * f)} y2={y(max * f)} stroke="#e9eef6" strokeDasharray={f ? "4 4" : undefined} />
              <text x={padL - 8} y={y(max * f) + 4} textAnchor="end" className="axn-axis">{fmtN(Math.round(max * f))}</text>
            </g>
          ))}
          {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (i === points.length - 1 || points.length - 1 - i >= labelEvery / 2) ? (
            <text key={p.t} x={x(i)} y={h - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="axn-axis">{fmtDay(p.t)}</text>
          ) : null)}
          <path d={area} fill={colorA} opacity={0.08} />
          <path d={path("a")} fill="none" stroke={colorA} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("b")} fill="none" stroke={colorB} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hp ? (
            <g>
              <line x1={x(hover as number)} x2={x(hover as number)} y1={padT} y2={padT + ih} stroke="#c7d2e6" />
              <circle cx={x(hover as number)} cy={y(hp.a)} r={4.5} fill={colorA} stroke="#fff" strokeWidth={2} />
              <circle cx={x(hover as number)} cy={y(hp.b)} r={4.5} fill={colorB} stroke="#fff" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
      ) : null}
      {hp && hover !== null ? (
        <Tooltip
          tip={{
            x: Math.min(x(hover) + 12, Math.max(0, w - 170)),
            y: 8,
            title: bucketDays > 1 ? `Week of ${fmtDay(hp.t)}` : new Date(hp.t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
            lines: [[labelA, fmtN(hp.a)], [labelB, fmtN(hp.b)]],
          }}
        />
      ) : null}
      <div className="axn-legend-row">
        <span><i style={{ background: colorA }} />{labelA}</span>
        <span><i style={{ background: colorB }} />{labelB}</span>
      </div>
    </div>
  );
}

/* ---------------- vertical bars (single series) ---------------- */
export function VBars({ rows, unit }: { rows: { key: string; label: string; value: number }[]; unit: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = 175;
  const padB = 18;
  const ih = h - padB - 6;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const slot = rows.length ? w / rows.length : 0;
  const bw = Math.min(18, Math.max(4, slot - 4));
  return (
    <div className="axn-vbars" ref={ref} onMouseLeave={() => setHover(null)}>
      {w > 0 ? (
        <svg width={w} height={h} role="img" aria-label={`${unit} per villa`}>
          <defs>
            <linearGradient id="axnFav" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff8a97" />
              <stop offset="1" stopColor="#ef4b5f" />
            </linearGradient>
          </defs>
          <line x1={0} x2={w} y1={6 + ih} y2={6 + ih} stroke="#e9eef6" />
          {rows.map((r, i) => {
            const bh = Math.max(3, (r.value / max) * ih);
            const cx = slot * i + slot / 2;
            return (
              <g key={r.key} onMouseEnter={() => setHover(i)}>
                <rect x={slot * i} y={0} width={slot} height={h} fill="transparent" />
                <path
                  d={`M${cx - bw / 2},${6 + ih}V${6 + ih - bh + 4}Q${cx - bw / 2},${6 + ih - bh} ${cx - bw / 2 + 4},${6 + ih - bh}H${cx + bw / 2 - 4}Q${cx + bw / 2},${6 + ih - bh} ${cx + bw / 2},${6 + ih - bh + 4}V${6 + ih}Z`}
                  fill="url(#axnFav)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
                {slot >= 22 || i % Math.ceil(22 / Math.max(1, slot)) === 0 ? (
                  <text x={cx} y={h - 4} textAnchor="middle" className="axn-axis small">{r.label}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover !== null && rows[hover] ? (
        <Tooltip tip={{ x: Math.min(slot * hover + slot / 2 + 10, Math.max(0, w - 140)), y: 4, title: `Villa ${rows[hover].label}`, lines: [[unit, fmtN(rows[hover].value)]] }} />
      ) : null}
    </div>
  );
}
