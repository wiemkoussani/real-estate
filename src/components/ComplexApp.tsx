"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from "react";
import { COMPLEX, type Unit, type UnitStatus } from "@/lib/complex";
import { buildTour, emptyTour, tourPlanUrl, tourVillaUrl, type TourMedia } from "@/lib/tour";
import type { OrbitEngine as OrbitEngineType } from "@/viewer/OrbitEngine";
import {
  IconApps,
  IconCards,
  IconEye,
  IconFilters,
  IconGallery,
  IconHeart,
  IconHelp,
  IconList,
  IconMail,
  IconEyeOff,
  IconFullscreen,
  IconMinus,
  IconPan,
  IconPin,
  IconPlus,
  IconTriL,
  IconTriR,
} from "@/components/Icons";
import { GalleryPage, HelpPage, LocationPage } from "@/components/TourPages";

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

function mediaSrc(url: string | undefined | null) {
  return url ? url : undefined;
}

const DIAL_CODES = [
  { d: "+966", n: "Arabie saoudite" },
  { d: "+971", n: "Dubaï / EAU" },
  { d: "+974", n: "Qatar" },
  { d: "+216", n: "Tunisie" },
  { d: "+965", n: "Koweït" },
  { d: "+973", n: "Bahreïn" },
  { d: "+968", n: "Oman" },
  { d: "+20", n: "Égypte" },
  { d: "+213", n: "Algérie" },
  { d: "+212", n: "Maroc" },
  { d: "+218", n: "Libye" },
  { d: "+33", n: "France" },
  { d: "+32", n: "Belgique" },
  { d: "+49", n: "Allemagne" },
  { d: "+44", n: "Royaume-Uni" },
  { d: "+39", n: "Italie" },
  { d: "+34", n: "Espagne" },
  { d: "+1", n: "USA / Canada" },
  { d: "+90", n: "Turquie" },
];

function telFromForm(fd: FormData) {
  const dial = String(fd.get("dial") || "+216").trim();
  let num = String(fd.get("tel") || "").trim().replace(/[\s.-]/g, "");
  if (!num) return "";
  if (num.startsWith("+")) return num;
  return `${dial}${num.replace(/^0+/, "")}`;
}

function PhoneField({ required }: { required?: boolean }) {
  return (
    <span className="phone-row">
      <select name="dial" defaultValue="+966" aria-label="indicatif pays">
        {DIAL_CODES.map((c) => (
          <option key={c.d + c.n} value={c.d}>{c.d}</option>
        ))}
      </select>
      <input name="tel" type="tel" required={required} autoComplete="tel" inputMode="tel" />
    </span>
  );
}

type DetailTab = "floor3d" | "model360" | "facade";

const TourCtx = createContext<TourMedia>(emptyTour(COMPLEX.slug));
function useTour() {
  return useContext(TourCtx);
}

