"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from "react";
import { COMPLEX, type Unit, type UnitStatus } from "@/lib/complex";
import { buildTour, emptyTour, tourPlanUrl, tourVillaUrl, type TourMedia } from "@/lib/tour";
import { OrbitEngine } from "@/viewer/OrbitEngine";
import {
  IconCards,
  IconEye,
  IconFilters,
  IconGallery,
  IconHeart,
  IconHelp,
  IconList,
  IconMail,
  IconPan,
  IconPin,
  IconRotateL,
  IconRotateR,
  IconZoomIn,
  IconZoomOut,
} from "@/components/Icons";

const STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
};

function mediaSrc(url: string | undefined | null) {
  return url ? url : undefined;
}

type DetailTab = "floor3d" | "model360" | "exterior" | "facade";

const TourCtx = createContext<TourMedia>(emptyTour(COMPLEX.slug));
function useTour() {
  return useContext(TourCtx);
}

export default function ComplexApp({ slug }: { slug: string }) {
  const [tour, setTour] = useState<TourMedia | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/complexes/${slug}`, { cache: "no-store" })
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
  }, [slug]);

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

function ComplexStage({ tour }: { tour: TourMedia }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const bgNextRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OrbitEngine | null>(null);
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
  const [cards, setCards] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [overlayOn, setOverlayOn] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [tourUnit, setTourUnit] = useState<Unit | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
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

  const pickUnit = async (u: Unit, engine?: OrbitEngine | null) => {
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
    const engine = new OrbitEngine(stage, { bg, bgNext, three }, {
      onLoadProgress: setLoadPct,
      onFrame: setFrame,
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
        engine.resetView();
      },
      onReady: () => {
        const list = engine.getUnits();
        setUnits(list);
        if (list.length) {
          setAreaMax(Math.max(...list.map((u) => u.surface)));
          setFloorMax(Math.max(...list.map((u) => u.floor)));
          setRoomsMax(Math.max(...list.map((u) => u.rooms)));
        }
        setReady(true);
      },
    }, tour);
    engineRef.current = engine;
    void engine.start().catch((err) => {
      console.error(err);
      setLoadPct(100);
      setReady(true);
    });
    return () => engine.dispose();
  }, [tour]);

  useEffect(() => {
    engineRef.current?.setStatusFilter(status);
  }, [status, ready]);

  const filtered = useMemo(() => {
    return units
      .filter((u) => u.surface <= areaMax && u.floor <= floorMax && u.rooms <= roomsMax)
      .filter((u) => status === "all" || u.status === status)
      .filter((u) => type === "all" || String(u.type) === type)
      .sort((a, b) => a.displayId.localeCompare(b.displayId, undefined, { numeric: true }));
  }, [units, areaMax, floorMax, roomsMax, status, type]);

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
      <aside className={`panel ${listOpen ? "open" : ""}`}>
        <button className="peek" type="button" onClick={() => setListOpen((v) => !v)} aria-label="Toggle list">
          {listOpen ? "‹" : "›"}
        </button>
        <div className="panel-inner">
          <header className="panel-head">
            <div>
              <h1>{tour.name}</h1>
              <p>{filtered.length} / {units.length} units</p>
            </div>
            <div className="pills">
              <span className="pill heart-pill"><IconHeart size={14} filled={favs.length > 0} /> {favs.length}</span>
              <button className={`pill ${filtersOpen ? "on" : ""}`} type="button" onClick={() => setFiltersOpen((v) => !v)}>
                <IconFilters size={14} /> Filters
              </button>
              <button className={`pill ${cards ? "on" : ""}`} type="button" onClick={() => setCards((v) => !v)}>
                {cards ? <IconList size={14} /> : <IconCards size={14} />} {cards ? "List" : "Cards"}
              </button>
            </div>
          </header>
          {filtersOpen && (
            <div className="filters">
              <label>Area <input type="range" min={bounds.areaMin} max={bounds.areaMax} value={areaMax} onChange={(e) => setAreaMax(+e.target.value)} style={{ backgroundSize: `${((areaMax - bounds.areaMin) / Math.max(1, bounds.areaMax - bounds.areaMin)) * 100}% 100%` }} /> {areaMax} m²</label>
              <label>Floor <input type="range" min={bounds.floorMin} max={bounds.floorMax} value={floorMax} onChange={(e) => setFloorMax(+e.target.value)} style={{ backgroundSize: `${((floorMax - bounds.floorMin) / Math.max(1, bounds.floorMax - bounds.floorMin)) * 100}% 100%` }} /> {floorMax}</label>
              <label>Rooms <input type="range" min={bounds.roomsMin} max={bounds.roomsMax} value={roomsMax} onChange={(e) => setRoomsMax(+e.target.value)} style={{ backgroundSize: `${((roomsMax - bounds.roomsMin) / Math.max(1, bounds.roomsMax - bounds.roomsMin)) * 100}% 100%` }} /> {roomsMax}</label>
              <div className="row">
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  <option value="all">Status · All</option>
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="sold">Sold</option>
                </select>
                <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  <option value="all">Types · All</option>
                  <option value="1">Type 1</option>
                  <option value="2">Type 2</option>
                  <option value="3">Type 3</option>
                </select>
              </div>
              <button type="button" className="reset" onClick={resetFilters}>Reset filters</button>
            </div>
          )}
          <div className={`units ${cards ? "cards" : "table"}`}>
            {!cards && (
              <div className="thead"><span>ID</span><span>Area</span><span>Type</span><span>Floor</span><span>Rooms</span></div>
            )}
            {filtered.map((u) => (
              <button key={u.id} type="button" className={`unit ${selected?.id === u.id ? "sel" : ""}`} onClick={() => openUnit(u)}>
                <span className={`dot ${u.status}`} />
                {cards && mediaSrc(tourPlanUrl(tour, u)) ? <img src={tourPlanUrl(tour, u)} alt="" /> : null}
                <strong>{u.displayId}</strong>
                <span>{u.surface} m²</span>
                <span>T{u.type}</span>
                <span>{u.floor}</span>
                <span>{u.rooms}</span>
                <span className={favs.includes(u.id) ? "heart on" : "heart"} onClick={(e) => { e.stopPropagation(); toggleFav(u.id); }}>
                  <IconHeart size={14} filled={favs.includes(u.id)} />
                </span>
                {cards && <em className={`badge ${u.status}`}>{STATUS_LABEL[u.status]}</em>}
              </button>
            ))}
          </div>
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

        <nav className="rail" aria-label="Tools" onPointerDown={(e) => e.stopPropagation()}>
          <span className="rail-chip">مشروع</span>
          <button type="button" title="Form" className="mail" onClick={() => setFormOpen(true)}><IconMail /></button>
          <button type="button" title="How to use" className="help" onClick={() => setHelpOpen(true)}><IconHelp /></button>
          <button type="button" title="Location" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tour.locationQuery)}`, "_blank")}><IconPin /></button>
          <button type="button" title="Gallery" onClick={() => setGalleryOpen(true)}><IconGallery /></button>
        </nav>

        <div className="hud" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={panMode ? "on" : ""} onClick={() => { const v = !panMode; setPanMode(v); engineRef.current?.setPanMode(v); }}><IconPan size={16} /></button>
          <button type="button" onClick={() => engineRef.current?.zoomBy(-COMPLEX.zoomStep)}><IconZoomOut size={16} /></button>
          <button type="button" onClick={() => engineRef.current?.zoomBy(COMPLEX.zoomStep)}><IconZoomIn size={16} /></button>
          <button type="button" onClick={() => engineRef.current?.rotateBy(-1)}><IconRotateL size={16} /></button>
          <button type="button" onClick={() => engineRef.current?.rotateBy(1)}><IconRotateR size={16} /></button>
          <button type="button" className={overlayOn ? "on" : ""} onClick={() => { const v = !overlayOn; setOverlayOn(v); engineRef.current?.setOverlayVisible(v); }}><IconEye size={16} /></button>
        </div>
      </div>

      {helpOpen && (
        <Modal onClose={() => setHelpOpen(false)} title="كيفية الاستخدام">
          <ul className="help-list" dir="rtl">
            <li>اسحب يمينًا أو يسارًا لتدوير المجمع.</li>
            <li>قرّب الإصبعين أو استخدم العجلة للتكبير.</li>
            <li>مرّر المؤشر فوق فيلا ليظهر لونها: أخضر متاحة، أصفر محجوزة، أحمر مباعة.</li>
            <li>انقر مرة للاقتراب من الخارج، ثم انقر مرة ثانية للدخول.</li>
            <li>زر الرسالة لطلب اهتمام (الاسم، اللقب، البريد، الهاتف).</li>
          </ul>
        </Modal>
      )}

      {formOpen && <LeadForm unit={selected} onClose={() => setFormOpen(false)} />}
      {galleryOpen && <Gallery onClose={() => setGalleryOpen(false)} />}
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

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header><span /><h2>{title}</h2><button type="button" onClick={onClose}>×</button></header>
        {children}
      </div>
    </div>
  );
}

