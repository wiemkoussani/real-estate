/**
 * Anonymous tour analytics (browser side).
 * A random device id lives in localStorage; nothing personal is sent.
 * Every opening of the tour counts as a new visit; unique visitors are counted per device.
 */

let visitId: number | null = null;
let visitorId = "";
let slugRef = "";
let visibleMs = 0;
let visibleSince: number | null = null;
let listening = false;

function deviceId() {
  try {
    let id = localStorage.getItem("axis-visitor");
    if (!id) {
      // randomUUID is missing on plain-http LAN testing (not a secure context)
      id = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem("axis-visitor", id);
    }
    return id;
  } catch {
    return "";
  }
}

/** Where the visitor came from: ?src= / utm_source first, then the referring site. */
export function detectSource(): string {
  const params = new URLSearchParams(window.location.search);
  const tag = (params.get("src") || params.get("utm_source") || "").toLowerCase();
  const known = ["qr", "facebook", "instagram", "whatsapp", "google", "tiktok", "snapchat", "x", "email"];
  if (tag) return known.includes(tag) ? tag : tag === "fb" ? "facebook" : tag === "ig" ? "instagram" : "other";
  let host = "";
  try {
    host = document.referrer ? new URL(document.referrer).hostname : "";
  } catch {
    host = "";
  }
  if (!host || host === window.location.hostname) return "direct";
  if (/facebook|fb\.|messenger/.test(host)) return "facebook";
  if (/instagram/.test(host)) return "instagram";
  if (/whatsapp|wa\.me/.test(host)) return "whatsapp";
  if (/google\./.test(host)) return "google";
  if (/tiktok/.test(host)) return "tiktok";
  if (/snapchat/.test(host)) return "snapchat";
  if (/(^|\.)t\.co$|twitter|x\.com/.test(host)) return "x";
  return "other";
}

export function detectDevice() {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS reports as Mac
  const tablet = /iPad|Tablet/.test(ua) || touchMac || (/Android/.test(ua) && !/Mobile/.test(ua));
  const device = tablet ? "tablet" : /Mobi|iPhone|Android/.test(ua) ? "mobile" : "desktop";
  const os = /iPhone|iPad|iPod/.test(ua) || touchMac ? "iOS"
    : /Android/.test(ua) ? "Android"
      : /Windows/.test(ua) ? "Windows"
        : /Mac OS X|Macintosh/.test(ua) ? "macOS"
          : /Linux/.test(ua) ? "Linux"
            : "Other";
  return { device, os };
}

function send(body: Record<string, unknown>) {
  const json = JSON.stringify({ ...body, visitId, visitorId, slug: slugRef });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([json], { type: "text/plain" }))) return;
  } catch {
    /* fall through */
  }
  void fetch("/api/track", { method: "POST", body: json, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

function flushDuration() {
  if (visibleSince !== null) {
    visibleMs += Date.now() - visibleSince;
    visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  }
  if (visitId && visibleMs > 0) send({ type: "duration", seconds: Math.round(visibleMs / 1000) });
}

/** Tour opened: register (or continue) the visit and start timing visible time. */
let startedFor = "";
export async function startVisit(slug: string) {
  // one page load = one visit (React may run the opening effect twice in development)
  if (startedFor === slug) return;
  startedFor = slug;
  slugRef = slug;
  visitorId = deviceId();
  if (!visitorId) return;
  const { device, os } = detectDevice();
  try {
    const res = await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, visitorId, source: detectSource(), device, os }),
      keepalive: true,
    });
    const json = await res.json().catch(() => ({}));
    visitId = typeof json.visitId === "number" ? json.visitId : null;
  } catch {
    visitId = null;
  }
  visibleMs = 0;
  visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDuration();
    else visibleSince = Date.now();
  });
  window.addEventListener("pagehide", flushDuration);
}

/** A villa was open for `seconds`. */
export function trackUnitView(villa: string, seconds: number) {
  if (!visitorId || !villa) return;
  send({ type: "view", villa, seconds: Math.max(0, Math.round(seconds)) });
}

/** The visitor liked a villa (heart). */
export function trackFavorite(villa: string) {
  if (!visitorId || !villa) return;
  send({ type: "favorite", villa });
}
