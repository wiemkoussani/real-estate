import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Unit } from "@/lib/complex";

type Body = { complexId: string; units?: Unit[]; payload?: { units?: Unit[] } };

function asUnits(raw: unknown): Unit[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as { units?: Unit[] };
  if (Array.isArray(obj.units)) return obj.units;
  if (Array.isArray(raw)) return raw as Unit[];
  return [];
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json()) as Body;
  if (!body.complexId) return NextResponse.json({ error: "Missing complex" }, { status: 400 });

  const units = body.units?.length ? body.units : asUnits(body.payload);
  if (!units.length) {
    return NextResponse.json({ error: "No units in that file. Use a JSON with a units array." }, { status: 400 });
  }

  const sb = createServiceSupabase() ?? auth.supabase;
  const rows = units.map((u) => ({
    complex_id: body.complexId,
    mesh_id: u.id,
    display_id: u.displayId,
    type: u.type,
    status: u.status,
    surface: u.surface,
    rooms: u.rooms,
    floor: u.floor,
    plan_path: u.planImage,
  }));

  const { error } = await sb.from("units").upsert(rows, { onConflict: "complex_id,mesh_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: rows.length });
}
