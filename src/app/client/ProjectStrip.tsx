"use client";

import { useEffect, useRef, useState } from "react";
import type { ComplexRow } from "@/lib/types";
import { IcBuilding, IcChevronDown } from "./DashIcons";

/** "Villas Ajyad · description · city" bar with the "Project overview ⌄" switcher (QR, Analytics). */
export default function ProjectStrip({ cx, complexes, onPick }: { cx: ComplexRow; complexes: ComplexRow[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const meta = [cx.description, cx.city].filter(Boolean).join(" · ");
  return (
    <div className="axq-project" ref={ref}>
      <span className="axq-project-icon"><IcBuilding size={18} stroke={1.5} /></span>
      <div className="axq-project-text">
        <strong>{cx.name}</strong>
        {meta ? <small>{meta}</small> : null}
      </div>
      {complexes.length > 1 ? (
        <button type="button" className="axq-overview" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Project overview <IcChevronDown size={12} />
        </button>
      ) : (
        <span className="axq-overview static">Project overview</span>
      )}
      {open ? (
        <div className="axc-pop axq-pick" role="listbox">
          {complexes.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === cx.id}
              className={c.id === cx.id ? "on" : ""}
              onClick={() => {
                setOpen(false);
                onPick(c.id);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
