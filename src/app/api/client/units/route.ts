import { NextResponse } from "next/server";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";
import type { UnitStatus } from "@/lib/types";

const allowed: UnitStatus[] = ["available", "reserved", "sold"];
const MAX_PRICE = 1_000_000_000;

/** The unit must belong to one of this client's projects. */
async function ownedUnit(id: string) {
  const auth = await requireClient();
  if (!auth.ok) return { error: auth.response };
  if (!id) return { error: NextResponse.json({ error: "Invalid unit" }, { status: 400 }) };
  const service = createServiceSupabase() ?? auth.supabase;
  const { data: unit } = await service.from("units").select("id, complex_id").eq("id", id).maybeSingle();
  if (!unit) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const projects = await listComplexIdsForUser(service, auth.user.id);
  if (!projects.includes(unit.complex_id)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { service, unit };
}

/** Change a villa's status and/or price. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const res = await ownedUnit(String(body?.id ?? ""));
  if ("error" in res) return res.error;

  const patch: { status?: UnitStatus; price?: number } = {};
  if (body?.status !== undefined) {
    if (!allowed.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    patch.status = body.status;
  }
  if (body?.price !== undefined) {
    const price = Math.round(Number(body.price));
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }
    patch.price = price;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { error } = await res.service.from("units").update(patch).eq("id", res.unit.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Remove a villa from the project list. */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const res = await ownedUnit(String(body?.id ?? ""));
  if ("error" in res) return res.error;
  const { error } = await res.service.from("units").delete().eq("id", res.unit.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Import: update many villas at once from a spreadsheet, matched by villa number.
 * Only status and price change; villas are never created here (they are tied to the 3D maquette).
 */
export async function POST(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const complexId = String(body?.complexId ?? "");
  const rows: { villa: string; status?: string; price?: number }[] = Array.isArray(body?.rows) ? body.rows.slice(0, 2000) : [];
  const service = createServiceSupabase() ?? auth.supabase;
  const projects = await listComplexIdsForUser(service, auth.user.id);
  if (!projects.includes(complexId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rows.length) return NextResponse.json({ error: "No rows in that file" }, { status: 400 });

  const { data: units } = await service.from("units").select("id, display_id").eq("complex_id", complexId);
  const byVilla = new Map((units ?? []).map((u) => [String(u.display_id).trim().toLowerCase(), u.id as string]));

  let updated = 0;
  const missing: string[] = [];
  for (const r of rows) {
    const id = byVilla.get(String(r.villa ?? "").trim().toLowerCase());
    if (!id) {
      if (r.villa) missing.push(String(r.villa));
      continue;
    }
    const patch: { status?: UnitStatus; price?: number } = {};
    if (r.status && allowed.includes(r.status as UnitStatus)) patch.status = r.status as UnitStatus;
    const price = Math.round(Number(r.price));
    if (r.price !== undefined && Number.isFinite(price) && price >= 0 && price <= MAX_PRICE) patch.price = price;
    if (!Object.keys(patch).length) continue;
    const { error } = await service.from("units").update(patch).eq("id", id);
    if (!error) updated += 1;
  }
  return NextResponse.json({ ok: true, updated, missing: missing.slice(0, 20), missingCount: missing.length });
}