function LeadForm({ unit, onClose }: { unit: Unit | null; onClose: () => void }) {
  const tour = useTour();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      nom: String(fd.get("nom") || "").trim(),
      prenom: String(fd.get("prenom") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      tel: String(fd.get("tel") || "").trim(),
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
    <Modal onClose={onClose} title="طلب اهتمام">
      <form className="lead" dir="rtl" onSubmit={submit}>
        {unit && <p className="lead-unit">Unit {unit.displayId}</p>}
        <label>الاسم <input name="nom" required autoComplete="family-name" /></label>
        <label>اللقب <input name="prenom" required autoComplete="given-name" /></label>
        <label>البريد الإلكتروني <input name="email" type="email" required autoComplete="email" /></label>
        <label>رقم الهاتف <input name="tel" type="tel" required autoComplete="tel" /></label>
        {err && <p className="err">{err}</p>}
        {ok ? <p className="ok">تم الإرسال</p> : <button type="submit" disabled={busy}>{busy ? "..." : "إرسال"}</button>}
      </form>
    </Modal>
  );
}

function Gallery({ onClose }: { onClose: () => void }) {
  const tour = useTour();
  const gallery = tour.gallery;
  const [i, setI] = useState(0);
  if (!gallery.length) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" type="button" onClick={onClose}>×</button>
        {mediaSrc(gallery[i]) ? <img src={gallery[i]} alt={`${tour.name} ${i + 1}`} /> : null}
        <button className="lightbox-prev" type="button" onClick={() => setI((v) => (v + gallery.length - 1) % gallery.length)}>‹</button>
        <button className="lightbox-next" type="button" onClick={() => setI((v) => (v + 1) % gallery.length)}>›</button>
        <div className="thumbs">
          {gallery.map((src, n) => (
            <button key={src} type="button" className={n === i ? "on" : ""} onClick={() => setI(n)}>
              {mediaSrc(src) ? <img src={src} alt="" /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Spin360({ type, folder }: { type: number; folder: string }) {
  const tour = useTour();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  const dragging = useRef(false);
  const startX = useRef(0);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setIdx(0);
    images.current = [];
    const n = tour.villaFrames;
    let done = 0;
    for (let i = 0; i < n; i++) {
      const img = new Image();
      images.current[i] = img;
      img.onload = () => {
        if (cancelled) return;
        done += 1;
        if (i === 0) draw(0);
        if (done === n) setLoading(false);
      };
      img.onerror = () => {
        if (cancelled) return;
        done += 1;
        if (done === n) setLoading(false);
      };
      const src = tourVillaUrl(tour, type, folder, i);
      if (!src) {
        done += 1;
        if (done === n) setLoading(false);
        continue;
      }
      img.src = src;
    }
    const onResize = () => draw(idxRef.current);
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [type, folder, draw, tour]);

  useEffect(() => {
    draw(idx);
  }, [idx, draw]);

  const spin = (dir: 1 | -1) => setIdx((v) => (v + dir + tour.villaFrames) % tour.villaFrames);

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
  const [gal, setGal] = useState(0);
  const [facade, setFacade] = useState(0);
  const spinFolder = tab === "floor3d" ? floor : COMPLEX.villa360.whole;
  const show360 = tab === "floor3d" || tab === "model360";
  const gallery = tour.gallery;
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
            <button type="button" className={tab === "exterior" ? "on" : ""} onClick={() => setTab("exterior")}>Exterior</button>
            <button type="button" className={tab === "facade" ? "on" : ""} onClick={() => setTab("facade")}>Facade</button>
          </nav>
        </div>
      </header>

      <div className="detail-body">
        <div className="detail-stage">
          {show360 && <Spin360 type={unit.type} folder={spinFolder} />}
          {tab === "exterior" && mediaSrc(gallery[gal]) ? <img className="still" src={gallery[gal]} alt="" /> : null}
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
          {tab === "exterior" && (
            <div className="still-nav">
              <div className="spin">
                <button type="button" onClick={() => setGal((v) => (v + gallery.length - 1) % gallery.length)}>‹</button>
                <span>{gal + 1}/{gallery.length}</span>
                <button type="button" onClick={() => setGal((v) => (v + 1) % gallery.length)}>›</button>
              </div>
              <div className="thumbs stage-thumbs">
                {gallery.map((src, n) => (
                  <button key={src} type="button" className={n === gal ? "on" : ""} onClick={() => setGal(n)}>
                    {mediaSrc(src) ? <img src={src} alt="" /> : null}
                  </button>
                ))}
              </div>
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
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const payload = {
      nom: String(fd.get("nom") || "").trim(),
      prenom: String(fd.get("prenom") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      tel: String(fd.get("tel") || "").trim(),
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
      <label>الاسم <input name="nom" required autoComplete="family-name" /></label>
      <label>اللقب <input name="prenom" required autoComplete="given-name" /></label>
      <label>البريد الإلكتروني <input name="email" type="email" required autoComplete="email" /></label>
      <label>رقم الهاتف <input name="tel" type="tel" required autoComplete="tel" /></label>
      {err && <p className="err">{err}</p>}
      {ok ? <p className="ok">تم الإرسال</p> : <button type="submit" disabled={busy}>{busy ? "..." : "إرسال"}</button>}
    </form>
  );
}
