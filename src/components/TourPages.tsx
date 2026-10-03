"use client";

import { useState } from "react";
import type { TourMedia } from "@/lib/tour";

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
}: {
  kicker: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="site-overlay" onClick={onClose}>
      <article className="site-page" onClick={(e) => e.stopPropagation()}>
        <header className="site-head" dir="rtl">
          <div>
            <p className="site-kicker">{kicker}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="site-close" onClick={onClose} aria-label="إغلاق">×</button>
        </header>
        <div className="site-body" dir="rtl">
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

export function GalleryPage({ tour, onClose }: { tour: TourMedia; onClose: () => void }) {
  const photos = tour.gallery.filter(Boolean);
  const [hero, setHero] = useState(0);
  const current = photos[hero];

  return (
    <SiteFrame kicker="المعرض" title="معرض المشروع" onClose={onClose}>
      <p className="site-lead">
        المشروع حيّ كامل صُمّم ليُعاش يومياً: شوارع مغروسة، حواف مائية، حدائق عائلية ومسجد في القلب.
        الصور مأخوذة من اللقطة الجوية نفسها التي تدور عليها في الجولة، حتى تتعرّف على الكتل والطرق
        والفراغات قبل أن تدخل أي فيلا.
      </p>
      <div className="site-view">
        {current ? <img src={current} alt="" /> : <div className="site-empty">ستظهر الصور هنا بعد رفعها للمشروع.</div>}
        {photos.length > 1 && (
          <div className="site-strip">
            {photos.map((src, i) => (
              <button key={src} type="button" className={i === hero ? "on" : ""} onClick={() => setHero(i)}>
                {mediaSrc(src) ? <img src={src} alt="" /> : null}
              </button>
            ))}
          </div>
        )}
      </div>
      <Accordion
        items={[
          {
            id: "streets",
            title: "الوصول والشوارع",
            hint: "كيف تدخل الحي",
            body: "الشوارع الداخلية وُسعت ثم زُرعت حتى تهدأ السيارة قبل باب الفيلا. لكل وحدة عنوان واضح، ومواقف الزوار مفصولة عن الحدائق الخاصة حتى لا يُقطع الهدوء. قارن الصورة مع الجولة ثلاثية الأبعاد: المنحنى نفسه والأشجار نفسها والمدخل نفسه.",
          },
          {
            id: "heart",
            title: "قلب المجمع",
            hint: "المسجد والمساحات الخضراء",
            body: "المسجد والمباني المشتركة وُضعت في المركز الهندسي للمشروع، لا على الهامش. الحياة اليومية — الصلاة، اللقاء، لعب الأطفال — تبقى داخل الأسوار. المساحات الخضراء تربط الكتل السكنية ببعضها بدل أن تفصلها جدران صماء.",
          },
          {
            id: "water",
            title: "الماء والحدائق",
            hint: "واجهات هادئة",
            body: "حيث يلتقي المخطط بالماء أو بالتشجير الكثيف، تنفتح الفلل على واجهة أهدأ. هذه الحافة هي نفسها التي تدور حولها في الجولة: حرّك الصورة يميناً ويساراً حتى تتطابق مع اللقطة، ثم انقر الفيلا التي تهمّك.",
          },
          {
            id: "arch",
            title: "عمارة واحدة",
            hint: "أنواع الفلل",
            body: "تكرار الأنواع يحافظ على خط سماء هادئ. المواد والأسقف والأفنية متناسقة حتى يُقرأ الحيّ مكاناً واحداً. الخامات الفاتحة والظلال المدروسة تخفّف الحرارة وتعطي لكل بيت خصوصية دون عزلة.",
          },
        ]}
      />
      <p className="site-foot">إذا أعجبتك صورة، عُد إلى الجوية ودوّر حتى تظهر الكتلة نفسها، ثم انقر الفيلا. المعرض يروي القصة، والجولة هي الخريطة.</p>
    </SiteFrame>
  );
}

export function LocationPage({ tour, onClose }: { tour: TourMedia; onClose: () => void }) {
  const q = encodeURIComponent(tour.locationQuery || tour.name);
  const mapsSrc = `https://maps.google.com/maps?q=${q}&z=15&output=embed`;
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const [tab, setTab] = useState<"place" | "around" | "map">("place");
  const name = tour.name;
  const shots = shotsOf(tour);

  return (
    <SiteFrame kicker="الموقع" title="موضع مدروس للسكن" onClose={onClose}>
      <div className="site-tabs">
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
      {tab === "map" && (
        <div className="site-panel">
          <p>
            المستطيل أدناه خريطة حيّة لموقع المشروع. قرّب وحرّك لفهم طرق الاقتراب، ثم ارجع إلى الجولة
            الجوية: الزاوية نفسها تراها وأنت تدور بالأسهم أو باليد.
          </p>
          <div className="site-map">
            <iframe title={`خريطة ${name}`} src={mapsSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
          <a className="site-map-link" href={mapsLink} target="_blank" rel="noreferrer">فتح الموقع في خرائط Google</a>
        </div>
      )}
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
                <p><strong>الخارج (Exterior)</strong> — صور ثابتة لمحيط الفيلا. استخدم الأسهم أو المصغّرات أسفل الصورة للتنقّل بين اللقطات.</p>
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
