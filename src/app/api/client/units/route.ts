import { NextResponse } from "next/server";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";
import type { UnitStatus } from "@/lib/types";

const allowed: UnitStatus[] = ["available", "reserved", "sold"];

export async function PATCH(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;
  const body = await req.json();
  const id = String(body?.id ?? "");
  const status = body?.status as UnitStatus;
  if (!id || !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid unit or status" }, { status: 400 });
  }
  const { data: unit } = await auth.supabase.from("units").select("id, complex_id").eq("id", id).maybeSingle();
  if (!unit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const service = createServiceSupabase() ?? auth.supabase;
  const allowedIds = await listComplexIdsForUser(service, auth.user.id);
  if (!allowedIds.includes(unit.complex_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await service.from("units").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