export default function ComplexApp({ slug, initialTour }: { slug: string; initialTour?: TourMedia | null }) {
  const [tour, setTour] = useState<TourMedia | null>(initialTour ?? null);

  useEffect(() => {
    if (initialTour) {
      setTour(initialTour);
      return;
    }
    let cancelled = false;
    fetch(`/api/complexes/${slug}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Not found");
        return buildTour(json, slug);
      })
      .then((next) => {
        if (!cancelled) setTour(next);
      })
      .catch(() => {
        if (!cancelled) setTour(emptyTour(slug));
      });
    return () => {
      cancelled = true;
    };
  }, [slug, initialTour]);

  if (!tour) {
    return (
      <div className="app">
        <div className="boot">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <TourCtx.Provider value={tour}>
      <ComplexStage tour={tour} />
    </TourCtx.Provider>
  );
}

function cardPhoto(tour: TourMedia, unit: Unit) {
  const plan = tourPlanUrl(tour, unit);
  if (plan) return plan;
  const byType = Object.entries(tour.plans).find(([k]) => k.includes(`type-${unit.type}`));
  if (byType) return byType[1];
  const plans = Object.values(tour.plans).filter(Boolean);
  return plans[0] || "";
}

function ComplexStage({ tour }: { tour: TourMedia }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const bgNextRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OrbitEngineType | null>(null);
  const approachedRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [frame, setFrame] = useState(0);
  const [hover, setHover] = useState<Unit | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Unit | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [cards, setCards] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [favOnly, setFavOnly] = useState(false);
  const [overlayOn, setOverlayOn] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [headingDir, setHeadingDir] = useState("N");
  const [headingDeg, setHeadingDeg] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [tourUnit, setTourUnit] = useState<Unit | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const rotateHoldRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"all" | UnitStatus>("all");
  const [type, setType] = useState<"all" | "1" | "2" | "3">("all");
  const [areaMax, setAreaMax] = useState(300);
  const [floorMax, setFloorMax] = useState(5);
  const [roomsMax, setRoomsMax] = useState(6);

  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem("axis-favs") || "[]"));
    } catch {
      setFavs([]);
    }
  }, []);

  useEffect(() => {
    // Phone: start with full tour — sidebar as bottom sheet only when opened.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 840px)").matches) {
      setListOpen(false);
      setFiltersOpen(false);
    }
  }, []);

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
    en.setFocus(u.id);
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
        onLoadProgress: setLoadPct,
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
            setAreaMax(Math.max(...list.map((u) => u.surface)));
            setFloorMax(Math.max(...list.map((u) => u.floor)));
            setRoomsMax(Math.max(...list.map((u) => u.rooms)));
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
    engineRef.current?.setStatusFilter(status);
  }, [status, ready]);

  useEffect(() => {
    engineRef.current?.setPanMode(panMode);
  }, [panMode, ready]);

  useEffect(() => {
    engineRef.current?.setOverlayVisible(overlayOn);
  }, [overlayOn, ready]);

  const filtered = useMemo(() => {
    return units
      .filter((u) => u.surface <= areaMax && u.floor <= floorMax && u.rooms <= roomsMax)
      .filter((u) => status === "all" || u.status === status)
      .filter((u) => type === "all" || String(u.type) === type)
      .filter((u) => !favOnly || favs.includes(u.id))
      .sort((a, b) => a.displayId.localeCompare(b.displayId, undefined, { numeric: true }));
  }, [units, areaMax, floorMax, roomsMax, status, type, favOnly, favs]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("axis-favs", JSON.stringify(next));
      return next;
    });
  };

  const bounds = useMemo(() => {
    if (!units.length) return { areaMin: 100, areaMax: 300, floorMin: 1, floorMax: 5, roomsMin: 1, roomsMax: 6 };
    const fmin = Math.min(...units.map((u) => u.floor));
    const fmax = Math.max(...units.map((u) => u.floor));
    return {
      areaMin: Math.min(...units.map((u) => u.surface)),
      areaMax: Math.max(...units.map((u) => u.surface)),
      floorMin: fmin === fmax ? 1 : fmin,
      floorMax: fmin === fmax ? Math.max(5, fmax) : fmax,
      roomsMin: Math.min(...units.map((u) => u.rooms)),
      roomsMax: Math.max(...units.map((u) => u.rooms)),
    };
  }, [units]);

  const resetFilters = () => {
    setAreaMax(bounds.areaMax);
    setFloorMax(bounds.floorMax);
    setRoomsMax(bounds.roomsMax);
    setStatus("all");
    setType("all");
    setFavOnly(false);
  };

  const openUnit = (u: Unit) => {
    void pickUnit(u);
  };

  return (
    <div className="app">
      {!ready && (
        <div className="boot">
          {tour.logoUrl ? <img src={tour.logoUrl} alt={tour.name} /> : <p>{tour.name}</p>}
          <div className="boot-bar"><span style={{ width: `${loadPct}%` }} /></div>
          <p>{loadPct}%</p>
        </div>
      )}
      <aside className={`panel ${listOpen ? "open" : ""} ${formOpen ? "form-wide" : ""}`}>
        <button className="peek" type="button" onClick={() => setListOpen((v) => !v)} aria-label="Toggle list">
          {listOpen ? "‹" : "›"}
        </button>
        <div className={`panel-inner ${formOpen ? "form-mode" : ""}`}>
          {formOpen ? (
            <ContactSidebar unit={selected} onBack={() => setFormOpen(false)} />
          ) : (
            <>
          <header className="panel-head">
            <span className="unit-count">{filtered.length} units</span>
            <div className="pills">
              <button type="button" className={`pill ${favOnly ? "on" : ""}`} onClick={() => setFavOnly((v) => !v)} title="Favorites">
                <IconHeart size={14} filled={favOnly || favs.length > 0} /> {favs.length}
              </button>
              <button className={`pill ${filtersOpen ? "on" : ""}`} type="button" onClick={() => setFiltersOpen((v) => !v)} title="Filters">
                <IconFilters size={14} />
              </button>
              <button className={`pill ${cards ? "on" : ""}`} type="button" onClick={() => setCards((v) => !v)} title={cards ? "List" : "Cards"}>
                {cards ? <IconList size={14} /> : <IconCards size={14} />}
              </button>
            </div>
          </header>
          {filtersOpen && (
            <div className="filters">
              <div className="slider-row">
                <label>
                  <span>Area</span>
                  <input type="range" min={bounds.areaMin} max={bounds.areaMax} value={areaMax} onChange={(e) => setAreaMax(+e.target.value)} style={{ backgroundSize: `${((areaMax - bounds.areaMin) / Math.max(1, bounds.areaMax - bounds.areaMin)) * 100}% 100%` }} />
                  <em>{bounds.areaMin}–{areaMax}</em>
                </label>
                <label>
                  <span>Rooms</span>
                  <input type="range" min={bounds.roomsMin} max={bounds.roomsMax} value={roomsMax} onChange={(e) => setRoomsMax(+e.target.value)} style={{ backgroundSize: `${((roomsMax - bounds.roomsMin) / Math.max(1, bounds.roomsMax - bounds.roomsMin)) * 100}% 100%` }} />
                  <em>{bounds.roomsMin}–{roomsMax}</em>
                </label>
              </div>
              <button type="button" className="reset" onClick={resetFilters}>Reset</button>
              <div className="row">
                <label className="select-field">
                  <span>Status</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                    <option value="all">All</option>
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="sold">Sold</option>
                  </select>
                </label>
                <label className="select-field">
                  <span>Types</span>
                  <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                    <option value="all">All</option>
                    <option value="1">Type 1</option>
                    <option value="2">Type 2</option>
                    <option value="3">Type 3</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          <div className={`units ${cards ? "cards" : "table"}`}>
            {!cards && (
              <div className="thead"><span /><span>ID</span><span>Area</span><span>Floor</span><span>Rooms</span><span /></div>
            )}
            {filtered.map((u) => {
              const photo = cardPhoto(tour, u);
              return (
              <button
                key={u.id}
                type="button"
                className={`unit ${selected?.id === u.id ? "sel" : ""}`}
                onClick={() => openUnit(u)}
                onMouseEnter={() => engineRef.current?.setPreview(u.id)}
                onMouseLeave={() => engineRef.current?.setPreview(null)}
              >
                {cards ? (
                  <>
                    <div className="card-copy">
                      <strong>
                        {u.displayId}
                        <span className={`status-dot ${u.status} dot ${u.status}`} />
                      </strong>
                      <span className="meta-area"><small>Area</small><b>{u.surface} m²</b></span>
                      <span className="meta-floor"><small>Floor</small><b>{u.floor}</b></span>
                      <span className="meta-rooms"><small>Rooms</small><b>{u.rooms}</b></span>
                      <span className={favs.includes(u.id) ? "heart on" : "heart"} onClick={(e) => { e.stopPropagation(); toggleFav(u.id); }}>
                        <IconHeart size={14} filled={favs.includes(u.id)} />
                      </span>
                    </div>
                    <div className="card-side">
                      {photo ? <img src={photo} alt="" /> : <span className="card-img-fallback" />}
                    </div>
                  </>
                ) : (
                  <>
                    <span className={`dot ${u.status}`} />
                    <strong>{u.displayId}</strong>
                    <span className="meta-area"><b>{u.surface} m²</b></span>
                    <span className="meta-floor"><b>{u.floor}</b></span>
                    <span className="meta-rooms"><b>{u.rooms}</b></span>
                    <span className={favs.includes(u.id) ? "heart on" : "heart"} onClick={(e) => { e.stopPropagation(); toggleFav(u.id); }}>
                      <IconHeart size={14} filled={favs.includes(u.id)} />
                    </span>
                  </>
                )}
                <em className={`badge ${u.status}`}>{STATUS_LABEL[u.status]}</em>
              </button>
              );
            })}
          </div>
            </>
          )}
        </div>
      </aside>

      <div className="stage" ref={stageRef}>
        <canvas ref={bgRef} className="layer bg" />
        <canvas ref={bgNextRef} className="layer bg-next" />
        <canvas ref={threeRef} className="layer webgl" />

        {hover && hoverPos && !tourUnit && (
          <div className="tip follow" style={{ left: hoverPos.x, top: hoverPos.y }}>
            {mediaSrc(tourPlanUrl(tour, hover)) ? <img src={tourPlanUrl(tour, hover)} alt="" /> : null}
            <div>
              <div className="tip-head">
                <b>{hover.displayId}</b>
                <small className={hover.status}>{STATUS_LABEL[hover.status]}</small>
              </div>
              <p>{hover.surface} m² · {hover.rooms} rooms</p>
            </div>
          </div>
        )}
        {selected && !hover && !tourUnit && approachedRef.current === selected.id && (
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

        <nav className="rail" aria-label="Tools" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <span className="rail-fab open">
            <span className="rail-name">مشروع</span>
            <span className="rail-ico project"><IconApps size={20} /></span>
          </span>
          <button type="button" className="rail-fab" onClick={() => { setFormOpen(true); setListOpen(true); }}>
            <span className="rail-name">تواصل</span>
            <span className="rail-ico glass"><IconMail size={16} /></span>
          </button>
          <button type="button" className="rail-fab" onClick={() => setHelpOpen(true)}>
            <span className="rail-name">مساعدة</span>
            <span className="rail-ico glass"><IconHelp size={16} /></span>
          </button>
          <button type="button" className="rail-fab" onClick={() => setLocationOpen(true)}>
            <span className="rail-name">الموقع</span>
            <span className="rail-ico glass"><IconPin size={16} /></span>
          </button>
          <button type="button" className="rail-fab" onClick={() => setGalleryOpen(true)}>
            <span className="rail-name">المعرض</span>
            <span className="rail-ico glass"><IconGallery size={16} /></span>
          </button>
        </nav>

        <div className="hud" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <div className="hud-tools">
            <button
              type="button"
              title="Fullscreen"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen?.();
                else void document.documentElement.requestFullscreen?.();
              }}
            >
              <IconFullscreen size={17} />
            </button>
            <button
              type="button"
              className={overlayOn ? "on" : ""}
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
              <IconPan size={17} />
            </button>
            <button type="button" title="Zoom out" onClick={() => engineRef.current?.zoomBy(-COMPLEX.zoomStep)}>
              <IconMinus size={17} />
            </button>
            <button type="button" title="Zoom in" onClick={() => engineRef.current?.zoomBy(COMPLEX.zoomStep)}>
              <IconPlus size={17} />
            </button>
          </div>
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

      {helpOpen && <HelpPage tour={tour} onClose={() => setHelpOpen(false)} />}
      {locationOpen && <LocationPage tour={tour} onClose={() => setLocationOpen(false)} />}
      {galleryOpen && <GalleryPage tour={tour} onClose={() => setGalleryOpen(false)} />}
      {tourUnit && (
        <VillaTour
          unit={tourUnit}
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

function ContactSidebar({ unit, onBack }: { unit: Unit | null; onBack: () => void }) {
  const tour = useTour();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [gender, setGender] = useState("السيدة");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      nom: String(fd.get("nom") || "").trim(),
      prenom: String(fd.get("prenom") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      tel: telFromForm(fd),
      gender,
      subject: String(fd.get("subject") || "").trim(),
      message: String(fd.get("message") || "").trim(),
      toFavorites: fd.get("favorites") === "on",
      unitId: unit?.id ?? null,
      unitDisplayId: unit?.displayId ?? null,
      complex: tour.slug,
    };
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
      <header className="contact-head">
        <h2>تواصل معنا</h2>
        <button type="button" className="back" onClick={onBack}>‹ الوحدات</button>
      </header>
      <div className="agency-card">
        {tour.logoUrl ? (
          <span className="agency-logo"><img src={tour.logoUrl} alt="" /></span>
        ) : (
          <span className="agency-mark">A</span>
        )}
        <div className="agency-meta">
          <b>{tour.name}</b>
          <p>
            <a href={`mailto:${COMPLEX.contactEmail}`}>{COMPLEX.contactEmail}</a>
          </p>
          <p>
            <a href={`tel:${COMPLEX.contactTel}`}>+966 57 555 5782</a>
          </p>
        </div>
      </div>
      {unit && <span className="contact-chip">وحدة {unit.displayId}</span>}
      <form className="lead side" onSubmit={submit}>
        <p>تحية</p>
        <div className="seg">
          {["السيدة", "السيد", "لا"].map((g) => (
            <button key={g} type="button" className={gender === g ? "on" : ""} onClick={() => setGender(g)}>{g}</button>
          ))}
        </div>
        <label>اسم العائلة * <input name="nom" required autoComplete="family-name" /></label>
        <label>الاسم الأول * <input name="prenom" required autoComplete="given-name" /></label>
        <label>البريد الإلكتروني <input name="email" type="email" autoComplete="email" /></label>
        <label>رقم الهاتف
          <PhoneField />
        </label>
        <label>هل لديك رسالة لنا؟ <input name="subject" placeholder="طلبك" /></label>
        <textarea name="message" rows={4} placeholder="رسالتك" aria-label="رسالتك" />
        <label className="lead-check">
          <span>إرسال إلى المفضلة</span>
          <input type="checkbox" name="favorites" />
        </label>
        <label className="lead-check">
          <span>وافقت عليها. سياسة الخصوصية لقد قرأت</span>
          <input type="checkbox" name="privacy" required />
        </label>
        {err && <p className="err">{err}</p>}
        {ok ? <p className="ok">تم الإرسال. سنتواصل معك قريباً.</p> : <button type="submit" disabled={busy}>{busy ? "…" : "إرسال طلب اتصال"}</button>}
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
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const n = tour.villaFrames;

  const draw = useCallback((i: number) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const img = images.current[i];
    if (!canvas || !wrap || !img?.complete || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(0, 0, w, h);
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    ctx.drawImage(img, (w - img.naturalWidth * scale) / 2, (h - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
  }, []);

  const idxRef = useRef(0);
  idxRef.current = idx;

  const ensureFrame = useCallback((i: number) => {
    if (!n) return;
    const index = ((i % n) + n) % n;
    const existing = images.current[index];
    if (existing?.complete && existing.naturalWidth) return;
    if (loadingSet.current.has(index)) return;
    loadingSet.current.add(index);
    const img = existing ?? new Image();
    images.current[index] = img;
    img.decoding = "async";
    const src = tourVillaUrl(tour, type, folder, index);
    if (!src) {
      loadingSet.current.delete(index);
      return;
    }
    if (img.src !== src) {
      img.onload = () => {
        loadingSet.current.delete(index);
        if (idxRef.current === index) {
          setLoading(false);
          draw(index);
        }
      };
      img.onerror = () => {
        loadingSet.current.delete(index);
        if (idxRef.current === index) setLoading(false);
      };
      img.src = src;
    }
  }, [n, tour, type, folder, draw]);

  const warmAround = useCallback((center: number) => {
    if (!n) return;
    ensureFrame(center);
    for (let d = 1; d <= 4; d++) {
      ensureFrame(center + d);
      ensureFrame(center - d);
    }
  }, [n, ensureFrame]);

  useEffect(() => {
    images.current = [];
    loadingSet.current = new Set();
    setIdx(0);
    setLoading(true);
    warmAround(0);
    const onResize = () => draw(idxRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [type, folder, tour, warmAround, draw]);

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

  const spin = (dir: 1 | -1) => setIdx((v) => (v + dir + n) % n);

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
          spin(d > 0 ? -1 : 1);
          startX.current = e.clientX;
        }
      }}
    >
      <canvas ref={canvasRef} />
      {loading && <div className="tour-load">Loading…</div>}
      <div className="spin">
        <button type="button" onClick={() => spin(-1)}>‹</button>
        <span>360°</span>
        <button type="button" onClick={() => spin(1)}>›</button>
      </div>
    </div>
  );
}

function VillaTour({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const tour = useTour();
  const [tab, setTab] = useState<DetailTab>("model360");
  const [floor, setFloor] = useState(COMPLEX.villa360.floors[0].subfolder);
  const [facade, setFacade] = useState(0);
  const spinFolder = tab === "floor3d" ? floor : COMPLEX.villa360.whole;
  const show360 = tab === "floor3d" || tab === "model360";
  const facades = COMPLEX.villa360.facadeFrames;

  return (
    <div className="detail">
      <header className="detail-top">
        <div className="detail-bar">
          <button type="button" className="back" onClick={onClose} aria-label="Back">←</button>
          <span className="crumb">{tour.name}</span>
          <span className="crumb-unit">Investment apartment {unit.displayId}</span>
          <span className={`dot ${unit.status}`} />
          <nav className="tabs">
            <button type="button" className={tab === "floor3d" ? "on" : ""} onClick={() => setTab("floor3d")}>Floorplan 3D</button>
            <button type="button" className={tab === "model360" ? "on" : ""} onClick={() => setTab("model360")}>Model 360</button>
            <button type="button" className={tab === "facade" ? "on" : ""} onClick={() => setTab("facade")}>Facade</button>
          </nav>
        </div>
      </header>

      <div className="detail-body">
        <div className="detail-stage">
          {show360 && <Spin360 type={unit.type} folder={spinFolder} />}
          {tab === "facade" && mediaSrc(tourVillaUrl(tour, unit.type, COMPLEX.villa360.whole, facades[facade].index)) ? (
            <img className="still" src={tourVillaUrl(tour, unit.type, COMPLEX.villa360.whole, facades[facade].index)} alt={facades[facade].label} />
          ) : null}
          {tab === "floor3d" && (
            <div className="floor-float">
              {COMPLEX.villa360.floors.map((f) => (
                <button key={f.id} type="button" className={floor === f.subfolder ? "on" : ""} onClick={() => setFloor(f.subfolder)}>{f.label}</button>
              ))}
            </div>
          )}
          {tab === "facade" && (
            <div className="floor-float facade-float">
              {facades.map((f, n) => (
                <button key={f.label} type="button" className={n === facade ? "on" : ""} onClick={() => setFacade(n)}>{f.label}</button>
              ))}
            </div>
          )}
        </div>

        <aside className="detail-side">
          <div className="side-head">
            <div>
              <p className="side-name">{tour.name}</p>
              <h2>
                Investment apartment {unit.displayId}
                <small className={unit.status}>{STATUS_LABEL[unit.status]}</small>
              </h2>
            </div>
            <span className="heart on"><IconHeart filled /></span>
          </div>
          <div className="stats">
            <div><span>Area</span><b>{unit.surface} m²</b></div>
            <div><span>Rooms</span><b>{unit.rooms}</b></div>
            <div><span>Floor</span><b>{unit.floor}</b></div>
            <div><span>Building</span><b>T{unit.type}</b></div>
          </div>
          <div className="plan-wrap">
            {mediaSrc(tourPlanUrl(tour, unit)) ? <img src={tourPlanUrl(tour, unit)} alt="" /> : null}
          </div>
          <DetailLead unit={unit} />
        </aside>
      </div>
    </div>
  );
}

function DetailLead({ unit }: { unit: Unit }) {
  const tour = useTour();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [gender, setGender] = useState("السيدة");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      nom: String(fd.get("nom") || "").trim(),
      prenom: String(fd.get("prenom") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      tel: telFromForm(fd),
      gender,
      subject: String(fd.get("subject") || "").trim(),
      message: String(fd.get("message") || "").trim(),
      toFavorites: fd.get("favorites") === "on",
      unitId: unit.id,
      unitDisplayId: unit.displayId,
      complex: tour.slug,
    };
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
    <form className="lead" dir="rtl" onSubmit={submit}>
      <p className="lead-title">طلب اهتمام</p>
      <p>تحية</p>
      <div className="seg">
        {["السيدة", "السيد", "لا"].map((g) => (
          <button key={g} type="button" className={gender === g ? "on" : ""} onClick={() => setGender(g)}>{g}</button>
        ))}
      </div>
      <label>اسم العائلة <input name="nom" required autoComplete="family-name" /></label>
      <label>الاسم الأول <input name="prenom" required autoComplete="given-name" /></label>
      <label>البريد الإلكتروني <input name="email" type="email" required autoComplete="email" /></label>
      <label>رقم الهاتف <PhoneField required /></label>
      <label>هل لديك رسالة لنا؟ <input name="subject" placeholder="طلبك" /></label>
      <textarea name="message" rows={3} placeholder="رسالتك" aria-label="رسالتك" />
      <label className="lead-check">
        <span>إرسال إلى المفضلة</span>
        <input type="checkbox" name="favorites" />
      </label>
      {err && <p className="err">{err}</p>}
      {ok ? <p className="ok">تم الإرسال</p> : <button type="submit" disabled={busy}>{busy ? "..." : "إرسال طلب اتصال"}</button>}
    </form>
  );
}
