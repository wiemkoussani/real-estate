import { NextResponse } from "next/server";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";

const STATUSES = ["new", "in_progress", "sold"] as const;

/** Only leads of this client's own projects can be touched. */
async function ownedLeadIds(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return { error: auth.response };
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).map(String).filter(Boolean).slice(0, 500) : [];
  if (!ids.length) return { error: NextResponse.json({ error: "No contacts" }, { status: 400 }) };
  const service = createServiceSupabase() ?? auth.supabase;
  const projects = await listComplexIdsForUser(service, auth.user.id);
  if (!projects.length) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { data } = await service.from("leads").select("id").in("id", ids).in("complex_id", projects);
  const allowed = (data ?? []).map((r) => r.id as string);
  if (allowed.length !== ids.length) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { service, ids: allowed, body };
}

export async function PATCH(req: Request) {
  const res = await ownedLeadIds(req);
  if ("error" in res) return res.error;
  const status = String(res.body?.status ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }
  const { error } = await res.service.from("leads").update({ status }).in("id", res.ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const res = await ownedLeadIds(req);
  if ("error" in res) return res.error;
  const { error } = await res.service.from("leads").delete().in("id", res.ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
