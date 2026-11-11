"use client";

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, createContext } from "react";
import { COMPLEX, UNIT_MODELS, modelOf, sarParts, type Unit, type UnitStatus } from "@/lib/complex";
import { isPhoneLayout, PHONE_LAYOUT_MQ } from "@/lib/phoneLayout";
import { buildTour, emptyTour, tourPlanDetailUrl, tourPlanUrl, tourVillaUrl, type TourMedia } from "@/lib/tour";
import type { OrbitEngine as OrbitEngineType } from "@/viewer/OrbitEngine";
import {
  Icon360,
  IconApps,
  IconBack,
  IconChevronDown,
  IconClose,
  IconEye,
  IconFilters,
  IconGallery,
  IconHeart,
  IconHelp,
  IconMail,
  IconEyeOff,
  IconFullscreen,
  IconFullscreenExit,
  IconMinus,
  IconPan,
  IconPanClosed,
  IconPin,
  IconPlus,
  IconTriL,
  IconTriR,
} from "@/components/Icons";
import { GalleryPage, HelpPage, LocationPage } from "@/components/TourPages";
import PanoramaViewer from "@/components/PanoramaViewer";
import Visite360Viewer from "@/components/Visite360Viewer";
import { attachGlideScroll } from "@/lib/glide-scroll";

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

const STATUS_AR: Record<UnitStatus, string> = {
  available: "متاح",
  reserved: "محجوز",
  sold: "مباع",
};

function unitPrice(u: Unit) {
  const model = modelOf(u);
  return u.price || COMPLEX.defaultPriceByModel[model] || COMPLEX.defaultPriceByType[u.type] || 0;
}

function mediaSrc(url: string | undefined | null) {
  return url ? url : undefined;
}

const DIAL_CODES = [
  { d: "+966", n: "Arabie saoudite" },
  { d: "+216", n: "Tunisie" },
  { d: "+213", n: "Algérie" },
  { d: "+212", n: "Maroc" },
  { d: "+20", n: "Égypte" },
  { d: "+971", n: "EAU" },
  { d: "+965", n: "Koweït" },
  { d: "+974", n: "Qatar" },
  { d: "+973", n: "Bahreïn" },
  { d: "+968", n: "Oman" },
  { d: "+962", n: "Jordanie" },
  { d: "+961", n: "Liban" },
  { d: "+963", n: "Syrie" },
  { d: "+964", n: "Irak" },
  { d: "+967", n: "Yémen" },
  { d: "+970", n: "Palestine" },
  { d: "+218", n: "Libye" },
  { d: "+222", n: "Mauritanie" },
  { d: "+249", n: "Soudan" },
  { d: "+90", n: "Turquie" },
  { d: "+33", n: "France" },
  { d: "+32", n: "Belgique" },
  { d: "+41", n: "Suisse" },
  { d: "+49", n: "Allemagne" },
  { d: "+39", n: "Italie" },
  { d: "+34", n: "Espagne" },
  { d: "+44", n: "Royaume-Uni" },
  { d: "+1", n: "États-Unis / Canada" },
  { d: "+92", n: "Pakistan" },
  { d: "+91", n: "Inde" },
];

/**
 * "+971 54213568" / "00971…" typed or pasted in the number field → { dial: "+971", rest: "54213568" }.
 * Only once something follows the code (a space or more digits), so "+21" doesn't jump early;
 * the longest matching code wins (+216 before +2…).
 */
function splitDialPrefix(value: string): { dial: string; rest: string } | null {
  const m = value.match(/^\s*(?:\+|00)([\d\s().-]*)$/);
  if (!m) return null;
  const raw = m[1];
  const digits = raw.replace(/\D/g, "");
  const best = DIAL_CODES.map((c) => c.d.slice(1))
    .filter((code) => digits.startsWith(code))
    .sort((a, b) => b.length - a.length)[0];
  if (!best) return null;
  // walk the raw text past the code's digits
  let seen = 0;
  let i = 0;
  while (i < raw.length && seen < best.length) {
    if (/\d/.test(raw[i])) seen++;
    i++;
  }
  const after = raw.slice(i);
  if (!after) return null; // still typing the code
  return { dial: `+${best}`, rest: after.replace(/^[\s().-]+/, "") };
}

function telFromForm(fd: FormData) {
  const dial = String(fd.get("dial") || "+216").trim();
  let num = String(fd.get("tel") || "").trim().replace(/[\s.-]/g, "");
  if (!num) return "";
  if (num.startsWith("+")) return num;
  return `${dial}${num.replace(/^0+/, "")}`;
}

const NAME_DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
const PHONE_LETTER = /[A-Za-z\u00C0-\u024F\u0600-\u06FF]/;
type ContactIssue = "gender" | "nom" | "prenom" | "email" | "tel";

function emailHasAtAndDot(email: string) {
  const at = email.indexOf("@");
  if (at <= 0 || /\s/.test(email) || email.indexOf("@", at + 1) !== -1) return false;
  const rest = email.slice(at + 1);
  const dot = rest.indexOf(".");
  return dot > 0 && dot < rest.length - 1;
}

function contactIssues(input: { gender: string; nom: string; prenom: string; email: string; tel: string }) {
  const out: Partial<Record<ContactIssue, string>> = {};
  if (!input.gender) out.gender = "اختر اللقب: السيدة أو السيد أو لا";
  if (!input.nom) out.nom = "أدخل اسم العائلة";
  else if (NAME_DIGIT.test(input.nom)) out.nom = "لا يمكن أن يحتوي اسم العائلة على أرقام";
  if (!input.prenom) out.prenom = "أدخل الاسم الأول";
  else if (NAME_DIGIT.test(input.prenom)) out.prenom = "لا يمكن أن يحتوي الاسم الأول على أرقام";
  if (!input.email) out.email = "أدخل بريدك الإلكتروني";
  else if (!emailHasAtAndDot(input.email)) out.email = "يجب أن يحتوي البريد على @ ونقطة بعده";
  if (!input.tel) out.tel = "أدخل رقم هاتفك";
  else if (PHONE_LETTER.test(input.tel)) out.tel = "لا يمكن أن يحتوي رقم الهاتف على حروف";
  return out;
}

function issueCountLine(n: number) {
  if (n === 1) return "يوجد حقل واحد يحتاج إلى تصحيح قبل الإرسال.";
  if (n === 2) return "يوجد حقلان يحتاجان إلى تصحيح قبل الإرسال.";
  return `يوجد ${n} حقول تحتاج إلى تصحيح قبل الإرسال.`;
}

function FieldMark() {
  return (
    <svg className="field-mark" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <circle cx="8" cy="8" r="6.35" fill="#fff" stroke="#D83848" strokeWidth="1.6" />
      <text x="8" y="8.7" textAnchor="middle" dominantBaseline="middle" fill="#D83848" fontSize="11" fontWeight="700" fontFamily="Arial, sans-serif">!</text>
    </svg>
  );
}

