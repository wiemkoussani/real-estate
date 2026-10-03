"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { TourMedia } from "@/lib/tour";

const AroundMap = dynamic(() => import("@/components/AroundMap").then((m) => m.AroundMap), {
  ssr: false,
  loading: () => <div className="poi-status">Loading map…</div>,
});

function mediaSrc(url: string | undefined | null) {
  return url ? url : undefined;
}

function shotsOf(tour: TourMedia) {
  const gallery = tour.gallery.filter(Boolean);
  const aerial = tour.framesLow[0] || tour.framesHigh[0] || gallery[0];
  const night = [...gallery].reverse().find((g) => g !== aerial) || gallery[2] || gallery[1];
  const street = gallery.find((g, i) => i >= 2 && g !== aerial && g !== night) || gallery[3] || gallery[1];
  const entries = Object.entries(tour.villa360);
  const cutaway = entries.find(([k]) => /tout/i.test(k))?.[1];
  const floor = entries.find(([k]) => /rdc|etage/i.test(k))?.[1];
  const interior = floor || cutaway || Object.values(tour.villa360)[0] || gallery[1];
  return { gallery, aerial, night, street, cutaway: cutaway || interior, interior };
}

function PhotoGrid({ urls, tall }: { urls: (string | undefined)[]; tall?: boolean }) {
  const list = [...new Set(urls.filter((u): u is string => Boolean(u)))].slice(0, tall ? 3 : 4);
  if (!list.length) return null;
  return (
    <div className={`site-photos n${list.length}${tall ? " tall" : ""}`}>
      {list.map((src) => (
        <img key={src} src={src} alt="" />
      ))}
    </div>
  );
}

