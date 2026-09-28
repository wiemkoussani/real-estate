import { NextResponse } from "next/server";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";
import type { ComplexRow, LeadRow, UnitRow } from "@/lib/types";

export async function GET() {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;
  const service = createServiceSupabase() ?? auth.supabase;
  const ids = await listComplexIdsForUser(service, auth.user.id);

  let list: ComplexRow[] = [];
  if (ids.length) {
    const { data: complexes, error } = await service.from("complexes").select("*").in("id", ids).order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    list = (complexes as ComplexRow[]) ?? [];
  }

  let units: UnitRow[] = [];
  let leads: LeadRow[] = [];
  if (ids.length) {
    const [{ data: unitRows }, { data: leadRows }] = await Promise.all([
      service.from("units").select("*").in("complex_id", ids).order("display_id"),
      service.from("leads").select("*").in("complex_id", ids).order("created_at", { ascending: false }).limit(300),
    ]);
    units = (unitRows as UnitRow[]) ?? [];
    leads = (leadRows as LeadRow[]) ?? [];
  }

  return NextResponse.json({
    profile: { id: auth.user.id, email: auth.user.email, full_name: auth.profile.full_name },
    complexes: list,
    units,
    leads,
  });
}
