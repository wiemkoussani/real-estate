import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

const ID_OK = /^[a-zA-Z0-9-]{8,64}$/;

/** Public tour opened: count 1 visitor per device per day (unique row in complex_visits). */
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
    if (profile?.role === "admin" || member) return NextResponse.json({ ok: true, skipped: true });
  }

  const { error } = await service
    .from("complex_visits")
    .upsert({ complex_id: cx.id, visitor_id: visitorId }, { onConflict: "complex_id,visitor_id,day", ignoreDuplicates: true });
  return NextResponse.json({ ok: !error });
}