function SiteFrame({
  kicker,
  title,
  onClose,
  children,
  wide,
  flush,
}: {
  kicker: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  flush?: boolean;
}) {
  return (
    <div className="site-overlay" onClick={onClose}>
      <article className={`site-page${wide ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <header className="site-head" dir="rtl">
          <div>
            <p className="site-kicker">{kicker}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="site-close" onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        <div className={`site-body${flush ? " flush" : ""}`} dir={flush ? "ltr" : "rtl"}>
          {children}
        </div>
      </article>
    </div>
  );
}

function Accordion({
  items,
  defaultOpen,
}: {
  items: { id: string; title: string; hint: string; body: React.ReactNode }[];
  defaultOpen?: string;
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? items[0]?.id ?? null);
  return (
    <div className="site-acc">
      {items.map((item) => {
        const on = open === item.id;
        return (
          <div key={item.id} className={`site-acc-item ${on ? "on" : ""}`}>
            <button type="button" className="site-acc-top" onClick={() => setOpen(on ? null : item.id)}>
              <strong>{item.title}</strong>
              <small>{item.hint}</small>
            </button>
            {on && <div className="site-acc-body">{item.body}</div>}
          </div>
        );
      })}
    </div>
  );
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function GalBoard({
  title,
  items,
  onPick,
  onFail,
}: {
  title?: string;
  items: string[];
  onPick: (src: string) => void;
  onFail: (src: string) => void;
}) {
  return (
    <section className={`gal-board n${items.length}`}>
      {title ? <p className="gal-board-title">{title}</p> : null}
      {items.map((src, i) => (
        <button key={src} type="button" className={`gal-cell c${i}`} onClick={() => onPick(src)}>
          <img src={src} alt="" onError={() => onFail(src)} />
        </button>
      ))}
    </section>
  );
}

export function GalleryPage({ tour, onClose }: { tour: TourMedia; onClose: () => void }) {
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [open, setOpen] = useState<string | null>(null);
  const live = (list: string[]) => [...new Set(list.filter((src) => src && !failed[src]))];
  const hero = live([tour.galleryHero])[0];
  const exteriorBoards = chunk(live(tour.galleryExterior), 6);
  const interiorBoards = chunk(live(tour.galleryInterior), 6);
  const fail = (src: string) => setFailed((f) => ({ ...f, [src]: true }));

  return (
    <div className="site-overlay" onClick={onClose}>
      <article className="gal-stage" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="gal-close" onClick={onClose} aria-label="إغلاق">×</button>
        <div className="gal-scroll">
          <section className="gal-hero">
            {hero ? (
              <img src={hero} alt="" onError={() => fail(hero)} />
            ) : (
              <div className="site-empty">ستظهر الصور هنا بعد رفعها للمشروع.</div>
            )}
            {exteriorBoards.length + interiorBoards.length > 0 && <span className="gal-hint">اسحب للأسفل</span>}
          </section>
          {exteriorBoards.map((group, i) => (
            <GalBoard key={`ex-${group[0]}-${i}`} title={i === 0 ? "Exterior" : undefined} items={group} onPick={setOpen} onFail={fail} />
          ))}
          {interiorBoards.map((group, i) => (
            <GalBoard key={`in-${group[0]}-${i}`} title={i === 0 ? "Interior" : undefined} items={group} onPick={setOpen} onFail={fail} />
          ))}
        </div>
        {open && (
          <div className="gal-lite" onClick={() => setOpen(null)}>
            <img src={open} alt="" onClick={(e) => e.stopPropagation()} />
            <button type="button" className="gal-close" onClick={() => setOpen(null)}>×</button>
          </div>
        )}
      </article>
    </div>
  );
}

export function LocationPage({ tour, onClose }: { tour: TourMedia; onClose: () => void }) {
  const [tab, setTab] = useState<"place" | "around" | "map">("map");
  const shots = shotsOf(tour);
  const query = tour.locationQuery || tour.name;

  return (
    <SiteFrame kicker="الموقع" title="موضع مدروس للسكن" onClose={onClose} wide={tab === "map"} flush={tab === "map"}>
      <div className={`site-tabs${tab === "map" ? " map-in" : ""}`} dir="rtl">
        <button type="button" className={tab === "place" ? "on" : ""} onClick={() => setTab("place")}>الموضع الاستراتيجي</button>
        <button type="button" className={tab === "around" ? "on" : ""} onClick={() => setTab("around")}>ما حول الحي</button>
        <button type="button" className={tab === "map" ? "on" : ""} onClick={() => setTab("map")}>الخريطة</button>
      </div>
      {tab === "place" && (
        <div className="site-panel">
          <PhotoGrid tall urls={[shots.aerial, shots.street, shots.night]} />
          <p>
            يقع المشروع حيث يُفترض أن تكون الحياة اليومية بسيطة: قريباً بما يكفي من المدينة للعمل
            والمدرسة والصلاة، وبعيداً بما يكفي للهواء والحدائق وشارع مسوّر يستطيع الأطفال استخدامه.
            المخطط وُجّه للضوء وللوصول ولمدخل هادئ يُفهم من أول لحظة.
          </p>
          <p>
            المجمع حيّ مكتفٍ بمدخل واحد واضح. من البوابة تتفرع الطرق الداخلية نحو مجموعات الفلل،
            فلا يقطع سير الخدمات أهدأ الحدائق. المسجد والخضرة والماء علامات اهتداء، لا زينة فقط.
          </p>
        </div>
      )}
      {tab === "around" && (
        <div className="site-panel">
          <PhotoGrid urls={[shots.gallery[2], shots.gallery[3], shots.gallery[4], shots.gallery[5]]} />
          <div className="site-chips">
            <span>احتياجات يومية</span>
            <span>مدارس</span>
            <span>رعاية صحية</span>
            <span>طرق رئيسية</span>
            <span>مسجد داخل الأسوار</span>
          </div>
          <p>
            البقالة والصيدلية حلقة قصيرة متوقعة. المسجد والمباني المجتمعية في القلب الهندسي للحيّ،
            فالتجمّع لا يعني مغادرة المجمع. شبكة الشوارع رُسمت لإيصال الصباح وعودة المساء، مع فصل
            مواقف السيارات عن أفنية الفلل الخاصة.
          </p>
          <p>
            الأشجار والماء والارتدادات تُبرّد الشوارع وتُخفي السيارات وتعطي كل بيت منظراً مركّباً.
            الخدمات الإقليمية تبقى في مدى رحلة قصيرة دون أن تدخل الضوضاء إلى الحديقة.
          </p>
        </div>
      )}
      {tab === "map" && <AroundMap query={query} title={tour.name} />}
    </SiteFrame>
  );
}

export function HelpPage({ tour, onClose }: { tour: TourMedia; onClose: () => void }) {
  const shots = shotsOf(tour);
  return (
    <SiteFrame kicker="الدليل" title="كيفية استخدام الجولة من الجوّ إلى داخل الفيلا" onClose={onClose}>
      <PhotoGrid tall urls={[shots.aerial, shots.night, shots.cutaway]} />
      <p className="site-lead">
        هذه ليست فيديو. هذا نموذج حقيقي للحيّ تستطيع أن تديره وتقرّبه ثم تدخل إلى الفيلا كما يدخل الزائر
        مع المستشار. اضغط أي جزء أدناه. الأقسام الأخيرة تشرح ماذا تفعل بعد دخول الشقة من الداخل.
      </p>
      <Accordion
        defaultOpen="enter"
        items={[
          {
            id: "turn",
            title: "تدوير الصورة الجوية",
            hint: "اسحب أو الأسهم",
            body: "اضغط على الصورة واسحب يميناً أو يساراً للدوران حول المشروع. أنت تغيّر زاوية الكاميرا، لا تمرّر بانوراما. السحب البطيء يعطيك الواجهات بدقة؛ السحب الأطول يطوف حول كتلة كاملة. السهمان بجانب البوصلة يفعلان الحركة نفسها خطوة بخطوة.",
          },
          {
            id: "compass",
            title: "البوصلة",
            hint: "شمال · شمال شرق…",
            body: "الحرف على البوصلة هو الاتجاه الذي تنظر منه. انقر البوصلة للانتقال إلى الاتجاه الأصلي التالي. استخدمها حين تريد الجهة الغربية أو الشرقية دون تصفّح كل الإطارات يدوياً.",
          },
          {
            id: "zoom",
            title: "التكبير واليد",
            hint: "قرّب ثم حرّك",
            body: "زِرّا الزائد والناقص يكبّران الصورة أو يصغّرانها. لتحريك الصورة نفسها — لقراءة رقم فيلا أو تتبع شارع — اضغط أيقونة اليد. يصبح المؤشر قبضة: اسحب في أي اتجاه. اضغط اليد مرة أخرى للعودة إلى التدوير. إذا كانت اليد مفعّلة ولم تتحرك الصورة، قرّب مرة ثم اسحب.",
          },
          {
            id: "eye",
            title: "الألوان — العين",
            hint: "متاحة · محجوزة · مباعة",
            body: "العين تلوّن كل فيلا حسب حالة البيع: أخضر متاحة، كهرماني محجوزة، أحمر مباعة. مرّر فوق السقف ليتكثف اللون وتظهر بطاقة صغيرة. انقر مرة للاقتراب من البيت؛ انقر البيت نفسه مرة ثانية لدخول الجولة الداخلية. أطفئ العين حين تريد صورة نظيفة للعمارة.",
          },
          {
            id: "list",
            title: "قائمة الوحدات",
            hint: "الشريط الجانبي",
            body: "افتح الشريط لتصفح كل الوحدات. فلاتر المساحة والغرف والحالة والنوع تضيّق القائمة دون إخفاء الجوية. عرض القائمة جدول (الرقم، المساحة، الدور، الغرف). عرض البطاقات يعرض مخطط الفيلا في الدائرة. القلب يحفظ قائمة قصيرة في هذا المتصفح فقط. مرّر فوق صف فيُضاء البيت المطابق على النموذج.",
          },
          {
            id: "rail",
            title: "أيقونات الأعلى",
            hint: "أدوات المشروع",
            body: "الشريحة الخضراء هي المشروع نفسه. الرسالة تملأ الشريط الجانبي بنموذج طلب زيارة حتى تبقى الجوية ظاهرة. الموقع يفتح قصة المكان وخريطة Google. المعرض نافذة للصور الخارجية. الدليل هو هذه القائمة.",
          },
          {
            id: "enter",
            title: "كيف تدخل الشقة من الداخل",
            hint: "نقرتان من الجوّ",
            body: (
              <>
                <p>من الصورة الجوية: انقر الفيلا مرة فتقترب الكاميرا منها. انقرها مرة ثانية فيفتح عرض الفيلا الداخلي على الشاشة كاملة.</p>
                <p>يمكنك أيضاً فتح القائمة الجانبية واختيار الوحدة من الجدول أو من البطاقة — النتيجة نفسها: تدخل إلى داخل ذلك البيت.</p>
                <p>بعد الدخول ترى مساحة كبيرة للصور، وعلى الجانب بطاقة الوحدة (المساحة، الغرف، الدور، النوع) ومخطط الفيلا ونموذج طلب اهتمام.</p>
              </>
            ),
          },
          {
            id: "inside-tabs",
            title: "ماذا تستطيع أن تفعل داخل الفيلا",
            hint: "أربع نوافذ في الأعلى",
            body: (
              <>
                {shots.interior ? <img className="site-acc-shot" src={shots.interior} alt="" /> : null}
                <p>شريط التبويب أعلى الصورة يغيّر طريقة النظر إلى البيت. كل تبويب عمل واحد:</p>
                <p><strong>مخطط ثلاثي الأبعاد (Floorplan 3D)</strong> — تجول داخل الطابق كما لو وقفت في الغرفة. اسحب يميناً ويساراً لتدور حول نفسك بزاوية 360. الأزرار العائمة تختار الطابق: الأرضي، الأول، أو الأخير. كل طابق مجموعة صور مختلفة للغرف والمعيشة والسلالم.</p>
                <p><strong>نموذج 360 (Model 360)</strong> — نظرة شاملة للنموذج الداخلي. اسحب لتدور حول الكتلة من الداخل وترى توزيع الفراغات دفعة واحدة.</p>
                <p><strong>الواجهة (Facade)</strong> — الواجهات الأربع للبيت. اختر الواجهة من الأزرار العائمة لترى كيف يبدو المنزل من الشارع أو الحديقة.</p>
              </>
            ),
          },
          {
            id: "inside-drag",
            title: "كيف تستخدم الـ 360 في الداخل",
            hint: "اسحب كما تحرّك رأسك",
            body: (
              <>
                <p>ضع المؤشر على الصورة، اضغط باستمرار، ثم اسحب أفقياً. الحركة البطيئة تعرض الجدران والنوافذ والأثاث بدقة؛ الحركة الأسرع تلف الغرفة كاملة. اترك الزر لتتوقف الصورة حيث أنت.</p>
                <p>على الهاتف: المس بإصبع واحد واسحب. لا حاجة لأزرار إضافية. إن تغيّر الطابق من الأزرار، تبدأ الجولة من إطار ذلك الطابق — اسحب من جديد لاستكشاف الغرف.</p>
                <p>هذا ليس فيديو يُشغَّل. أنت تتحكم بالزاوية كما لو كنت واقفاً في الفيلا مع المستشار وتلتفت يميناً ويساراً.</p>
              </>
            ),
          },
          {
            id: "inside-leave",
            title: "الخروج والعودة إلى الجوّ",
            hint: "السهم أعلى اليسار",
            body: "زر الرجوع أعلى شاشة الفيلا يغلق الداخل ويعيدك إلى الصورة الجوية على الزاوية نفسها التي غادرتها. لا يضيع شيء من الحي؛ لقد دخلت فقط إلى البيت ثم خرجت. يمكنك دخول فيلا أخرى بالنقرة المزدوجة من جديد.",
          },
        ]}
      />
    </SiteFrame>
  );
}
