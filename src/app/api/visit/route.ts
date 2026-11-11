import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

const ID_OK = /^[a-zA-Z0-9-]{8,64}$/;
const GAP_MS = 60 * 60 * 1000;
const SOURCES = ["direct", "qr", "facebook", "instagram", "whatsapp", "google", "tiktok", "snapchat", "x", "email", "other"];
const DEVICES = ["mobile", "desktop", "tablet"];
const OSES = ["iOS", "Android", "Windows", "macOS", "Linux", "Other"];

const pick = (v: unknown, allowed: string[]) => (allowed.includes(String(v)) ? String(v) : null);

/** City/country from the host (Vercel adds these headers); no IP address is kept. */
function geo(req: Request) {
  const dec = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v).slice(0, 80);
    } catch {
      return v.slice(0, 80);
    }
  };
  return {
    city: dec(req.headers.get("x-vercel-ip-city")),
    country: dec(req.headers.get("x-vercel-ip-country")),
  };
}

/**
 * Public tour opened. The same device counts as a new visit only if its last counted visit
 * is at least 1 hour old; either way the current visit id is returned for duration / villa tracking.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const slug = String(body?.slug ?? "");
  const visitorId = String(body?.visitorId ?? "");
  if (!slug || !ID_OK.test(visitorId)) return NextResponse.json({ ok: false }, { status: 400 });

  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ ok: false });
  const { data: cx } = await service.from("complexes").select("id").eq("slug", slug).maybeSingle();
  if (!cx) return NextResponse.json({ ok: false });

  // Staff and the project's own clients looking at their tour are not visitors.
  const server = await createServerSupabase();
  const user = server ? (await server.auth.getUser()).data.user : null;
  if (user) {
    const [{ data: profile }, { data: member }] = await Promise.all([
      service.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      service.from("complex_members").select("profile_id").eq("complex_id", cx.id).eq("profile_id", user.id).maybeSingle(),
    ]);
    if (profile?.role === "admin" || member) return NextResponse.json({ ok: true, skipped: true, visitId: null });
  }

  const since = new Date(Date.now() - GAP_MS).toISOString();
  const { data: recent } = await service
    .from("complex_visits")
    .select("id")
    .eq("complex_id", cx.id)
    .eq("visitor_id", visitorId)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent?.length) return NextResponse.json({ ok: true, counted: false, visitId: recent[0].id });

  const base = { complex_id: cx.id, visitor_id: visitorId };
  const details = {
    ...base,
    source: pick(body?.source, SOURCES) ?? "direct",
    device: pick(body?.device, DEVICES),
    os: pick(body?.os, OSES),
    ...geo(req),
  };
  let { data, error } = await service.from("complex_visits").insert(details).select("id").single();
  if (error) {
    // analytics columns not created yet (migration 014): still count the visit
    ({ data, error } = await service.from("complex_visits").insert(base).select("id").single());
  }
  return NextResponse.json({ ok: !error, counted: !error, visitId: data?.id ?? null });
}