function PhoneField({ required, placeholder }: { required?: boolean; placeholder?: string }) {
  const [dial, setDial] = useState("+966");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const place = (e?: Event) => {
      // scrolling inside the list itself must not move it
      if (e && (e.target as HTMLElement | null)?.closest?.(".dial-list")) return;
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, 72);
      const left = Math.min(r.left, window.innerWidth - width - 8);
      setMenuPos({ top: r.bottom + 6, left: Math.max(8, left), width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // opening the list: scroll it so the selected code is in view (once, not on every reposition)
  const menuShown = menuPos !== null;
  useEffect(() => {
    if (!open || !menuShown) return;
    const list = listRef.current;
    const on = list?.querySelector<HTMLElement>("button.on");
    if (list && on) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2;
  }, [open, menuShown]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if ((e.target as HTMLElement | null)?.closest?.(".dial-list")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="phone-row">
      <span className={`select-wrap${open ? " open" : ""}`} ref={wrapRef}>
        <input type="hidden" name="dial" value={dial} />
        <button
          ref={btnRef}
          id="dial-btn"
          type="button"
          className="dial-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="dial-list"
          aria-label="رمز الدولة"
          onClick={() => setOpen((v) => !v)}
        >
          <IconChevronDown className={`chev${open ? " up" : ""}`} />
          <span className="dial-val">{dial}</span>
        </button>
        {open && menuPos && (
          <ul
            id="dial-list"
            ref={listRef}
            className="dial-list"
            role="listbox"
            aria-label="رمز الدولة"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            {DIAL_CODES.map((c) => (
              <li key={c.d + c.n} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={c.d === dial}
                  title={c.n}
                  className={c.d === dial ? "on" : undefined}
                  onClick={() => {
                    setDial(c.d);
                    setOpen(false);
                  }}
                >
                  {c.d}
                </button>
              </li>
            ))}
          </ul>
        )}
      </span>
      <input
        name="tel"
        type="tel"
        required={required}
        autoComplete="tel"
        inputMode="tel"
        placeholder={placeholder}
        onChange={(e) => {
          const hit = splitDialPrefix(e.currentTarget.value);
          if (!hit) return;
          setDial(hit.dial);
          const el = e.currentTarget;
          el.value = hit.rest;
          el.setSelectionRange?.(hit.rest.length, hit.rest.length);
        }}
      />
    </span>
  );
}

type DetailTab = "floor3d" | "visite360";

const TourCtx = createContext<TourMedia>(emptyTour(COMPLEX.slug));
function useTour() {
  return useContext(TourCtx);
}

const INTRO_VIDEO = "/complexes/villas-ajyad/intro.mp4";
const INTRO_LOGO = "/complexes/villas-ajyad/" + encodeURIComponent("الشعار.png");

function ChargeSplash() {
  return (
    <div className="charge-splash" role="status" aria-live="polite">
      <div className="charge-mark">
        <span className="charge-ring" />
        <img src={INTRO_LOGO} alt="" />
      </div>
      <p dir="rtl"><span>جارٍ الشحن</span><span className="charge-dots">...</span></p>
    </div>
  );
}

export default function ComplexApp({ slug, initialTour }: { slug: string; initialTour?: TourMedia | null }) {
  const [tour, setTour] = useState<TourMedia | null>(initialTour ?? null);
  const [splash, setSplash] = useState(true);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let closed = false;
    const started = performance.now();
    const close = () => {
      if (closed) return;
      closed = true;
      setSplash(false);
    };
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = INTRO_VIDEO;
    video.addEventListener("canplay", close);
    video.addEventListener("error", () => {
      const left = Math.max(0, 2000 - (performance.now() - started));
      window.setTimeout(close, left);
    });
    video.load();
    return () => {
      closed = true;
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Only swap the tour when the data really changed: a new tour object rebuilds the
    // 3D stage, which would restart the loading counter from 0.
    const apply = (next: TourMedia) => {
      if (cancelled) return;
      setTour((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    if (initialTour) apply(initialTour);
    // Refresh from API so branding logo / assets are not missing after SSR.
    fetch(`/api/complexes/${slug}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Not found");
        return buildTour(json, slug);
      })
      .then((next) => apply(next))
      .catch(() => {
        if (!cancelled && !initialTour) apply(emptyTour(slug));
      });
    return () => {
      cancelled = true;
    };
  }, [slug, initialTour]);

  if (!tour) {
    return <ChargeSplash />;
  }

  return (
    <TourCtx.Provider value={tour}>
      {splash && <ChargeSplash />}
      <ComplexStage tour={tour} introOpen={!entered} onEnter={() => setEntered(true)} />
    </TourCtx.Provider>
  );
}

/* ---------- villa interior frames: shared cache, preloaded before the maquette opens ---------- */

const villaImgCache = new Map<string, HTMLImageElement>();

/** Download one interior frame into the shared cache (Spin360 reuses it). Resolves on load or error. */
function preloadVillaImg(src: string): Promise<void> {
  let img = villaImgCache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    villaImgCache.set(src, img);
  }
  const el = img;
  if (el.complete) return Promise.resolve();
  return new Promise((resolve) => {
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => resolve(), { once: true });
  });
}

/** Every other frame (half = 0 → 1st, 3rd, 5th…; half = 1 → the others) of every villa type and floor, Final floor first. */
function villaFrameUrls(tour: TourMedia, half: 0 | 1) {
  const n = tour.villaFrames;
  const floors = [...(COMPLEX.villa360?.floors ?? [])].reverse(); // Final is the floor that opens first
  const out: string[] = [];
  for (const f of floors) {
    for (const t of Object.keys(COMPLEX.villaTypes).map(Number)) {
      for (let i = half; i < n; i += 2) {
        const src = tourVillaUrl(tour, t, f.subfolder, i);
        if (src) out.push(src);
      }
    }
  }
  return [...new Set(out)];
}

/** Load urls a few at a time; onEach is called after each one finishes. */
async function loadPool(urls: string[], workers: number, stopped: () => boolean, onEach: () => void) {
  let next = 0;
  const work = async () => {
    while (!stopped() && next < urls.length) {
      await preloadVillaImg(urls[next++]);
      if (!stopped()) onEach();
    }
  };
  await Promise.all(Array.from({ length: workers }, work));
}

function cardPhoto(tour: TourMedia, unit: Unit) {
  // Prefer ≤20KB card thumbs when present; keep full plans for detail/hover.
  const thumb =
    tour.plans[`type-${unit.type}-thumb.webp`] ||
    tour.plans[`type-${unit.type}-thumb.jpg`] ||
    Object.entries(tour.plans).find(([k]) => k.includes(`type-${unit.type}`) && /thumb/i.test(k))?.[1] ||
    "";
  if (thumb) return thumb;
  const plan = tourPlanUrl(tour, unit);
  if (plan) return plan;
  const byType = Object.entries(tour.plans).find(([k]) => k.includes(`type-${unit.type}`) && !/thumb/i.test(k));
  if (byType) return byType[1];
  const plans = Object.values(tour.plans).filter(Boolean);
  return plans[0] || "";
}

function IntroScreen({ ready, loadPct, onEnter }: { ready: boolean; loadPct: number; onEnter: () => void }) {
  const open = ready || loadPct >= 99.999;
  const [nhc, setNhc] = useState(true);
  const [fullOn, setFullOn] = useState(false);
  useEffect(() => {
    const sync = () => setFullOn(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const full = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };
  return (
    <div className="intro">
      <video className="intro-video" autoPlay muted loop playsInline preload="auto" src={INTRO_VIDEO} />
      <div className="intro-dim" />
      <div className="intro-vignette" />
      <div className="intro-fade" />
      <div className="intro-blur" />
      <div className="intro-center">
        <img className="intro-logo" src={INTRO_LOGO} alt="" />
        <span className="intro-rule" />
        {open ? (
          <button type="button" className="intro-cta" onClick={onEnter}><span>اكتشف المزيد</span></button>
        ) : (
          <p className="intro-count" aria-live="polite">{Math.round(loadPct)}%</p>
        )}
      </div>
      <div className="intro-works">
        <span>تقدم الاشغال</span>
        <b>15%</b>
      </div>
      <button type="button" className="intro-full" onClick={full} aria-label={fullOn ? "خروج من ملء الشاشة" : "ملء الشاشة"}>
        {fullOn ? <IconFullscreenExit size={22} /> : <IconFullscreen size={22} />}
      </button>
      {nhc && <img className="intro-nhc" src="/complexes/villas-ajyad/nhc.png" alt="NHC" onError={() => setNhc(false)} />}
      <div className="intro-social">
        <span>تابعنا</span>
        <div>
          <Social label="انستغرام" href="https://www.instagram.com/ajyadarabia"><IgIcon /></Social>
          <Social label="فيسبوك" href="https://www.facebook.com/share/19wFaK4aW1/"><FbIcon /></Social>
          <Social label="تيك توك" href="https://www.tiktok.com/@ajyadarabia"><TtIcon /></Social>
          <Social label="يوتيوب"><YtIcon /></Social>
          <Social label="لينكد إن" href="https://www.linkedin.com/in/ajyad-arabia-84a938356"><InIcon /></Social>
        </div>
      </div>
    </div>
  );
}

function Social({ label, href, children }: { label: string; href?: string; children: React.ReactNode }) {
  if (!href) return <button type="button" className="intro-soc" aria-label={label}>{children}</button>;
  return <a className="intro-soc" href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>{children}</a>;
}
function IgIcon() {
  return <svg width="17.09" height="17.09" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" fill="#fff" stroke="none" /></svg>;
}
function FbIcon() {
  return <svg width="17.09" height="17.09" viewBox="0 0 24 24" fill="#fff"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-2c0-.6.4-1 1-1z" /></svg>;
}
function TtIcon() {
  return <svg width="17.09" height="17.09" viewBox="0 0 24 24" fill="#fff"><path d="M14 4h2.2a5 5 0 0 0 3.8 3.6v2.3a7.2 7.2 0 0 1-3.8-1.1v6.4a5.8 5.8 0 1 1-5-5.7v2.4a3.4 3.4 0 1 0 2.4 3.3V4z" /></svg>;
}
function YtIcon() {
  return <svg width="17.09" height="17.09" viewBox="0 0 24 24" fill="#fff"><path d="M22 12.2s0-3.2-.4-4.6c-.2-.9-.9-1.6-1.8-1.8C18.2 5.4 12 5.4 12 5.4s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 9 2 12.2 2 12.2s0 3.2.4 4.6c.2.9.9 1.6 1.8 1.8 1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.4.4-4.6.4-4.6zM10 15.5v-6.6l5.2 3.3-5.2 3.3z" /></svg>;
}
function InIcon() {
  return <svg width="17.09" height="17.09" viewBox="0 0 24 24" fill="#fff"><path d="M6.5 9H4V20h2.5V9zM5.2 4A1.6 1.6 0 1 0 5.2 7.2 1.6 1.6 0 0 0 5.2 4zM20 20h-2.5v-5.6c0-1.6-.6-2.6-2-2.6-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V20H11V9h2.4v1.5c.4-.7 1.3-1.8 3.2-1.8 2.3 0 4 1.5 4 4.8V20z" /></svg>;
}

function ComplexStage({ tour, introOpen, onEnter }: { tour: TourMedia; introOpen: boolean; onEnter: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const bgNextRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OrbitEngineType | null>(null);
  const approachedRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  // half of the villa interior frames are loaded before the maquette opens, the other half right after
  const [villaPct, setVillaPct] = useState(0);
  const [villaHalfDone, setVillaHalfDone] = useState(false);
  const [villaHasFrames, setVillaHasFrames] = useState(true);
  useEffect(() => {
    let stop = false;
    const stopped = () => stop;
    const first = villaFrameUrls(tour, 0);
    const second = villaFrameUrls(tour, 1);
    setVillaHasFrames(first.length > 0);
    if (!first.length) {
      setVillaPct(100);
      setVillaHalfDone(true);
      return;
    }
    let done = 0;
    setVillaPct(0);
    setVillaHalfDone(false);
    void loadPool(first, 4, stopped, () => {
      done++;
      setVillaPct((done / first.length) * 100);
    }).then(() => {
      if (stop) return;
      setVillaHalfDone(true);
      // the other half in the background, gently
      void loadPool(second, 2, stopped, () => {});
    });
    return () => {
      stop = true;
    };
  }, [tour]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [frame, setFrame] = useState(0);
  const [hover, setHover] = useState<Unit | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Unit | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersClosing, setFiltersClosing] = useState(false);
  const filtersClosingRef = useRef(false);
  const filtersCloseTimer = useRef<number | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [heartPop, setHeartPop] = useState(false);
  // No liked villas yet: the heart just nudges and shows "0" instead of switching to an empty list
  const [heartNudge, setHeartNudge] = useState(false);
  const heartNudgeTimer = useRef<number | null>(null);
  const [listMotion, setListMotion] = useState(false);
  const listMotionTimer = useRef<number | null>(null);
  const [leavingFavs, setLeavingFavs] = useState<string[]>([]);
  const leaveTimers = useRef<Map<string, number>>(new Map());
  const [overlayOn, setOverlayOn] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [headingDir, setHeadingDir] = useState("N");
  const [headingDeg, setHeadingDeg] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [tourUnit, setTourUnit] = useState<Unit | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [scene360Strip, setScene360Strip] = useState(false);
  const [stripClosing, setStripClosing] = useState(false);
  const stripClosingRef = useRef(false);
  const stripCloseTimer = useRef<number | null>(null);
  const [scene360Open, setScene360Open] = useState(false);
  const [scene360Closing, setScene360Closing] = useState(false);
  const scene360ClosingRef = useRef(false);
  const scene360CloseTimer = useRef<number | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const rotateHoldRef = useRef<number | null>(null);
  const zoomHoldRef = useRef<number | null>(null);
  const stripDragRef = useRef(false);
  const stripElRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockFacedIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"all" | UnitStatus>("all");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<number[]>([]);
  const [areaMin, setAreaMin] = useState(100);
  const [areaMax, setAreaMax] = useState(300);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(600_000);
  const [floorMax, setFloorMax] = useState(5);

  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem("axis-favs") || "[]"));
    } catch {
      setFavs([]);
    }
  }, []);

  useEffect(() => {
    const urls = [...new Set(tour.scenes360.map((scene) => scene.thumbUrl || scene.url).filter(Boolean))];
    const imgs = urls.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    return () => {
      imgs.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [tour.scenes360]);

  useLayoutEffect(() => {
    let phone = isPhoneLayout();
    const apply = (force: boolean) => {
      const next = isPhoneLayout();
      document.documentElement.classList.toggle("phone-layout", next);
      if (!force && next === phone) return;
      phone = next;
      if (next) {
        setListOpen(false);
        setFiltersOpen(false);
      } else {
        setListOpen(true);
      }
      setLayoutReady(true);
    };
    apply(true);
    const onResize = () => apply(false);
    window.addEventListener("resize", onResize);
    const mq = window.matchMedia(PHONE_LAYOUT_MQ);
    mq.addEventListener("change", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", onResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scene360CloseTimer.current) window.clearTimeout(scene360CloseTimer.current);
      if (stripCloseTimer.current) window.clearTimeout(stripCloseTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = tour.locationQuery || tour.name;
    if (!q) return;
    const hasExact = Number.isFinite(tour.locationLat) && Number.isFinite(tour.locationLng);
    const key = hasExact
      ? `poi-map-v16:${tour.locationLat.toFixed(5)},${tour.locationLng.toFixed(5)}`
      : `poi-map-v16:${q}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { places?: unknown[] };
        if (saved?.places?.length) return;
      }
    } catch {
      /* ignore */
    }
    const url = hasExact
      ? `/api/maps/around?lat=${tour.locationLat}&lng=${tour.locationLng}&address=${encodeURIComponent(q)}&light=1`
      : `/api/maps/around?q=${encodeURIComponent(q)}&light=1`;
    const run = () => {
      void fetch(url)
        .then((r) => r.json())
        .then((body) => {
          if (body?.lat && body?.places?.length) {
            try {
              sessionStorage.setItem(key, JSON.stringify(body));
            } catch {
              /* ignore */
            }
          }
        })
        .catch(() => {});
    };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) {
      const id = ric(run, { timeout: 2500 });
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, [ready, tour.locationQuery, tour.locationLat, tour.locationLng, tour.name]);

  const pickUnit = async (u: Unit, engine?: OrbitEngineType | null) => {
    const en = engine ?? engineRef.current;
    if (!en || busyRef.current) return;
    if (approachedRef.current === u.id) {
      setTourUnit(u);
      return;
    }
    busyRef.current = true;
    approachedRef.current = u.id;
    setSelected(u);
    setTourUnit(null);
    // Focus/tint is applied inside approach() after the orbit turn, so color
    // doesn't drift off the house while the aerial spins.
    await en.approach(u.id);
    busyRef.current = false;
  };

  useEffect(() => {
    const stage = stageRef.current;
    const bg = bgRef.current;
    const bgNext = bgNextRef.current;
    const three = threeRef.current;
    if (!stage || !bg || !bgNext || !three) return;
    let cancelled = false;
    let engine: OrbitEngineType | null = null;
    void import("@/viewer/OrbitEngine").then(({ OrbitEngine }) => {
      if (cancelled) return;
      engine = new OrbitEngine(stage, { bg, bgNext, three }, {
        // the counter only goes up, even if the stage is rebuilt
        onLoadProgress: (pct) => setLoadPct((prev) => Math.max(prev, pct)),
        onFrame: (i) => {
          setFrame(i);
          setHeadingDir(engine!.getHeadingDir());
          setHeadingDeg(engine!.getHeading());
        },
        onHover: (u, pos) => {
          setHover(u);
          setHoverPos(pos ?? null);
        },
        onSelect: (u) => {
          if (document.querySelector(".app.filters-open")) return;
          void pickUnit(u, engine);
        },
        onEmptyClick: () => {
          approachedRef.current = null;
          setSelected(null);
          engine?.resetView();
        },
        onReady: () => {
          const list = engine!.getUnits();
          setUnits(list);
          if (list.length) {
            setAreaMin(Math.min(...list.map((u) => u.surface)));
            setAreaMax(Math.max(...list.map((u) => u.surface)));
            setFloorMax(Math.max(...list.map((u) => u.floor)));
          }
          setReady(true);
          setHeadingDir(engine!.getHeadingDir());
          setHeadingDeg(engine!.getHeading());
        },
      }, tour);
      engineRef.current = engine;
      void engine.start().catch((err) => {
        console.error(err);
        setLoadPct(100);
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [tour]);

  useEffect(() => {
    engineRef.current?.setPanMode(panMode);
  }, [panMode, ready]);

  useEffect(() => {
    engineRef.current?.setInputLocked(scene360Open || scene360Closing);
  }, [scene360Open, scene360Closing, ready]);

  useEffect(() => {
    const syncFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    syncFs();
    document.addEventListener("fullscreenchange", syncFs);
    return () => document.removeEventListener("fullscreenchange", syncFs);
  }, []);

  useEffect(() => {
    engineRef.current?.setOverlayVisible(overlayOn);
  }, [overlayOn, ready]);

  const filtered = useMemo(() => {
    return units
      .filter((u) => u.surface <= areaMax && u.floor <= floorMax)
      .filter((u) => {
        const p = unitPrice(u);
        return p >= priceMin && p <= priceMax;
      })
      .filter((u) => status === "all" || u.status === status)
      .filter((u) => !selectedModels.length || selectedModels.includes(modelOf(u)))
      .filter((u) => !selectedRooms.length || selectedRooms.includes(u.rooms))
      .filter((u) => !favOnly || favs.includes(u.id) || leavingFavs.includes(u.id))
      .sort((a, b) => a.displayId.localeCompare(b.displayId, undefined, { numeric: true }));
  }, [units, areaMax, floorMax, priceMin, priceMax, status, selectedModels, selectedRooms, favOnly, favs, leavingFavs]);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setFilterIds(filtered.map((u) => u.id));
  }, [filtered, ready]);

  // Phone dock: only highlight the centered villa — do not rotate the aerial to face it.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || !ready) return;
    dockFacedIdRef.current = null;
    let timer: number | null = null;

    const syncPreviewUnit = () => {
      if (typeof window === "undefined") return;
      if (!isPhoneLayout()) return;
      if (scene360Strip || scene360Open || tourUnit) return;
      const mid = dock.scrollLeft + dock.clientWidth / 2;
      let bestId: string | null = null;
      let bestDist = Infinity;
      dock.querySelectorAll<HTMLElement>(".unit[data-unit-id]").forEach((el) => {
        const center = el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(center - mid);
        if (d < bestDist) {
          bestDist = d;
          bestId = el.dataset.unitId ?? null;
        }
      });
      if (!bestId || bestId === dockFacedIdRef.current) return;
      dockFacedIdRef.current = bestId;
      engineRef.current?.setPreview(bestId);
    };

    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(syncPreviewUnit, 140);
    };

    dock.addEventListener("scroll", onScroll, { passive: true });
    const boot = window.setTimeout(syncPreviewUnit, 80);
    return () => {
      dock.removeEventListener("scroll", onScroll);
      window.clearTimeout(boot);
      if (timer) window.clearTimeout(timer);
    };
  }, [ready, filtered, scene360Strip, scene360Open, tourUnit]);

  const favsRef = useRef(favs);
  favsRef.current = favs;
  const toggleFav = (id: string) => {
    const removing = favs.includes(id);
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("axis-favs", JSON.stringify(next));
      return next;
    });
    if (!favOnly) return;
    const pending = leaveTimers.current.get(id);
    if (pending) {
      window.clearTimeout(pending);
      leaveTimers.current.delete(id);
    }
    if (!removing) {
      setLeavingFavs((ids) => ids.filter((x) => x !== id));
      return;
    }
    // last liked card removed: once it has slid out, go back to all the cards
    const lastOne = favs.filter((x) => x !== id).length === 0;
    setLeavingFavs((ids) => (ids.includes(id) ? ids : [...ids, id]));
    leaveTimers.current.set(id, window.setTimeout(() => {
      leaveTimers.current.delete(id);
      setLeavingFavs((ids) => ids.filter((x) => x !== id));
      if (lastOne && favsRef.current.length === 0) setFavOnly(false);
    }, 480));
  };

  const bounds = useMemo(() => {
    if (!units.length) {
      return {
        areaMin: 100,
        areaMax: 300,
        priceMin: 100_000,
        priceMax: 600_000,
        floorMin: 1,
        floorMax: 5,
        rooms: [1, 2, 3, 4],
        models: [...UNIT_MODELS] as string[],
      };
    }
    const fmin = Math.min(...units.map((u) => u.floor));
    const fmax = Math.max(...units.map((u) => u.floor));
    const prices = units.map(unitPrice);
    const rooms = [...new Set(units.map((u) => u.rooms))].sort((a, b) => a - b);
    const models = [...new Set(units.map((u) => modelOf(u)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      areaMin: Math.min(...units.map((u) => u.surface)),
      areaMax: Math.max(...units.map((u) => u.surface)),
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      floorMin: fmin === fmax ? 1 : fmin,
      floorMax: fmin === fmax ? Math.max(5, fmax) : fmax,
      rooms,
      models,
    };
  }, [units]);

  useEffect(() => {
    if (!units.length) return;
    setPriceMin(bounds.priceMin);
    setPriceMax(bounds.priceMax);
  }, [units.length, bounds.priceMin, bounds.priceMax]);

  const statusCounts = useMemo(() => {
    const base = units.filter((u) => u.surface <= areaMax);
    return {
      available: base.filter((u) => u.status === "available").length,
      reserved: base.filter((u) => u.status === "reserved").length,
      sold: base.filter((u) => u.status === "sold").length,
    };
  }, [units, areaMax]);

  const resetFilters = () => {
    setAreaMin(bounds.areaMin);
    setAreaMax(bounds.areaMax);
    setPriceMin(bounds.priceMin);
    setPriceMax(bounds.priceMax);
    setFloorMax(bounds.floorMax);
    setStatus("all");
    setSelectedModels([]);
    setSelectedRooms([]);
  };

  const toggleRoom = (n: number) => {
    setSelectedRooms((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const toggleModel = (code: string) => {
    setSelectedModels((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  };

  const openProjectList = () => {
    setFormOpen(false);
    if (isPhoneLayout()) {
      setToolsOpen((v) => !v);
    } else {
      setListOpen(true);
    }
  };

  const closeFilters = () => {
    if (filtersClosingRef.current || !filtersOpen) return;
    filtersClosingRef.current = true;
    setFiltersClosing(true);
    filtersCloseTimer.current = window.setTimeout(() => {
      filtersCloseTimer.current = null;
      filtersClosingRef.current = false;
      setFiltersClosing(false);
      setFiltersOpen(false);
    }, 280);
  };

  const openFilters = () => {
    setFormOpen(false);
    if (filtersClosingRef.current) return;
    if (isPhoneLayout()) {
      if (filtersOpen) closeFilters();
      else setFiltersOpen(true);
      return;
    }
    setFiltersOpen(true);
    setListOpen(true);
  };

  const openScene360 = () => {
    setFiltersOpen(false);
    if (stripClosingRef.current) return;
    const phone = isPhoneLayout();
    if (scene360Strip) {
      stripClosingRef.current = true;
      setStripClosing(true);
      if (stripCloseTimer.current) window.clearTimeout(stripCloseTimer.current);
      stripCloseTimer.current = window.setTimeout(() => {
        stripCloseTimer.current = null;
        stripClosingRef.current = false;
        setStripClosing(false);
        setScene360Strip(false);
        setScene360Open(false);
        setActiveSceneId(null);
      }, 420);
      return;
    }
    if (phone) setListOpen(false);
    setScene360Open(false);
    setActiveSceneId(tour.scenes360[0]?.id ?? null);
    setScene360Strip(true);
    // Drop focus from the 360 button so arrow keys reach the strip handler.
    window.setTimeout(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      stripElRef.current?.focus({ preventScroll: true });
    }, 30);
  };

  const openScene360View = (id: string) => {
    if (stripDragRef.current) return;
    if (scene360CloseTimer.current) {
      window.clearTimeout(scene360CloseTimer.current);
      scene360CloseTimer.current = null;
    }
    scene360ClosingRef.current = false;
    setScene360Closing(false);
    setActiveSceneId(id);
    setScene360Open(true);
  };

  // PC side list of villa cards: same smooth drag-glide + eased wheel as the 360 strip.
  const unitsListCleanup = useRef<(() => void) | null>(null);
  const unitsListRef = useCallback((node: HTMLDivElement | null) => {
    unitsListCleanup.current?.();
    unitsListCleanup.current = node ? attachGlideScroll(node, "y") : null;
  }, []);

  const stripScrollCleanup = useRef<(() => void) | null>(null);
  const stripRef = useCallback((node: HTMLDivElement | null) => {
    stripScrollCleanup.current?.();
    stripScrollCleanup.current = null;
    stripElRef.current = node;
    if (!node) return;
    // Short glide after a drag: the strip keeps going a little in the drag direction, then eases to a stop.
    let coastRaf = 0;
    const stopCoast = () => {
      if (coastRaf) cancelAnimationFrame(coastRaf);
      coastRaf = 0;
    };
    const samples: { t: number; x: number }[] = [];
    const coast = (v0: number) => {
      stopCoast();
      let v = Math.max(-3, Math.min(3, v0)); // px per ms, capped so a hard flick stays a "little" push
      if (Math.abs(v) < 0.15) return;
      let last = performance.now();
      let pos = node.scrollLeft; // tracked as a float: scrollLeft rounds small steps away
      const max = node.scrollWidth - node.clientWidth;
      const step = (now: number) => {
        const dt = Math.min(40, now - last);
        last = now;
        pos = Math.max(0, Math.min(max, pos - v * dt));
        node.scrollLeft = pos;
        v *= Math.pow(0.9, dt / 16.67); // friction
        // stop when slow or when the strip hits an end
        if (Math.abs(v) < 0.02 || pos <= 0 || pos >= max) {
          coastRaf = 0;
          return;
        }
        coastRaf = requestAnimationFrame(step);
      };
      coastRaf = requestAnimationFrame(step);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      stopCoast();
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) && e.deltaX === 0) return;
      node.scrollLeft += e.deltaY + e.deltaX;
    };
    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let activePointer: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      stopCoast();
      samples.length = 0;
      samples.push({ t: performance.now(), x: e.clientX });
      tracking = true;
      dragging = false;
      stripDragRef.current = false;
      activePointer = e.pointerId;
      startX = e.clientX;
      startScroll = node.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!tracking || e.pointerId !== activePointer) return;
      const dx = e.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < 3) return;
        dragging = true;
        stripDragRef.current = true;
        node.setPointerCapture(e.pointerId);
        node.classList.add("is-dragging");
      }
      e.preventDefault();
      // 1:1 with the pointer while dragging; a short glide follows on release
      node.scrollLeft = startScroll - dx;
      const now = performance.now();
      samples.push({ t: now, x: e.clientX });
      while (samples.length > 2 && now - samples[0].t > 100) samples.shift();
    };
    const onUp = (e: PointerEvent) => {
      if (activePointer !== null && e.pointerId !== activePointer) return;
      tracking = false;
      activePointer = null;
      if (!dragging) return;
      dragging = false;
      node.classList.remove("is-dragging");
      // release speed over the last ~100 ms (0 if the pointer was held still before letting go)
      const now = performance.now();
      const first = samples[0];
      const lastS = samples[samples.length - 1];
      const held = !lastS || now - lastS.t > 80;
      const span = first && lastS ? lastS.t - first.t : 0;
      coast(held || span <= 0 ? 0 : (lastS.x - first.x) / span);
      window.setTimeout(() => {
        stripDragRef.current = false;
      }, 40);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onDown);
    node.addEventListener("pointermove", onMove, { passive: false });
    node.addEventListener("pointerup", onUp);
    node.addEventListener("pointercancel", onUp);
    stripScrollCleanup.current = () => {
      stopCoast();
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const closeScene360 = () => {
    // Keep the strip open so the user can pick another scene.
    if (!scene360Open || scene360ClosingRef.current) return;
    scene360ClosingRef.current = true;
    setScene360Closing(true);
    if (scene360CloseTimer.current) window.clearTimeout(scene360CloseTimer.current);
    scene360CloseTimer.current = window.setTimeout(() => {
      scene360CloseTimer.current = null;
      scene360ClosingRef.current = false;
      setScene360Closing(false);
      setScene360Open(false);
    }, 300);
  };

  const activeScene = tour.scenes360.find((s) => s.id === activeSceneId) || null;

  const scenes360Ref = useRef(tour.scenes360);
  const activeSceneIdRef = useRef(activeSceneId);
  scenes360Ref.current = tour.scenes360;
  activeSceneIdRef.current = activeSceneId;

  const stepScene360 = useCallback((dir: 1 | -1) => {
    const list = scenes360Ref.current;
    if (!list.length) return;
    const cur = Math.max(0, list.findIndex((s) => s.id === activeSceneIdRef.current));
    const next = (cur + dir + list.length) % list.length;
    const scene = list[next];
    if (!scene) return;
    setActiveSceneId(scene.id);
    requestAnimationFrame(() => {
      const strip = stripElRef.current;
      if (!strip) return;
      const thumb = strip.querySelector<HTMLElement>(`[data-scene-id="${scene.id}"]`);
      if (!thumb) {
        const step = Math.max(120, Math.round(strip.clientWidth * 0.55));
        strip.scrollBy({ left: dir * step, behavior: "smooth" });
        return;
      }
      const s = strip.getBoundingClientRect();
      const t = thumb.getBoundingClientRect();
      const delta = t.left + t.width / 2 - (s.left + s.width / 2);
      strip.scrollBy({ left: delta, behavior: "smooth" });
    });
  }, []);

  // Keyboard ← → switches 360 thumbs (strip open on first click, and full view).
  useEffect(() => {
    if (!scene360Strip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      const right = e.key === "ArrowRight" || e.code === "ArrowRight" || e.key === "Right";
      const left = e.key === "ArrowLeft" || e.code === "ArrowLeft" || e.key === "Left";
      if (!right && !left) return;
      if (!scenes360Ref.current.length) return;
      e.preventDefault();
      e.stopPropagation();
      stepScene360(right ? 1 : -1);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [scene360Strip, stepScene360]);

  const openUnit = (u: Unit) => {
    void pickUnit(u);
  };

  return (
    <div className={`app${toolsOpen ? " tools-on" : ""}${layoutReady ? " layout-ready" : ""}${filtersOpen || filtersClosing ? " filters-open" : ""}${scene360Strip ? " strip360-on" : ""}${scene360Open || scene360Closing ? " scene360-mode" : ""}${tourUnit ? " tour-open" : ""}`}>
      {introOpen && <IntroScreen
          ready={ready && villaHalfDone}
          loadPct={villaHasFrames ? loadPct * 0.5 + villaPct * 0.5 : loadPct}
          onEnter={onEnter}
        />}
      <aside className={`panel ${listOpen ? "open" : ""} ${formOpen ? "form-wide" : ""} ${filtersOpen ? "filters-on" : ""}`}>
        <button
          className="peek"
          type="button"
          onClick={() => {
            if (listOpen) closeFilters();
            setListOpen((v) => !v);
          }}
          aria-label={listOpen ? "Ranger la liste" : "Ouvrir la liste"}
        >
          {listOpen ? "‹" : "›"}
        </button>
        <div className={`panel-inner ${formOpen ? "form-mode" : ""}`}>
          {formOpen ? (
            <ContactSidebar
              unit={selected}
              favUnits={favs.map((id) => units.find((u) => u.id === id)?.displayId ?? id)}
              onBack={() => {
                setFormOpen(false);
                // Phone/tablet: leave the contact form for the map, not the unit list.
                if (isPhoneLayout()) setListOpen(false);
              }}
            />
          ) : (
            <>
          <header className="panel-brand">
            <div className="panel-brand-capsule">
              <span className="agency-logo panel-agency-logo">
                <img
                  src={tour.logoUrl || COMPLEX.logoPath}
                  alt=""
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback === "1") return;
                    img.dataset.fallback = "1";
                    img.src = COMPLEX.logoPath;
                  }}
                />
              </span>
              {tour.projectLogoUrl ? (
                <span className="panel-project-logo">
                  <img src={tour.projectLogoUrl} alt={tour.name} />
                </span>
              ) : (
                <div className="panel-brand-copy">
                  <b>أجياد سديم</b>
                  <span>خميس مشيط</span>
                </div>
              )}
            </div>
            <button type="button" className="panel-x" onClick={() => setListOpen(false)} aria-label="Close">×</button>
          </header>
          <div className="panel-toolbar">
            <div className="panel-actions-ring">
              <button
                type="button"
                className={`tool-fab heart-fab ${favOnly ? "on" : ""} ${heartPop ? "pop" : ""} ${heartNudge ? "nudge" : ""}`}
                onClick={() => {
                  if (!favOnly && favs.length === 0) {
                    if (heartNudgeTimer.current) window.clearTimeout(heartNudgeTimer.current);
                    setHeartNudge(false);
                    window.requestAnimationFrame(() => setHeartNudge(true));
                    heartNudgeTimer.current = window.setTimeout(() => setHeartNudge(false), 1200);
                    return;
                  }
                  leaveTimers.current.forEach((t) => window.clearTimeout(t));
                  leaveTimers.current.clear();
                  setLeavingFavs([]);
                  setFavOnly((v) => !v);
                  setHeartPop(false);
                  window.requestAnimationFrame(() => setHeartPop(true));
                  if (listMotionTimer.current) window.clearTimeout(listMotionTimer.current);
                  setListMotion(true);
                  listMotionTimer.current = window.setTimeout(() => setListMotion(false), 420);
                }}
                onAnimationEnd={(e) => {
                  if (e.animationName === "heart-pop") setHeartPop(false);
                }}
                title="Favorites"
                aria-label="Favorites"
              >
                <span className="heart-glyph">
                  <IconHeart size={20} filled={favOnly} />
                </span>
                {favs.length > 0 ? (
                  <span className="fav-count">{favs.length}</span>
                ) : heartNudge ? (
                  <span className="fav-count fav-zero" aria-live="polite">0</span>
                ) : null}
              </button>
              <button type="button" className={`tool-fab filter-fab ${filtersOpen ? "on" : ""}`} onClick={() => { if (filtersOpen) closeFilters(); else setFiltersOpen(true); }} title="Filters" aria-label="Filters" aria-pressed={filtersOpen}>
                <IconFilters size={19} filled={filtersOpen} />
              </button>
            </div>
          </div>
          <div ref={unitsListRef} className={`units cards${listMotion ? " fav-swap" : ""}`}>
            {filtered.map((u) => {
              const photo = cardPhoto(tour, u);
              const liked = favs.includes(u.id);
              const price = sarParts(unitPrice(u));
              return (
              <button
                key={u.id}
                type="button"
                className={`unit ${selected?.id === u.id ? "sel" : ""} ${leavingFavs.includes(u.id) ? "leaving" : ""}`}
                onClick={() => openUnit(u)}
                onMouseEnter={() => engineRef.current?.setPreview(u.id)}
                onMouseLeave={() => engineRef.current?.setPreview(null)}
              >
                <div className="card-side">
                  {photo ? <img src={photo} alt="" /> : <span className="card-img-fallback" />}
                  <span
                    className={liked ? "heart on" : "heart"}
                    onClick={(e) => { e.stopPropagation(); toggleFav(u.id); }}
                  >
                    <IconHeart size={12} filled={liked} />
                  </span>
                </div>
                <div className="card-copy">
                  <div className="card-availability">
                    <div className="card-identity">
                      <strong>{u.displayId}</strong>
                      <span className="card-price" dir="ltr" lang="en">
                        <span className="sar-cur">{price.currency}</span>
                        <span className="sar-num">{price.amount}</span>
                      </span>
                    </div>
                    <em className={`badge ${u.status}`}>{STATUS_AR[u.status]}</em>
                  </div>
                  <div className="card-divider" aria-hidden="true" />
                  <div className="card-specs">
                    <span className="spec-rooms"><b>{u.rooms}</b><small>غرف النوم</small></span>
                    <span className="spec-area"><b>{u.surface}</b><small>المساحة</small></span>
                    <span className="spec-floor"><b>{u.floor}</b><small>الطوابق</small></span>
                  </div>
                </div>
              </button>
              );
            })}
          </div>
            </>
          )}
        </div>
      </aside>

      {(filtersOpen || filtersClosing) && !scene360Open && (
        <div className={`filters-flyout${filtersClosing ? " closing" : ""}`} dir="rtl" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <header className="filters-head">
            <h2 className="filter-title">
              <span className="filter-title-icon" aria-hidden>
                <IconFilters size={19} />
              </span>
              <span className="filter-title-text">تصفية النتائج</span>
            </h2>
            <button type="button" className="filters-back" onClick={closeFilters} aria-label="Close filters">
              <IconClose size={19} strokeWidth={1.83} />
            </button>
          </header>
          <div className="filters filters-rich">
            <section className="payment-schedule">
              <h3 className="payment-label">حالة الوحدة</h3>
              <div className="status-pills payment-options">
                <button
                  type="button"
                  className={`status-pill payment-option all ${status === "all" ? "on" : ""}`}
                  onClick={() => setStatus("all")}
                >
                  <span className="status-label">كل الوحدات</span>
                </button>
                {(["available", "reserved", "sold"] as UnitStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`status-pill payment-option ${s} ${status === s ? "on" : ""}`}
                    onClick={() => setStatus(s)}
                  >
                    <span className="status-label">{STATUS_AR[s]}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="filter-area range-filter area-range">
              <div className="filter-area-head range-labels">
                <h3 className="area-label">المساحة</h3>
                <em className="range-readout area-readout" dir="ltr">
                  {Math.round(areaMax).toLocaleString("en-US")}
                </em>
              </div>
              <label className="range-single range-slider" dir="rtl">
                <span className="sr-only">Max area</span>
                <input
                  type="range"
                  min={bounds.areaMin}
                  max={Math.max(bounds.areaMax, bounds.areaMin + 1)}
                  step={1}
                  value={Math.min(areaMax, Math.max(bounds.areaMax, bounds.areaMin + 1))}
                  onInput={(e) => setAreaMax(Number((e.target as HTMLInputElement).value))}
                  onChange={(e) => setAreaMax(Number(e.target.value))}
                  style={{
                    ["--range-fill" as string]: `${
                      ((Math.min(areaMax, Math.max(bounds.areaMax, bounds.areaMin + 1)) - bounds.areaMin) /
                        Math.max(1, Math.max(bounds.areaMax, bounds.areaMin + 1) - bounds.areaMin)) *
                      100
                    }%`,
                  }}
                />
              </label>
            </section>
            <section className="filter-area range-filter price-range">
              <div className="filter-area-head range-labels">
                <h3 className="price-label">السعر</h3>
                <em className="range-readout price-readout" dir="ltr">
                  <span className="sar-cur">ر.س</span>
                  <span className="sar-num">{Math.round(priceMax).toLocaleString("en-US")}</span>
                </em>
              </div>
              <label className="range-single range-slider" dir="rtl">
                <span className="sr-only">Max price</span>
                <input
                  type="range"
                  min={bounds.priceMin}
                  max={Math.max(bounds.priceMax, bounds.priceMin + 1)}
                  step={1000}
                  value={Math.min(priceMax, Math.max(bounds.priceMax, bounds.priceMin + 1))}
                  onInput={(e) => setPriceMax(Number((e.target as HTMLInputElement).value))}
                  onChange={(e) => setPriceMax(Number(e.target.value))}
                  style={{
                    ["--range-fill" as string]: `${
                      ((Math.min(priceMax, Math.max(bounds.priceMax, bounds.priceMin + 1)) - bounds.priceMin) /
                        Math.max(1, Math.max(bounds.priceMax, bounds.priceMin + 1) - bounds.priceMin)) *
                      100
                    }%`,
                  }}
                />
              </label>
            </section>
            <section className="room-filter">
              <h3>عدد الغرف</h3>
              <div className="chip-row room-choices">
                <button
                  type="button"
                  className={`filter-chip filter-choice ${selectedRooms.length === 0 ? "on" : ""}`}
                  onClick={() => setSelectedRooms([])}
                >
                  الكل
                </button>
                {bounds.rooms.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`filter-chip filter-choice ${selectedRooms.includes(n) ? "on" : ""}`}
                    onClick={() => toggleRoom(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>
            <section className="model-filter phase-filter">
              <h3>النموذج</h3>
              <div className="chip-row phase-choices">
                {bounds.models.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`filter-chip filter-choice ${selectedModels.includes(code) ? "on" : ""}`}
                    onClick={() => toggleModel(code)}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </section>
            <button type="button" className="filters-reset-btn" onClick={resetFilters}>
              <span className="filters-reset-label">إعادة تعيين</span>
            </button>
          </div>
        </div>
      )}

      <div className="stage" ref={stageRef}>
        <canvas ref={bgRef} className="layer bg" />
        <canvas ref={bgNextRef} className="layer bg-next" />
        <canvas ref={threeRef} className="layer webgl" />

        {hover && hoverPos && !tourUnit && !scene360Open && (
          // the same card as in the side list, just smaller
          <div className="tip follow tip-card" style={{ left: hoverPos.x, top: hoverPos.y }}>
            <MiniUnitCard unit={hover} photo={cardPhoto(tour, hover)} liked={favs.includes(hover.id)} />
          </div>
        )}
        {selected && !hover && !tourUnit && !scene360Open && approachedRef.current === selected.id && (
          <div className="tip">
            {mediaSrc(tourPlanUrl(tour, selected)) ? <img src={tourPlanUrl(tour, selected)} alt="" /> : null}
            <div>
              <div className="tip-head">
                <b>{selected.displayId}</b>
                <small className={selected.status}>{STATUS_LABEL[selected.status]}</small>
              </div>
              <em className="hint">Click again to enter · انقر مرة أخرى للدخول</em>
            </div>
          </div>
        )}

        {!scene360Open && (
          <header className="phone-top" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="phone-top-bar">
              <div className="compact-logo" title={tour.name} aria-hidden>
                <span className="agency-logo compact-agency-logo">
                  <img
                    src={tour.logoUrl || COMPLEX.logoPath}
                    alt=""
                    draggable={false}
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.dataset.fallback === "1") return;
                      img.dataset.fallback = "1";
                      img.src = COMPLEX.logoPath;
                    }}
                  />
                </span>
              </div>
              <div className="compact-project">
                {tour.projectLogoUrl ? (
                  <img src={tour.projectLogoUrl} alt={tour.name} className="compact-project-logo" />
                ) : (
                  <b className="compact-project-name">{tour.name}</b>
                )}
              </div>
            </div>
            {!filtersOpen && (
              <button
                type="button"
                className="compact-filter"
                title="Filters"
                onClick={openFilters}
              >
                <IconFilters size={17} />
              </button>
            )}
          </header>
        )}

        <nav className={`rail${scene360Open ? " is-hidden" : ""}`} aria-label="Tools" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <div className="rail-stack">
            <button
              type="button"
              className={`rail-fab project-toggle open${toolsOpen ? " is-expanded" : ""}`}
              onClick={openProjectList}
              title="مشروع"
            >
              <span className="rail-name">مشروع</span>
              <span className="rail-ico project">
                <IconApps size={22} />
                <span className="rail-hint" aria-hidden>
                  <i />
                  <i />
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`rail-fab${formOpen && listOpen ? " is-active" : ""}`}
              aria-pressed={formOpen && listOpen}
              onClick={() => {
                // second click closes the form: the cards come back (phone: back to the map, like the form's back arrow)
                if (formOpen && listOpen) {
                  setFormOpen(false);
                  if (isPhoneLayout()) setListOpen(false);
                  return;
                }
                setFormOpen(true);
                setListOpen(true);
              }}
            >
              <span className="rail-name">تواصل</span>
              <span className="rail-ico glass"><IconMail size={20} /></span>
            </button>
            <button type="button" className="rail-fab" onClick={() => {
              if (isPhoneLayout()) closeFilters();
              setGalleryOpen(true);
            }}>
              <span className="rail-name">المعرض</span>
              <span className="rail-ico glass"><IconGallery size={20} /></span>
            </button>
            <button type="button" className="rail-fab" onClick={() => {
              if (isPhoneLayout()) closeFilters();
              setLocationOpen(true);
            }}>
              <span className="rail-name">الموقع</span>
              <span className="rail-ico glass"><IconPin size={20} /></span>
            </button>
            <button type="button" className="rail-fab" onClick={() => {
              if (isPhoneLayout()) closeFilters();
              setHelpOpen(true);
            }}>
              <span className="rail-name">مساعدة</span>
              <span className="rail-ico glass"><IconHelp size={20} /></span>
            </button>
          </div>
        </nav>

        {!scene360Open && !tourUnit && (
          <div
            className={`hud${scene360Strip ? " strip360-on" : ""}`}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {scene360Strip && (
              <div className={`scene360-strip-dock open${stripClosing ? " closing" : ""}`}>
                <div
                  className="scene360-strip"
                  role="list"
                  dir="ltr"
                  ref={stripRef}
                  tabIndex={0}
                  aria-label="360 scenes"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      stepScene360(e.key === "ArrowRight" ? 1 : -1);
                    }
                  }}
                >
                  {tour.scenes360.length ? (
                    tour.scenes360.map((scene) => (
                      <button
                        key={scene.id}
                        type="button"
                        role="listitem"
                        data-scene-id={scene.id}
                        className={`scene360-thumb${activeScene?.id === scene.id ? " on" : ""}`}
                        onClick={() => openScene360View(scene.id)}
                        aria-label={scene.label || "360 scene"}
                      >
                        <img src={scene.thumbUrl || scene.url} alt="" draggable={false} />
                      </button>
                    ))
                  ) : (
                    <p className="scene360-strip-empty">360 scenes will appear here once uploaded in admin.</p>
                  )}
                </div>
              </div>
            )}
            <button
              type="button"
              className={`hud-360${scene360Strip ? " is-back" : ""}`}
              title={scene360Strip ? "Retour" : "360"}
              onClick={openScene360}
              aria-label={scene360Strip ? "Close 360 scenes" : "Open 360 scenes"}
            >
              {scene360Strip ? <IconChevronDown size={22} /> : <Icon360 size={40} />}
            </button>
            <div className="hud-tools">
              <button
                type="button"
                className={isFullscreen ? "on" : ""}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen?.();
                  else void document.documentElement.requestFullscreen?.();
                }}
              >
                {isFullscreen ? <IconFullscreenExit size={17} /> : <IconFullscreen size={17} />}
              </button>
              <button
                type="button"
                className={`hud-eye-in-tools ${overlayOn ? "on" : ""}`}
                title="Show units"
                onClick={() => {
                  const v = !overlayOn;
                  setOverlayOn(v);
                  engineRef.current?.setOverlayVisible(v);
                }}
              >
                {overlayOn ? <IconEye size={17} /> : <IconEyeOff size={17} />}
              </button>
              <span className="hud-sep" aria-hidden />
              <button
                type="button"
                className={panMode ? "on" : ""}
                title="Pan"
                onClick={() => {
                  const v = !panMode;
                  setPanMode(v);
                  engineRef.current?.setPanMode(v);
                }}
              >
                {panMode ? <IconPanClosed size={17} /> : <IconPan size={17} />}
              </button>
              <button
                type="button"
                title="Zoom out"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                  engineRef.current?.zoomBy(-COMPLEX.zoomStep);
                  if (zoomHoldRef.current) window.clearInterval(zoomHoldRef.current);
                  zoomHoldRef.current = window.setInterval(() => engineRef.current?.zoomBy(-COMPLEX.zoomStep), 90);
                }}
                onPointerUp={() => { if (zoomHoldRef.current) { window.clearInterval(zoomHoldRef.current); zoomHoldRef.current = null; } }}
                onPointerCancel={() => { if (zoomHoldRef.current) { window.clearInterval(zoomHoldRef.current); zoomHoldRef.current = null; } }}
              >
                <IconMinus size={17} />
              </button>
              <button
                type="button"
                title="Zoom in"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                  engineRef.current?.zoomBy(COMPLEX.zoomStep);
                  if (zoomHoldRef.current) window.clearInterval(zoomHoldRef.current);
                  zoomHoldRef.current = window.setInterval(() => engineRef.current?.zoomBy(COMPLEX.zoomStep), 90);
                }}
                onPointerUp={() => { if (zoomHoldRef.current) { window.clearInterval(zoomHoldRef.current); zoomHoldRef.current = null; } }}
                onPointerCancel={() => { if (zoomHoldRef.current) { window.clearInterval(zoomHoldRef.current); zoomHoldRef.current = null; } }}
              >
                <IconPlus size={17} />
              </button>
            </div>
            <div className="hud-compass-row">
              <button
                type="button"
                className={`hud-eye hud-eye-solo ${overlayOn ? "on" : ""}`}
                title="Show units"
                onClick={() => {
                  const v = !overlayOn;
                  setOverlayOn(v);
                  engineRef.current?.setOverlayVisible(v);
                }}
              >
                {overlayOn ? <IconEye size={17} /> : <IconEyeOff size={17} />}
              </button>
              <div className="hud-nav">
                <button
                  type="button"
                  className="nav-btn"
                  title="Rotate left"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                    engineRef.current?.rotateBy(-1);
                    if (rotateHoldRef.current) window.clearInterval(rotateHoldRef.current);
                    rotateHoldRef.current = window.setInterval(() => engineRef.current?.rotateBy(-1), 70);
                  }}
                  onPointerUp={() => { if (rotateHoldRef.current) { window.clearInterval(rotateHoldRef.current); rotateHoldRef.current = null; } }}
                  onPointerCancel={() => { if (rotateHoldRef.current) { window.clearInterval(rotateHoldRef.current); rotateHoldRef.current = null; } }}
                ><IconTriL size={14} /></button>
                <div className="compass-wrap">
                  <button type="button" className="nav-compass" title="Compass" onClick={() => engineRef.current?.rotateToNextCardinal()}>
                    <span className="compass-needle" style={{ transform: `rotate(${headingDeg}deg)` }} />
                    <b>{headingDir}</b>
                  </button>
                </div>
                <button
                  type="button"
                  className="nav-btn"
                  title="Rotate right"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                    engineRef.current?.rotateBy(1);
                    if (rotateHoldRef.current) window.clearInterval(rotateHoldRef.current);
                    rotateHoldRef.current = window.setInterval(() => engineRef.current?.rotateBy(1), 70);
                  }}
                  onPointerUp={() => { if (rotateHoldRef.current) { window.clearInterval(rotateHoldRef.current); rotateHoldRef.current = null; } }}
                  onPointerCancel={() => { if (rotateHoldRef.current) { window.clearInterval(rotateHoldRef.current); rotateHoldRef.current = null; } }}
                ><IconTriR size={14} /></button>
              </div>
            </div>
          </div>
        )}

        {(scene360Open || scene360Closing) && (
          <div
            className={`scene360-overlay${scene360Closing ? " closing" : ""}`}
            aria-hidden={scene360Closing}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="scene360-back"
              onClick={closeScene360}
              title="Retour"
              aria-label="Retour au tour"
              disabled={scene360Closing}
            >
              <IconBack size={22} />
            </button>
            {activeScene?.url ? (
              <div
                className="scene360-view"
                aria-live="polite"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <PanoramaViewer key={activeScene.id} src={activeScene.url} className="scene360-pano" />
                {activeScene.label ? <span className="scene360-view-label">{activeScene.label}</span> : null}
              </div>
            ) : (
              <div className="scene360-empty">
                <p>360 scenes will appear here once uploaded in admin.</p>
              </div>
            )}
            <div className="scene360-bar" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
              <div
                className="scene360-strip"
                role="list"
                dir="ltr"
                ref={stripRef}
                tabIndex={0}
                aria-label="360 scenes"
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    stepScene360(e.key === "ArrowRight" ? 1 : -1);
                  }
                }}
              >
                {tour.scenes360.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    role="listitem"
                    data-scene-id={scene.id}
                    className={`scene360-thumb${activeScene?.id === scene.id ? " on" : ""}`}
                    onClick={() => {
                      if (stripDragRef.current || scene360Closing) return;
                      setActiveSceneId(scene.id);
                    }}
                    aria-label={scene.label || "360 scene"}
                  >
                    <img src={scene.thumbUrl || scene.url} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        ref={dockRef}
        className={`dock units cards${(scene360Strip && !stripClosing) || scene360Open || scene360Closing ? " tuck" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        aria-hidden={(scene360Strip && !stripClosing) || scene360Open || scene360Closing}
      >
        {filtered.map((u) => {
          const photo = cardPhoto(tour, u);
          const liked = favs.includes(u.id);
          const price = sarParts(unitPrice(u));
          return (
            <button
              key={u.id}
              type="button"
              data-unit-id={u.id}
              className={`unit ${selected?.id === u.id ? "sel" : ""} ${leavingFavs.includes(u.id) ? "leaving" : ""}`}
              onMouseEnter={() => engineRef.current?.setPreview(u.id)}
              onMouseLeave={() => engineRef.current?.setPreview(null)}
              onClick={() => openUnit(u)}
              tabIndex={(scene360Strip && !stripClosing) || scene360Open || scene360Closing ? -1 : 0}
            >
              <div className="card-side">
                {photo ? <img src={photo} alt="" /> : <span className="card-img-fallback" />}
                <span
                  className={liked ? "heart on" : "heart"}
                  onClick={(e) => { e.stopPropagation(); toggleFav(u.id); }}
                >
                  <IconHeart size={12} filled={liked} />
                </span>
              </div>
              <div className="card-copy">
                <div className="card-availability">
                  <div className="card-identity">
                    <strong>{u.displayId}</strong>
                    <span className="card-price" dir="ltr" lang="en">
                      <span className="sar-cur">{price.currency}</span>
                      <span className="sar-num">{price.amount}</span>
                    </span>
                  </div>
                  <em className={`badge ${u.status}`}>{STATUS_AR[u.status]}</em>
                </div>
                <div className="card-divider" aria-hidden="true" />
                <div className="card-specs">
                  <span className="spec-rooms"><b>{u.rooms}</b><small>غرف النوم</small></span>
                  <span className="spec-area"><b>{u.surface}</b><small>المساحة</small></span>
                  <span className="spec-floor"><b>{u.floor}</b><small>الطوابق</small></span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {helpOpen && <HelpPage tour={tour} onClose={() => setHelpOpen(false)} />}
      {locationOpen && <LocationPage tour={tour} onClose={() => setLocationOpen(false)} />}
      {galleryOpen && <GalleryPage tour={tour} onClose={() => setGalleryOpen(false)} />}
      {tourUnit && (
        <VillaTour
          unit={tourUnit}
          liked={favs.includes(tourUnit.id)}
          onToggleFav={() => toggleFav(tourUnit.id)}
          onClose={() => {
            setTourUnit(null);
            setSelected(null);
            approachedRef.current = null;
            engineRef.current?.resetView();
          }}
        />
      )}
    </div>
  );
}

/** Read-only copy of the side-list card (used for the hover card over a house). */
function MiniUnitCard({ unit, photo, liked }: { unit: Unit; photo: string; liked: boolean }) {
  const price = sarParts(unitPrice(unit));
  return (
    <div className="units cards">
      <div className="unit">
        <div className="card-side">
          {photo ? <img src={photo} alt="" /> : <span className="card-img-fallback" />}
          <span className={liked ? "heart on" : "heart"}>
            <IconHeart size={12} filled={liked} />
          </span>
        </div>
        <div className="card-copy">
          <div className="card-availability">
            <div className="card-identity">
              <strong>{unit.displayId}</strong>
              <span className="card-price" dir="ltr" lang="en">
                <span className="sar-cur">{price.currency}</span>
                <span className="sar-num">{price.amount}</span>
              </span>
            </div>
            <em className={`badge ${unit.status}`}>{STATUS_AR[unit.status]}</em>
          </div>
          <div className="card-divider" aria-hidden="true" />
          <div className="card-specs">
            <span className="spec-rooms"><b>{unit.rooms}</b><small>غرف النوم</small></span>
            <span className="spec-area"><b>{unit.surface}</b><small>المساحة</small></span>
            <span className="spec-floor"><b>{unit.floor}</b><small>الطوابق</small></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactSidebar({ unit, favUnits, onBack }: { unit: Unit | null; favUnits: string[]; onBack: () => void }) {
  const tour = useTour();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [gender, setGender] = useState("");
  const [fieldErr, setFieldErr] = useState<Partial<Record<ContactIssue, string>>>({});
  const issueCount = Object.keys(fieldErr).length;

  const clearIssue = (key: ContactIssue) => {
    setFieldErr((cur) => {
      if (!cur[key]) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const nom = String(fd.get("nom") || "").trim();
    const prenom = String(fd.get("prenom") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const telRaw = String(fd.get("tel") || "").trim();
    const problems = contactIssues({ gender, nom, prenom, email, tel: telRaw });
    setFieldErr(problems);
    if (Object.keys(problems).length) {
      const form = e.currentTarget;
      requestAnimationFrame(() => {
        form.querySelector(".bad, .field-msg")?.scrollIntoView({ block: "nearest" });
      });
      return;
    }
    const payload = {
      nom,
      prenom,
      email,
      tel: telFromForm(fd),
      gender,
      subject: String(fd.get("subject") || "").trim(),
      message: String(fd.get("message") || "").trim(),
      toFavorites: fd.get("favorites") === "on" && favUnits.length > 0,
      favoriteUnits: fd.get("favorites") === "on" ? favUnits : [],
      unitId: unit?.id ?? null,
      unitDisplayId: unit?.displayId ?? null,
      complex: tour.slug,
    };
    setBusy(true);
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setOk(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="contact-side" dir="rtl">
      <header className="contact-top">
        <div className="contact-titles">
          <h2>تواصل معنا</h2>
          <p>نحن سعداء بالتواصل معك</p>
        </div>
        <button type="button" className="contact-back" onClick={onBack} aria-label="رجوع">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.2" aria-hidden>
            <path d="M15 6 9 12l6 6" />
          </svg>
        </button>
      </header>
      <div className="contact-info">
        <img src={tour.logoUrl || COMPLEX.logoPath} alt="" className="contact-logo" />
        <div className="contact-lines">
          <span className="contact-ico" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          </span>
          <b>{tour.name}</b>
          <span className="contact-ico" aria-hidden>
            <svg width="16" height="12" viewBox="0 0 20 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="1.5" width="18" height="12" rx="2" /><path d="m1.5 2.5 8.5 6.5 8.5-6.5" /></svg>
          </span>
          <a href={`mailto:${COMPLEX.contactEmail}`}>{COMPLEX.contactEmail}</a>
          <span className="contact-ico" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </span>
          <a href={`tel:${COMPLEX.contactTel}`} className="contact-tel">+966 57 555 5782</a>
        </div>
      </div>
      <form className="lead side" noValidate onSubmit={submit}>
        <p className="contact-ask">تحديد نوع الاستفسار</p>
        <div className={`contact-genders${fieldErr.gender ? " bad" : ""}`}>
          {["السيدة", "السيد", "لا"].map((g) => (
            <button key={g} type="button" className={gender === g ? "on" : ""} onClick={() => { setGender(g); clearIssue("gender"); }}>{g}</button>
          ))}
        </div>
        {fieldErr.gender && <p className="field-msg"><FieldMark />{fieldErr.gender}</p>}
        <label className={fieldErr.nom ? "bad" : ""}>
          اسم العائلة
          <input name="nom" autoComplete="family-name" placeholder="أدخل اسم العائلة" aria-invalid={fieldErr.nom ? true : undefined} onInput={() => clearIssue("nom")} />
          {fieldErr.nom && <span className="field-msg"><FieldMark />{fieldErr.nom}</span>}
        </label>
        <label className={fieldErr.prenom ? "bad" : ""}>
          الاسم الأول
          <input name="prenom" autoComplete="given-name" placeholder="أدخل الاسم الأول" aria-invalid={fieldErr.prenom ? true : undefined} onInput={() => clearIssue("prenom")} />
          {fieldErr.prenom && <span className="field-msg"><FieldMark />{fieldErr.prenom}</span>}
        </label>
        <label className={fieldErr.email ? "bad" : ""}>
          البريد الإلكتروني
          <input name="email" type="email" autoComplete="email" placeholder="أدخل بريدك الإلكتروني" aria-invalid={fieldErr.email ? true : undefined} onInput={() => clearIssue("email")} />
          {fieldErr.email && <span className="field-msg"><FieldMark />{fieldErr.email}</span>}
        </label>
        <label className={fieldErr.tel ? "bad" : ""} onInput={() => clearIssue("tel")}>
          رقم الهاتف
          <PhoneField placeholder="أدخل رقم هاتفك" />
          {fieldErr.tel && <span className="field-msg"><FieldMark />{fieldErr.tel}</span>}
        </label>
        <label>هل لديك رسالة لنا؟
          <textarea name="message" placeholder="اكتب رسالتك هنا..." aria-label="هل لديك رسالة لنا؟" />
        </label>
        <label className={`lead-check${favUnits.length ? "" : " is-off"}`}>
          <input type="checkbox" name="favorites" disabled={!favUnits.length} />
          <span>
            {favUnits.length
              ? `أرسل الفيلات التي أعجبتك (${favUnits.length})`
              : "أرسل الفيلات التي أعجبتك"}
          </span>
        </label>
        {issueCount > 0 && <p className="form-alert"><FieldMark />{issueCountLine(issueCount)}</p>}
        {err && <p className="err">{err}</p>}
        {ok ? <p className="ok">تم الإرسال. سنتواصل معك قريباً.</p> : <button type="submit" disabled={busy}>{busy ? "…" : "إرسال طلبك"}</button>}
      </form>
    </div>
  );
}

function Spin360({ type, folder }: { type: number; folder: string }) {
  const tour = useTour();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  const loadingSet = useRef(new Set<number>());
  const dragging = useRef(false);
  const startX = useRef(0);
  const n = tour.villaFrames;
  // open on the front door side
  const frontFrame = n ? Math.min(n - 1, COMPLEX.villa360.frontFrame ?? 0) : 0;
  // pos = total frames turned (never wraps); idx = which of the n frames is shown.
  // The compass needle follows pos, so it always turns the same way as the click,
  // even after one or more full turns.
  const [pos, setPos] = useState(frontFrame);
  const idx = n > 0 ? ((pos % n) + n) % n : 0;
  const [loading, setLoading] = useState(true);
  const shownType = useRef(type);
  const floorCfg = COMPLEX.villa360.floors.find((f) => f.subfolder.toLowerCase() === folder.toLowerCase());
  const frameOffset = floorCfg?.frameOffset ?? 0;
  // per-floor camera correction (Final is rendered slightly further / higher)
  const viewFix = useRef({ zoom: 1, shiftX: 0, shiftY: 0, rotate: 0, pivotY: 0.5 });
  viewFix.current = {
    zoom: floorCfg?.zoom ?? 1,
    shiftX: floorCfg?.shiftX ?? 0,
    shiftY: floorCfg?.shiftY ?? 0,
    rotate: floorCfg?.rotate ?? 0,
    pivotY: floorCfg?.pivotY ?? 0.5,
  };

  const draw = useCallback((i: number) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const img = images.current[i];
    if (!canvas || !wrap || !img?.complete || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    if (wrap.clientWidth < 2 || wrap.clientHeight < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#E8EDF2";
    ctx.fillRect(0, 0, w, h);
    const { zoom, shiftX, shiftY, rotate, pivotY } = viewFix.current;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    // never shift so far that an empty band shows at the top
    const dy = Math.min(dh * shiftY, Math.max(0, (dh - h) / 2));
    const x = (w - dw) / 2;
    const y = (h - dh) / 2 + dy;
    if (!rotate) {
      ctx.drawImage(img, x, y, dw, dh);
    } else {
      // the unrotated frame underneath fills the small corners the rotated one leaves uncovered
      ctx.drawImage(img, x, y, dw, dh);
      const px = x + dw / 2;
      const py = y + dh * pivotY;
      ctx.save();
      ctx.translate(px + dw * shiftX, py);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.translate(-px, -py);
      ctx.drawImage(img, x, y, dw, dh);
      ctx.restore();
    }
  }, []);

  const idxRef = useRef(frontFrame);
  idxRef.current = idx;

  // bumped on every floor / villa change so late loads from the previous set are ignored
  const generation = useRef(0);
  const pending = useRef(new Map<number, Promise<void>>());

  /** Load one frame; resolves once it is ready (or failed). */
  const ensureFrame = useCallback((i: number): Promise<void> => {
    if (!n) return Promise.resolve();
    const index = ((i % n) + n) % n;
    const existing = images.current[index];
    if (existing?.complete && existing.naturalWidth) {
      if (idxRef.current === index) {
        setLoading(false);
        draw(index);
      }
      return Promise.resolve();
    }
    const inFlight = pending.current.get(index);
    if (inFlight) return inFlight;
    // images[] is indexed by viewing angle; some floors were rendered starting a few frames later
    const src = tourVillaUrl(tour, type, folder, (index + frameOffset) % n);
    if (!src) return Promise.resolve();
    const gen = generation.current;
    loadingSet.current.add(index);
    // reuse the frame preloaded at startup when there is one
    const cached = villaImgCache.get(src);
    const cachedOk = cached && !(cached.complete && !cached.naturalWidth); // skip a frame that failed at startup
    const img = existing ?? (cachedOk ? cached : new Image());
    images.current[index] = img;
    img.decoding = "async";
    let done!: () => void;
    const promise = new Promise<void>((resolve) => (done = resolve));
    pending.current.set(index, promise);
    const finish = (ok: boolean) => {
      done();
      if (gen !== generation.current) return; // floor changed meanwhile
      pending.current.delete(index);
      loadingSet.current.delete(index);
      if (idxRef.current !== index) return;
      if (ok) {
        setLoading(false);
        draw(index);
      } else {
        setLoading(false);
      }
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    if (img.src !== src) img.src = src;
    else if (img.complete && img.naturalWidth) finish(true);
    return promise;
  }, [n, tour, type, folder, draw, frameOffset]);

  const warmAround = useCallback((center: number) => {
    if (!n) return;
    ensureFrame(center);
    for (let d = 1; d <= 4; d++) {
      ensureFrame(center + d);
      ensureFrame(center - d);
    }
  }, [n, ensureFrame]);

  useEffect(() => {
    generation.current += 1;
    images.current = [];
    loadingSet.current = new Set();
    pending.current = new Map();
    // new floor: stay on the same side; new villa type: back to the front door
    const start = shownType.current === type ? idxRef.current : frontFrame;
    shownType.current = type;
    idxRef.current = start;
    setPos((p) => {
      const cur = n > 0 ? ((p % n) + n) % n : 0;
      return p - cur + start;
    });
    setLoading(true);
    warmAround(start);
    // Background: load every frame of this floor, nearest to the current view first,
    // a few at a time so the frames you turn to next always come before far ones.
    let stopped = false;
    const queue: number[] = [];
    for (let d = 5; d <= Math.ceil(n / 2); d++) queue.push(start + d, start - d);
    const worker = async () => {
      while (!stopped && queue.length) {
        // re-sort by distance to where the user is looking now
        const at = idxRef.current;
        const dist = (i: number) => {
          const k = (((i - at) % n) + n) % n;
          return Math.min(k, n - k);
        };
        queue.sort((a, b) => dist(a) - dist(b));
        await ensureFrame(queue.shift()!);
      }
    };
    for (let w = 0; w < 4; w++) void worker();
    const onResize = () => draw(idxRef.current);
    window.addEventListener("resize", onResize);
    const wrap = wrapRef.current;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && wrap) {
      ro = new ResizeObserver(() => {
        // Double rAF: wait until sheet/layout height has settled before redraw.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => draw(idxRef.current));
        });
      });
      ro.observe(wrap);
    }
    return () => {
      stopped = true;
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [type, folder, tour, warmAround, draw, frontFrame, ensureFrame, n]);

  useEffect(() => {
    warmAround(idx);
    const img = images.current[idx];
    if (img?.complete && img.naturalWidth) {
      setLoading(false);
      draw(idx);
    } else {
      setLoading(true);
    }
  }, [idx, warmAround, draw]);

  const spin = (dir: 1 | -1) => { if (n > 0) setPos((p) => p + dir); };
  const holdRef = useRef<number | null>(null);

  const stopHold = () => {
    if (holdRef.current != null) {
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
  };

  const startHold = (dir: 1 | -1, el: HTMLElement, pointerId: number) => {
    stopHold();
    el.setPointerCapture?.(pointerId);
    spin(dir);
    holdRef.current = window.setInterval(() => spin(dir), 70);
  };

  useEffect(() => () => stopHold(), []);

  // Same as maquette HUD: needle rotates; letter snaps to N / NE / E / …
  const headingDeg = n > 0 ? (pos / n) * 360 : 0;
  const normDeg = ((headingDeg % 360) + 360) % 360;
  const headingDir = (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const)[
    Math.round(normDeg / 45) % 8
  ];

  return (
    <div
      className="spin-wrap"
      ref={wrapRef}
      onPointerDown={(e) => {
        dragging.current = true;
        startX.current = e.clientX;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const d = e.clientX - startX.current;
        if (Math.abs(d) > 8) {
          // same direction as the main maquette: the house follows the finger
          spin(d > 0 ? -1 : 1);
          startX.current = e.clientX;
        }
      }}
    >
      <canvas ref={canvasRef} />
      {loading && <div className="tour-load">Loading…</div>}
      <div className="spin compass">
        <button
          type="button"
          aria-label="تدوير لليسار"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startHold(-1, e.currentTarget, e.pointerId);
          }}
          onPointerUp={stopHold}
          onPointerCancel={stopHold}
          onPointerLeave={stopHold}
        >
          ‹
        </button>
        <span className="compass-face" aria-hidden>
          <i className="compass-ptr" style={{ transform: `rotate(${headingDeg}deg)` }} />
          <b>{headingDir}</b>
        </span>
        <button
          type="button"
          aria-label="تدوير لليمين"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startHold(1, e.currentTarget, e.pointerId);
          }}
          onPointerUp={stopHold}
          onPointerCancel={stopHold}
          onPointerLeave={stopHold}
        >
          ›
        </button>
      </div>
    </div>
  );
}

function VillaTour({
  unit,
  liked,
  onToggleFav,
  onClose,
}: {
  unit: Unit;
  liked: boolean;
  onToggleFav: () => void;
  onClose: () => void;
}) {
  const tour = useTour();
  const [tab, setTab] = useState<"plan" | "visit">("plan");
  const floors = COMPLEX.villa360?.floors ?? [];
  // RDC → 1st → Final (do not reverse)
  const floorOrder = floors;
  // always open on the top floor (Final)
  const [floor, setFloor] = useState(
    floors.find((f) => f.id === "etage_2")?.id ?? floors[floors.length - 1]?.id ?? "",
  );
  const floorFolder =
    floors.find((f) => f.id === floor)?.subfolder ?? floors[0]?.subfolder ?? "RDC";
  const badge = STATUS_AR[unit.status] ?? unit.status;
  const [isPhone, setIsPhone] = useState(false);
  // Phone sheet: opens at 52%. Pulled up to 60% it fills the whole screen;
  // pulled down from full it goes back to 52% so the villa shows again.
  const SHEET_OPEN = 0.52;
  const SHEET_SNAP_FULL = 0.6;
  const [sheetHeight, setSheetHeight] = useState(SHEET_OPEN);
  const [sheetDragging, setSheetDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number; h: number } | null>(null);

  useEffect(() => {
    const sync = () => setIsPhone(isPhoneLayout());
    sync();
    const mq = window.matchMedia(PHONE_LAYOUT_MQ);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const onSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPhone) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: sheetHeight, h: sheetHeight };
    setSheetDragging(true);
  };

  const onSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !isPhone) return;
    const dy = dragRef.current.startY - e.clientY;
    const next = Math.min(1, Math.max(0.25, dragRef.current.startH + dy / window.innerHeight));
    dragRef.current.h = next;
    setSheetHeight(next);
  };

  const onSheetPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const { startH, h } = dragRef.current;
    dragRef.current = null;
    setSheetDragging(false);
    if (startH >= 0.99) {
      // from full screen: a real pull down brings the villa back
      setSheetHeight(h < 0.92 ? Math.min(h, SHEET_OPEN) : 1);
    } else if (h >= SHEET_SNAP_FULL) {
      setSheetHeight(1);
    } else if (h > SHEET_OPEN) {
      setSheetHeight(SHEET_OPEN);
    }
  };
  const sheetCss = `min(${(sheetHeight * 100).toFixed(2)}vh, 100%)`;

  const sheetStyle = isPhone
    ? ({
        ["--sheet-h" as string]: sheetCss,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`detail${isPhone ? " phone-sheet" : ""}${tab === "visit" ? " visit-full" : ""}${isPhone && !sheetDragging ? " sheet-settle" : ""}${isPhone && sheetHeight >= 0.99 ? " sheet-full" : ""}`}
      style={sheetStyle}
    >
      <div className="detail-body">
        <div className="detail-stage">
          <div className="detail-top">
            <button type="button" className="tool-back" onClick={onClose} aria-label="Back">
              <IconBack />
            </button>
            <div className="detail-tabs">
              <button type="button" className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>
                Floorplan 3D
              </button>
              <button type="button" className={tab === "visit" ? "on" : ""} onClick={() => setTab("visit")}>
                Visite 360
              </button>
            </div>
          </div>
          {tab === "plan" ? (
            <>
              <Spin360 type={unit.type} folder={floorFolder} />
              {floors.length > 0 ? (
                <div className="floor-float" role="tablist" aria-label="Floors">
                  {floorOrder.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={floor === f.id}
                      className={floor === f.id ? "on" : ""}
                      onClick={() => setFloor(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <Visite360Viewer className="detail-visit" startId="10000" />
          )}
        </div>

        <aside
          className="detail-side form-mode"
          style={isPhone ? { height: sheetCss } : undefined}
          hidden={tab === "visit"}
        >
          {isPhone ? (
            <div
              className="sheet-handle"
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerUp}
              onPointerCancel={onSheetPointerUp}
            />
          ) : null}
          <div className="side-head">
            <div>
              <div className="side-project">{tour.name}</div>
              <h2>Investment apartment {unit.displayId}</h2>
            </div>
            <span className={`side-badge st-${unit.status}`}>{badge}</span>
          </div>
          <div className="side-stats" dir="rtl">
            <div>
              <span>النموذج</span>
              <b>{modelOf(unit)}</b>
            </div>
            <div>
              <span>الطوابق</span>
              <b>{unit.floor}</b>
            </div>
            <div>
              <span>غرف النوم</span>
              <b>{unit.rooms}</b>
            </div>
            <div>
              <span>المساحة</span>
              <b>{unit.surface}</b>
            </div>
          </div>
          <div className="plan-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaSrc(tourPlanDetailUrl(tour, unit))} alt="" />
            <button
              type="button"
              className={`heart${liked ? " on" : ""}`}
              onClick={onToggleFav}
              aria-label="Favorite"
              aria-pressed={liked}
            >
              <IconHeart filled={liked} />
            </button>
          </div>
          <DetailLead unit={unit} liked={liked} onToggleFav={onToggleFav} />
        </aside>
      </div>
    </div>
  );
}

function DetailLead({
  unit,
  liked,
  onToggleFav,
}: {
  unit: Unit;
  liked: boolean;
  onToggleFav: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [gender, setGender] = useState("");
  const [fieldErr, setFieldErr] = useState<Partial<Record<ContactIssue, string>>>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const clearIssue = (key: ContactIssue) => {
    setFieldErr((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = formRef.current;
    if (!form || busy) return;
    const fd = new FormData(form);
    const payload = {
      gender,
      nom: String(fd.get("nom") ?? ""),
      prenom: String(fd.get("prenom") ?? ""),
      email: String(fd.get("email") ?? ""),
      tel: String(fd.get("tel") ?? ""),
      message: String(fd.get("message") ?? ""),
      toFavorites: Boolean(fd.get("favorites")),
      favoriteUnits: fd.get("favorites") ? [unit.displayId] : [],
      unitId: unit.id,
      unitDisplayId: unit.displayId,
      complex: COMPLEX.name,
      source: "villa-tour",
    };
    const issues = contactIssues(payload);
    setFieldErr(issues);
    if (Object.keys(issues).length) return;
    setBusy(true);
    setOk(false);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          tel: telFromForm(fd),
        }),
      });
      if (!res.ok) throw new Error("fail");
      form.reset();
      setGender("");
      setFieldErr({});
      setOk(true);
    } catch {
      setFieldErr({ email: "تعذر الإرسال، حاول مرة أخرى." });
    } finally {
      setBusy(false);
    }
  };

  const tour = useTour();

  return (
    <form className="lead side" ref={formRef} onSubmit={onSubmit} noValidate dir="rtl">
      <div className="contact-info">
        <img src={tour.logoUrl || COMPLEX.logoPath} alt="" className="contact-logo" />
        <div className="contact-lines">
          <span className="contact-ico" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          </span>
          <b>{tour.name}</b>
          <span className="contact-ico" aria-hidden>
            <svg width="16" height="12" viewBox="0 0 20 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="1.5" width="18" height="12" rx="2" /><path d="m1.5 2.5 8.5 6.5 8.5-6.5" /></svg>
          </span>
          <a href={`mailto:${COMPLEX.contactEmail}`}>{COMPLEX.contactEmail}</a>
          <span className="contact-ico" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </span>
          <a href={`tel:${COMPLEX.contactTel}`} className="contact-tel">+966 57 555 5782</a>
        </div>
      </div>

      <p className="contact-ask">تحديد نوع الاستفسار</p>
      <div className={`contact-genders${fieldErr.gender ? " bad" : ""}`}>
        {["السيدة", "السيد", "لا"].map((g) => (
          <button
            key={g}
            type="button"
            className={gender === g ? "on" : ""}
            aria-pressed={gender === g}
            onClick={() => {
              setGender(g);
              clearIssue("gender");
            }}
          >
            {g}
          </button>
        ))}
      </div>
      {fieldErr.gender ? <p className="field-msg"><FieldMark />{fieldErr.gender}</p> : null}

      <label className={fieldErr.nom ? "bad" : ""}>
        اسم العائلة
        <input
          name="nom"
          placeholder="أدخل اسم العائلة"
          autoComplete="family-name"
          aria-invalid={Boolean(fieldErr.nom)}
          onInput={() => clearIssue("nom")}
        />
        {fieldErr.nom ? <span className="field-msg"><FieldMark />{fieldErr.nom}</span> : null}
      </label>
      <label className={fieldErr.prenom ? "bad" : ""}>
        الاسم الأول
        <input
          name="prenom"
          placeholder="أدخل الاسم الأول"
          autoComplete="given-name"
          aria-invalid={Boolean(fieldErr.prenom)}
          onInput={() => clearIssue("prenom")}
        />
        {fieldErr.prenom ? <span className="field-msg"><FieldMark />{fieldErr.prenom}</span> : null}
      </label>
      <label className={fieldErr.email ? "bad" : ""}>
        البريد الإلكتروني
        <input
          name="email"
          type="email"
          placeholder="أدخل بريدك الإلكتروني"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(fieldErr.email)}
          onInput={() => clearIssue("email")}
        />
        {fieldErr.email ? <span className="field-msg"><FieldMark />{fieldErr.email}</span> : null}
      </label>
      <label className={fieldErr.tel ? "bad" : ""}>
        رقم الهاتف
        <PhoneField placeholder="أدخل رقم هاتفك" />
        {fieldErr.tel ? <span className="field-msg"><FieldMark />{fieldErr.tel}</span> : null}
      </label>
      <label>
        هل لديك رسالة لنا؟
        <textarea name="message" rows={3} placeholder="اكتب رسالتك هنا..." />
      </label>

      <label className="lead-check">
        <input
          type="checkbox"
          name="favorites"
          value="1"
          defaultChecked={liked}
          onChange={() => onToggleFav()}
        />
        إرسال إلى المفضلة
      </label>

      {ok ? <p className="lead-ok" role="status">تم إرسال طلبك بنجاح.</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? "جاري الإرسال..." : "إرسال طلبك"}
      </button>
    </form>
  );
}
