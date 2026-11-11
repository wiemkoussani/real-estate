import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireClient } from "@/lib/client-auth";
import { createServiceSupabase } from "@/lib/supabase/service";
import { listComplexIdsForUser } from "@/lib/members";
import type { ComplexRow, LeadRow, ProjectStats, UnitRow } from "@/lib/types";

/** Count rows; 0 when the table/column is missing (migration 011 not applied yet). */
async function count(q: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: n, error } = await q;
  return error ? 0 : n ?? 0;
}

async function statsFor(service: SupabaseClient, cx: ComplexRow, lastSeen: string | null): Promise<ProjectStats> {
  const visits = () => service.from("complex_visits").select("id", { count: "exact", head: true }).eq("complex_id", cx.id);
  const leads = () => service.from("leads").select("id", { count: "exact", head: true }).eq("complex_id", cx.id);
  const [visitors, newVisitors, newLeads] = await Promise.all([
    count(visits()),
    count(lastSeen ? visits().gt("created_at", lastSeen) : visits()),
    count(lastSeen ? leads().gt("created_at", lastSeen) : leads()),
  ]);
  // badge: new visitors count once ("people came"), then +1 per person who filled the form
  const badge = (newVisitors > 0 ? 1 : 0) + newLeads;
  return { visitors, newVisitors, newLeads, badge, lastSeenAt: lastSeen };
}

/** Cover photo for the project card: first gallery image, else the first aerial frame. */
async function coversFor(service: SupabaseClient, ids: string[]) {
  const covers: Record<string, string> = {};
  const { data } = await service
    .from("assets")
    .select("complex_id, kind, path, sort_index")
    .in("complex_id", ids)
    .in("kind", ["gallery", "frame_low"])
    .order("sort_index")
    .limit(2000);
  for (const kind of ["gallery", "frame_low"]) {
    for (const a of data ?? []) {
      if (a.kind === kind && a.path && !covers[a.complex_id]) covers[a.complex_id] = a.path as string;
    }
  }
  return covers;
}

export async function GET() {
  const auth = await requireClient();
  if (!auth.ok) return auth.response;
  const service = createServiceSupabase() ?? auth.supabase;
  const ids = await listComplexIdsForUser(service, auth.user.id);

  const { data: profileRow } = await service.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();

  let list: ComplexRow[] = [];
  let units: UnitRow[] = [];
  let leads: LeadRow[] = [];
  const stats: Record<string, ProjectStats> = {};
  let covers: Record<string, string> = {};

  if (ids.length) {
    const { data: complexes, error } = await service.from("complexes").select("*").in("id", ids).order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    list = (complexes as ComplexRow[]) ?? [];

    const [{ data: unitRows }, { data: leadRows }, { data: memberRows }, coverMap] = await Promise.all([
      service.from("units").select("*").in("complex_id", ids).order("display_id"),
      service.from("leads").select("*").in("complex_id", ids).order("created_at", { ascending: false }).limit(5000),
      service.from("complex_members").select("*").eq("profile_id", auth.user.id),
      coversFor(service, ids),
    ]);
    units = (unitRows as UnitRow[]) ?? [];
    leads = (leadRows as LeadRow[]) ?? [];
    covers = coverMap;

    const seen = new Map<string, string | null>(
      (memberRows ?? []).map((m) => [m.complex_id as string, (m.last_seen_at as string | null | undefined) ?? null]),
    );
    const all = await Promise.all(list.map((cx) => statsFor(service, cx, seen.get(cx.id) ?? null)));
    list.forEach((cx, i) => {
      stats[cx.id] = all[i];
    });
  }

  return NextResponse.json({
    profile: {
      id: auth.user.id,
      email: auth.user.email,
      full_name: auth.profile.full_name,
      avatar_url: (profileRow?.avatar_url as string | null | undefined) ?? null,
    },
    complexes: list,
    units,
    leads,
    stats,
    covers,
  });
}
