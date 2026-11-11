import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";

const ID_OK = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_VISIT_S = 4 * 3600;
const MAX_VIEW_S = 3600;

/**
 * Beacon from the public tour: visible time of the visit, a villa viewed (with time), or a villa liked.
 * Sent with navigator.sendBeacon, so the body arrives as text.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(await req.text());
  } catch {
    body = null;
  }
  const visitorId = String(body?.visitorId ?? "");
  const visitId = Number(body?.visitId);
  const type = String(body?.type ?? "");
  if (!ID_OK.test(visitorId) || !Number.isInteger(visitId) || visitId <= 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const service = createServiceSupabase();
  if (!service) return NextResponse.json({ ok: false });

  // the visit must belong to this device
  const { data: visit } = await service
    .from("complex_visits")
    .select("id, complex_id, duration_s")
    .eq("id", visitId)
    .eq("visitor_id", visitorId)
    .maybeSingle();
  if (!visit) return NextResponse.json({ ok: false }, { status: 404 });

  const seconds = Math.max(0, Math.min(Math.round(Number(body?.seconds) || 0), type === "view" ? MAX_VIEW_S : MAX_VISIT_S));

  if (type === "duration") {
    if (seconds > (visit.duration_s ?? 0)) {
      await service.from("complex_visits").update({ duration_s: seconds }).eq("id", visit.id);
    }
    return NextResponse.json({ ok: true });
  }

  if (type === "view" || type === "favorite") {
    const villa = String(body?.villa ?? "").trim().slice(0, 40);
    if (!villa) return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await service.from("unit_events").insert({
      complex_id: visit.complex_id,
      visit_id: visit.id,
      visitor_id: visitorId,
      unit_display_id: villa,
      kind: type,
      duration_s: type === "view" ? seconds : 0,
    });
    return NextResponse.json({ ok: !error });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
