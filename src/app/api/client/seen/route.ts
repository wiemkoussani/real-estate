import { NextResponse } from "next/server";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";

/** The client opened a project from the dashboard: its badge and "+N new" start again from now. */
export async function POST(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const complexId = String(body?.complexId ?? "");
  const service = createServiceSupabase() ?? auth.supabase;
  const ids = await listComplexIdsForUser(service, auth.user.id);
  if (!ids.includes(complexId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { error } = await service
    .from("complex_members")
    .upsert({ complex_id: complexId, profile_id: auth.user.id, last_seen_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
