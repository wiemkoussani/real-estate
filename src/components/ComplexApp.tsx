"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from "react";
import { COMPLEX, UNIT_MODELS, formatSar, modelOf, type Unit, type UnitStatus } from "@/lib/complex";
import { buildTour, emptyTour, tourPlanUrl, tourVillaUrl, type TourMedia } from "@/lib/tour";
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
    let cancelled = false;
    const apply = (next: TourMedia) => {
      if (!cancelled) setTour(next);
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
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
  const [scene360Open, setScene360Open] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const rotateHoldRef = useRef<number | null>(null);
  const stripDragRef = useRef(false);
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
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => {
      if (mq.matches) {
        setListOpen(false);
        setFiltersOpen(false);
      } else {
        setListOpen(true);
      }
      setLayoutReady(true);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = tour.locationQuery || tour.name;
    if (!q) return;
    const hasExact = Number.isFinite(tour.locationLat) && Number.isFinite(tour.locationLng);
    const key = hasExact
      ? `poi-map-v6:${tour.locationLat.toFixed(5)},${tour.locationLng.toFixed(5)}`
      : `poi-map-v6:${q}`;
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
      ? `/api/maps/around?lat=${tour.locationLat}&lng=${tour.locationLng}&address=${encodeURIComponent(q)}&light=1&pins=2`
      : `/api/maps/around?q=${encodeURIComponent(q)}&light=1&pins=2`;
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
    engineRef.current?.setStatusFilter(status);
  }, [status, ready]);

  useEffect(() => {
    engineRef.current?.setPanMode(panMode);
  }, [panMode, ready]);

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
      .filter((u) => !favOnly || favs.includes(u.id))
      .sort((a, b) => a.displayId.localeCompare(b.displayId, undefined, { numeric: true }));
  }, [units, areaMax, floorMax, priceMin, priceMax, status, selectedModels, selectedRooms, favOnly, favs]);

  // Phone dock: color the villa for the centered card and rotate longitude if needed.
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || !ready) return;
    dockFacedIdRef.current = null;
    let timer: number | null = null;
    let facing = false;

    const syncFacedUnit = () => {
      if (facing) return;
      if (typeof window === "undefined") return;
      if (!window.matchMedia("(max-width: 1100px)").matches) return;
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
      const en = engineRef.current;
      if (!en) return;
      facing = true;
      void en.faceUnit(bestId).finally(() => {
        facing = false;
      });
    };

    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(syncFacedUnit, 140);
    };

    dock.addEventListener("scroll", onScroll, { passive: true });
    const boot = window.setTimeout(syncFacedUnit, 80);
    return () => {
      dock.removeEventListener("scroll", onScroll);
      window.clearTimeout(boot);
      if (timer) window.clearTimeout(timer);
    };
  }, [ready, filtered, scene360Strip, scene360Open, tourUnit]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("axis-favs", JSON.stringify(next));
      return next;
    });
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
    if (window.matchMedia("(max-width: 1100px)").matches) {
      setToolsOpen((v) => !v);
    } else {
      setListOpen(true);
    }
  };

  const openFilters = () => {
    setFormOpen(false);
    if (window.matchMedia("(max-width: 1100px)").matches) {
      setFiltersOpen((v) => !v);
      return;
    }
    setFiltersOpen(true);
    setListOpen(true);
  };

  const openScene360 = () => {
    setFormOpen(false);
    setFiltersOpen(false);
    const phone = window.matchMedia("(max-width: 1100px)").matches;
    setScene360Strip((open) => {
      if (open) {
        setScene360Open(false);
        setActiveSceneId(null);
        return false;
      }
      if (phone) setListOpen(false);
      setScene360Open(false);
      setActiveSceneId(tour.scenes360[0]?.id ?? null);
      return true;
    });
  };

  const openScene360View = (id: string) => {
    if (stripDragRef.current) return;
    setActiveSceneId(id);
    setScene360Open(true);
  };

  const stripScrollCleanup = useRef<(() => void) | null>(null);
  const stripRef = useCallback((node: HTMLDivElement | null) => {
    stripScrollCleanup.current?.();
    stripScrollCleanup.current = null;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) && e.deltaX === 0) return;
      e.preventDefault();
      node.scrollLeft += e.deltaY + e.deltaX;
    };
    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let activePointer: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
        if (Math.abs(dx) < 8) return;
        dragging = true;
        stripDragRef.current = true;
        node.setPointerCapture(e.pointerId);
        node.classList.add("is-dragging");
      }
      node.scrollLeft = startScroll - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (activePointer !== null && e.pointerId !== activePointer) return;
      tracking = false;
      activePointer = null;
      if (dragging) {
        dragging = false;
        node.classList.remove("is-dragging");
        window.setTimeout(() => {
          stripDragRef.current = false;
        }, 40);
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("pointerdown", onDown);
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
    node.addEventListener("pointercancel", onUp);
    stripScrollCleanup.current = () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const closeScene360 = () => {
    setScene360Open(false);
    // Keep the strip open so the user can pick another scene.
  };

  const activeScene = tour.scenes360.find((s) => s.id === activeSceneId) || null;

  const openUnit = (u: Unit) => {
    void pickUnit(u);
  };

  return (
    <div className={`app${toolsOpen ? " tools-on" : ""}${layoutReady ? " layout-ready" : ""}${filtersOpen ? " filters-open" : ""}${scene360Strip ? " strip360-on" : ""}${scene360Open ? " scene360-mode" : ""}`}>
      {!ready && (
        <div className="boot">
          {tour.logoUrl ? <img src={tour.logoUrl} alt={tour.name} /> : <p>{tour.name}</p>}
          <div className="boot-bar"><span style={{ width: `${loadPct}%` }} /></div>
          <p>{loadPct}%</p>
        </div>
      )}
      <aside className={`panel ${listOpen && !scene360Open ? "open" : ""} ${formOpen ? "form-wide" : ""} ${filtersOpen ? "filters-on" : ""}`}>
        <button
          className="peek"
          type="button"
          onClick={() => {
            setListOpen((v) => {
              if (v) setFiltersOpen(false);
              return !v;
            });
          }}
          aria-label={listOpen ? "Ranger la liste" : "Ouvrir la liste"}
        >
          {listOpen ? "‹" : "›"}
        </button>
        <div className={`panel-inner ${formOpen ? "form-mode" : ""}`}>
          {formOpen ? (
            <ContactSidebar unit={selected} onBack={() => setFormOpen(false)} />
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
                  <b>{tour.name}</b>
                </div>
              )}
            </div>
            <button type="button" className="panel-x" onClick={() => setListOpen(false)} aria-label="Close">×</button>
          </header>
          <div className="panel-toolbar">
            <div className="panel-actions-ring">
              <button type="button" className={`tool-fab heart-fab ${favOnly ? "on" : ""}`} onClick={() => setFavOnly((v) => !v)} title="Favorites" aria-label="Favorites">
                <IconHeart size={18} filled={favOnly} />
                {favs.length > 0 ? <span className="fav-count">{favs.length}</span> : null}
              </button>
              <button type="button" className={`tool-fab filter-fab ${filtersOpen ? "on" : ""}`} onClick={() => setFiltersOpen((v) => !v)} title="Filters" aria-label="Filters">
                <IconFilters size={16} />
              </button>
            </div>
          </div>
          <div className="units cards">
            {filtered.map((u) => {
              const photo = cardPhoto(tour, u);
              const liked = favs.includes(u.id);
              return (
              <button
                key={u.id}
                type="button"
                className={`unit ${selected?.id === u.id ? "sel" : ""}`}
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
                    <IconHeart size={11} filled={liked} />
                  </span>
                </div>
                <div className="card-copy">
                  <div className="card-top">
                    <strong>{u.displayId}</strong>
                    <em className={`badge ${u.status}`}>{STATUS_AR[u.status]}</em>
                  </div>
                  <span className="card-price">{formatSar(unitPrice(u))}</span>
                  <div className="card-specs">
                    <span><b>{u.rooms}</b><small>غرف النوم</small></span>
                    <span><b>{u.surface}</b><small>المساحة</small></span>
                    <span><b>{u.floor}</b><small>الطوابق</small></span>
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

      {filtersOpen && !scene360Open && (
        <div className="filters-flyout" dir="rtl" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <header className="filters-head">
            <h2><IconFilters size={16} /> تصفية النتائج</h2>
            <button type="button" className="filters-back" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <IconClose size={18} />
            </button>
          </header>
          <div className="filters filters-rich">
            <section>
              <h3>حالة الوحدة</h3>
              <div className="status-pills">
                <button
                  type="button"
                  className={`status-pill all ${status === "all" ? "on" : ""}`}
                  onClick={() => setStatus("all")}
                >
                  <span className="status-label">كل الوحدات</span>
                </button>
                {(["available", "reserved", "sold"] as UnitStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`status-pill ${s} ${status === s ? "on" : ""}`}
                    onClick={() => setStatus(s)}
                  >
                    <span className="status-label">{STATUS_AR[s]}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="filter-area">
              <div className="filter-area-head">
                <h3>المساحة</h3>
                <em className="range-readout" dir="ltr">
                  {Math.round(areaMax).toLocaleString("en-US")}
                </em>
              </div>
              <label className="range-single" dir="rtl">
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
            <section className="filter-area">
              <div className="filter-area-head">
                <h3>السعر</h3>
                <em className="range-readout" dir="ltr">
                  ر.س {Math.round(priceMax).toLocaleString("en-US")}
                </em>
              </div>
              <label className="range-single" dir="rtl">
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
            <section>
              <h3>عدد الغرف</h3>
              <div className="chip-row">
                <button
                  type="button"
                  className={`filter-chip ${selectedRooms.length === 0 ? "on" : ""}`}
                  onClick={() => setSelectedRooms([])}
                >
                  الكل
                </button>
                {bounds.rooms.map((n) => (
                  <button key={n} type="button" className={`filter-chip ${selectedRooms.includes(n) ? "on" : ""}`} onClick={() => toggleRoom(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h3>النموذج</h3>
              <div className="chip-row">
                {bounds.models.map((code) => (
                  <button key={code} type="button" className={`filter-chip ${selectedModels.includes(code) ? "on" : ""}`} onClick={() => toggleModel(code)}>
                    {code}
                  </button>
                ))}
              </div>
            </section>
            <button type="button" className="filters-reset-btn" onClick={resetFilters}>إعادة تعيين</button>
          </div>
        </div>
      )}

      <div className="stage" ref={stageRef}>
        <canvas ref={bgRef} className="layer bg" />
        <canvas ref={bgNextRef} className="layer bg-next" />
        <canvas ref={threeRef} className="layer webgl" />

        {hover && hoverPos && !tourUnit && !scene360Open && (
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
              <button
                type="button"
                className="compact-logo"
                title={tour.name}
                aria-label={tour.name}
                onClick={() => {
                  setFormOpen(false);
                  setFiltersOpen(false);
                  setListOpen(true);
                }}
              >
                <span className="agency-logo compact-agency-logo">
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
              </button>
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
              <span className="rail-ico project"><IconApps size={16} /></span>
              <span className="rail-hint" aria-hidden>
                <IconChevronDown size={14} />
                <IconChevronDown size={14} />
              </span>
            </button>
            <button type="button" className="rail-fab" onClick={() => { setFormOpen(true); setListOpen(true); }}>
              <span className="rail-name">تواصل</span>
              <span className="rail-ico glass"><IconMail size={15} /></span>
            </button>
            <button type="button" className="rail-fab" onClick={() => setGalleryOpen(true)}>
              <span className="rail-name">المعرض</span>
              <span className="rail-ico glass"><IconGallery size={15} /></span>
            </button>
            <button type="button" className="rail-fab" onClick={() => setLocationOpen(true)}>
              <span className="rail-name">الموقع</span>
              <span className="rail-ico glass"><IconPin size={15} /></span>
            </button>
            <button type="button" className="rail-fab" onClick={() => setHelpOpen(true)}>
              <span className="rail-name">مساعدة</span>
              <span className="rail-ico glass"><IconHelp size={15} /></span>
            </button>
          </div>
        </nav>

        {!scene360Open && (
          <div
            className={`hud${scene360Strip ? " strip360-on" : ""}`}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {scene360Strip && (
              <div className="scene360-strip-dock open">
                <div className="scene360-strip" role="list" dir="ltr" ref={stripRef}>
                  {tour.scenes360.length ? (
                    tour.scenes360.map((scene) => (
                      <button
                        key={scene.id}
                        type="button"
                        role="listitem"
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
              <button type="button" title="Zoom out" onClick={() => engineRef.current?.zoomBy(-COMPLEX.zoomStep)}>
                <IconMinus size={17} />
              </button>
              <button type="button" title="Zoom in" onClick={() => engineRef.current?.zoomBy(COMPLEX.zoomStep)}>
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

        {scene360Open && (
          <>
            <button
              type="button"
              className="scene360-back"
              onClick={closeScene360}
              title="Retour"
              aria-label="Retour au tour"
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
              <div className="scene360-strip" role="list" dir="ltr" ref={stripRef}>
                {tour.scenes360.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    role="listitem"
                    className={`scene360-thumb${activeScene?.id === scene.id ? " on" : ""}`}
                    onClick={() => {
                      if (stripDragRef.current) return;
                      setActiveSceneId(scene.id);
                    }}
                    aria-label={scene.label || "360 scene"}
                  >
                    <img src={scene.thumbUrl || scene.url} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div
        ref={dockRef}
        className={`dock units cards${scene360Strip || scene360Open ? " tuck" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        aria-hidden={scene360Strip || scene360Open}
      >
        {filtered.map((u) => {
          const photo = cardPhoto(tour, u);
          const liked = favs.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              data-unit-id={u.id}
              className={`unit ${selected?.id === u.id ? "sel" : ""}`}
              onMouseEnter={() => engineRef.current?.setPreview(u.id)}
              onMouseLeave={() => engineRef.current?.setPreview(null)}
              onClick={() => openUnit(u)}
              tabIndex={scene360Strip || scene360Open ? -1 : 0}
            >
              <div className="card-side">
                {photo ? <img src={photo} alt="" /> : <span className="card-img-fallback" />}
                <span
                  className={liked ? "heart on" : "heart"}
                  onClick={(e) => { e.stopPropagation(); toggleFav(u.id); }}
                >
                  <IconHeart size={11} filled={liked} />
                </span>
              </div>
              <div className="card-copy">
                <div className="card-top">
                  <strong>{u.displayId}</strong>
                  <em className={`badge ${u.status}`}>{STATUS_AR[u.status]}</em>
                </div>
                <span className="card-price">{formatSar(unitPrice(u))}</span>
                <div className="card-specs">
                  <span><b>{u.rooms}</b><small>غرف النوم</small></span>
                  <span><b>{u.surface}</b><small>المساحة</small></span>
                  <span><b>{u.floor}</b><small>الطوابق</small></span>
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
            <div><span>Model</span><b>{modelOf(unit)}</b></div>
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
