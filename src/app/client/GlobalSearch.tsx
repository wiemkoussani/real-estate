"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IcBuilding, IcDoor, IcGrid, IcSearch, IcUsers } from "./DashIcons";

export type SearchGroup = "Pages" | "Projects" | "Villas" | "Contacts";

export type SearchHit = {
  key: string;
  group: SearchGroup;
  title: string;
  sub?: string;
  /** extra text that can match but is not shown (email, phone, note…) */
  terms?: string[];
  go: () => void;
};

const GROUP_ORDER: SearchGroup[] = ["Pages", "Projects", "Villas", "Contacts"];
/** results kept per group; only ~5 are visible at once, the list scrolls */
const PER_GROUP = 15;

/** lower case, no Latin accents, no Arabic diacritics / tatweel */
export function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/**
 * Every word typed must appear somewhere (title, subtitle or hidden fields), so "villa 1" finds "Villa T1-001".
 * 0 = title starts with the query … 4 = only hidden fields match; -1 = no match.
 */
function score(hit: SearchHit, q: string, qDigits: string) {
  const t = norm(hit.title);
  const sub = hit.sub ? norm(hit.sub) : "";
  const terms = (hit.terms ?? []).filter(Boolean).map(norm);
  const all = [t, sub, ...terms].join(" ");
  const words = q.split(/\s+/).filter(Boolean);
  const phone = qDigits.length >= 3 && /^[\d\s+()-]+$/.test(q) && (hit.terms ?? []).some((x) => x.replace(/\D/g, "").includes(qDigits));
  if (!phone && !words.every((w) => all.includes(w))) return -1;
  if (t.startsWith(q)) return 0;
  if (words.every((w) => t.split(/[\s·,|-]+/).some((p) => p.startsWith(w)))) return 1;
  if (words.every((w) => t.includes(w))) return 2;
  if (words.every((w) => t.includes(w) || sub.includes(w))) return 3;
  return 4;
}

/** Highlights every typed word inside the text. */
function Highlight({ text, q }: { text: string; q: string }) {
  const n = norm(text);
  // only highlight when normalising kept the length (true for almost all names)
  if (!q || n.length !== text.length) return <>{text}</>;
  const marks = new Array<boolean>(text.length).fill(false);
  for (const w of q.split(/\s+/).filter(Boolean)) {
    const i = n.indexOf(w);
    if (i >= 0) marks.fill(true, i, i + w.length);
  }
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && marks[j] === marks[i]) j++;
    parts.push(marks[i] ? <mark key={i}>{text.slice(i, j)}</mark> : text.slice(i, j));
    i = j;
  }
  return <>{parts}</>;
}

const ICON: Record<SearchGroup, React.ReactNode> = {
  Pages: <IcGrid size={16} stroke={1.8} />,
  Projects: <IcBuilding size={16} stroke={1.8} />,
  Villas: <IcDoor size={16} stroke={1.8} />,
  Contacts: <IcUsers size={16} stroke={1.8} />,
};

export default function GlobalSearch({ items }: { items: SearchHit[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nq = norm(q.trim());
  const results = useMemo(() => {
    if (!nq) return [];
    const digits = nq.replace(/\D/g, "");
    const scored = items
      .map((hit) => ({ hit, s: score(hit, nq, digits) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => a.s - b.s || a.hit.title.localeCompare(b.hit.title, undefined, { numeric: true }));
    const out: SearchHit[] = [];
    for (const g of GROUP_ORDER) out.push(...scored.filter((r) => r.hit.group === g).slice(0, PER_GROUP).map((r) => r.hit));
    return out;
  }, [items, nq]);

  useEffect(() => setActive(0), [nq]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);

  // Ctrl/Cmd+K focuses the search
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const pick = (hit: SearchHit | undefined) => {
    if (!hit) return;
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    hit.go();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      if (q) setQ("");
      else inputRef.current?.blur();
      setOpen(false);
    }
  };

  // keep the highlighted item visible while using the arrow keys
  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup: SearchGroup | null = null;
  return (
    <div className="axd-search" ref={boxRef}>
      <IcSearch size={21} stroke={1.7} />
      <input
        ref={inputRef}
        type="search"
        value={q}
        placeholder="Search anything..."
        aria-label="Search anything"
        role="combobox"
        aria-expanded={open && nq.length > 0}
        aria-controls="axd-search-list"
        aria-activedescendant={open && results[active] ? `axd-hit-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {open && nq ? (
        <div className="axd-search-pop" id="axd-search-list" role="listbox">
          {results.length ? (
            results.map((hit, i) => {
              const head = hit.group !== lastGroup ? hit.group : null;
              lastGroup = hit.group;
              return (
                <div key={hit.key}>
                  {head ? <p className="axd-search-group">{head}</p> : null}
                  <button
                    type="button"
                    id={`axd-hit-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={i === active}
                    className={`axd-search-hit${i === active ? " on" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(hit)}
                  >
                    <span className="axd-search-ico">{ICON[hit.group]}</span>
                    <span className="axd-search-text">
                      <b><Highlight text={hit.title} q={nq} /></b>
                      {hit.sub ? <small><Highlight text={hit.sub} q={nq} /></small> : null}
                    </span>
                  </button>
                </div>
              );
            })
          ) : (
            <p className="axd-search-empty">Nothing found for “{q.trim()}”</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
